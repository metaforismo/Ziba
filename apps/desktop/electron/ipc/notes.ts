// Note-level IPC handlers: list / load / save / create / rename / delete /
// search-by-title.
//
// All paths from the renderer are vault-relative NotePaths (forward
// slashes). `assertVaultRelative` rejects anything that could escape the
// vault before we touch the filesystem; `assertResolvedWithinVault` is a
// belt-and-braces check after `path.resolve`.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import {
  deriveTitleFromPath,
  extractAllRelations,
  extractProperties,
  extractTags,
  extractWikilinks,
  getFrontmatterTitle,
  loadNote as coreLoadNote,
  mergeTagsFromFrontmatter,
  parseMarkdown,
  saveNote as coreSaveNote,
  type Frontmatter,
  type Note,
  type NotePath,
  type NoteSummary,
  type ResolvedRelation,
} from '@ziba/core';
import { getFilesystemAdapter } from '../adapters/filesystem.electron.js';
import { IpcChannels, type VaultEventPayload } from '../../shared/ipc.js';
import { assertResolvedWithinVault, assertVaultRelative, IpcError } from '../security.js';
import { getEmbeddingIndexer, markSelfWrite, requireIndexStore, requireVault } from '../state.js';

/**
 * Push a synthetic 'change' vault event to the renderer after a
 * renderer-initiated write. The chokidar watcher suppresses its own echo
 * for self-writes via `consumeIfSelfWrite`, so without this push the stores
 * that depend on `onVaultEvent` (typedPaths, tags, database) would stay
 * stale until the next external filesystem event.
 */
function pushSyntheticChangeEvent(notePath: NotePath, mtimeMs: number): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win !== undefined && !win.isDestroyed()) {
    win.webContents.send(IpcChannels.vaultEvent, {
      type: 'change',
      path: notePath,
      mtimeMs,
    } satisfies VaultEventPayload);
  }
}

const SEARCH_LIMIT_DEFAULT = 20;
const SEARCH_LIMIT_MAX = 100;

export async function listNotes(): Promise<NoteSummary[]> {
  return requireIndexStore().listNotes();
}

export async function getTypedPaths(): Promise<Array<[NotePath, string]>> {
  const map = await requireIndexStore().getTypedPaths();
  return Array.from(map.entries());
}

export async function loadNote(args: { path: NotePath }): Promise<Note> {
  assertVaultRelative(args.path);
  const vault = requireVault();
  const fs = getFilesystemAdapter();
  const abs = fs.resolveAbsolute(vault.root, args.path);
  assertResolvedWithinVault(vault.root, abs);
  return coreLoadNote(fs, vault.root, args.path);
}

/**
 * Reindex a single note after a write/create. Re-extracts wikilinks and
 * resolves their target paths through the index store. Centralised so
 * createNote / saveNote share the same logic.
 */
async function reindexSingle(
  filePath: NotePath,
  body: string,
  frontmatter: Frontmatter,
  mtimeMs: number,
): Promise<void> {
  const store = requireIndexStore();

  const title =
    getFrontmatterTitle(frontmatter) ??
    parseMarkdown(body).headingTitle ??
    deriveTitleFromPath(filePath);

  const wikilinks = extractWikilinks(body);
  const contentTags = extractTags(body);
  const mergedTags = mergeTagsFromFrontmatter(frontmatter, contentTags);

  // Pass body so the FTS5 mirror picks up the latest content. Without it,
  // search:fullText would return stale snippets for this note.
  await store.upsertNote({
    path: filePath,
    title,
    frontmatter,
    wikilinks,
    mtimeMs,
    body,
  });

  // v1.0: extract typed relations (frontmatter `relations:` map +
  // body wikilinks as `kind = ''`). Resolve each target_title to a
  // path so the renderer can navigate without re-resolving on every
  // read.
  const allRelations = extractAllRelations({ frontmatter, content: body });
  const resolved: ResolvedRelation[] = [];
  for (const r of allRelations) {
    const targetPath = await store.resolveTitleToPath(r.targetTitle);
    resolved.push({ kind: r.kind, targetTitle: r.targetTitle, targetPath });
  }
  await store.replaceRelations(filePath, resolved);
  await store.replaceTags(filePath, mergedTags);

  // Typed property index (v0.3 Wave 1). Drops unsupported values silently
  // -- those won't be queryable, but we keep them in the original
  // frontmatter_json for round-tripping.
  await store.replaceProperties(filePath, extractProperties(frontmatter));
}

export async function saveNote(args: {
  path: NotePath;
  body: string;
  frontmatter: Frontmatter;
}): Promise<{ mtimeMs: number }> {
  assertVaultRelative(args.path);
  const vault = requireVault();
  const fs = getFilesystemAdapter();
  const abs = fs.resolveAbsolute(vault.root, args.path);
  assertResolvedWithinVault(vault.root, abs);

  // Mark BEFORE the write so the watcher's echo (which can fire before
  // `coreSaveNote` resolves on slow disks) gets suppressed.
  markSelfWrite(args.path);

  await coreSaveNote(fs, vault.root, args.path, args.body, args.frontmatter);

  // Re-stat to get the freshly-written mtime. We could trust Date.now() but
  // the FS-reported value is what the watcher / index will see, so use it
  // for consistency.
  const st = await fs.stat(abs);

  await reindexSingle(args.path, args.body, args.frontmatter, st.mtimeMs);

  // The watcher suppressed its own echo for this write. Push a synthetic
  // change event so the renderer's onVaultEvent fires and refreshes
  // typedPaths, tags, and the database store.
  pushSyntheticChangeEvent(args.path, st.mtimeMs);

  // AI: queue a (re)embed for this note. Debounced + skipped if the
  // content hash is unchanged. No-op when the feature is disabled.
  getEmbeddingIndexer()?.enqueue(args.path);

  return { mtimeMs: st.mtimeMs };
}

export async function createNote(args: { path: NotePath; initialBody?: string }): Promise<Note> {
  assertVaultRelative(args.path);
  const vault = requireVault();
  const fs = getFilesystemAdapter();
  const abs = fs.resolveAbsolute(vault.root, args.path);
  assertResolvedWithinVault(vault.root, abs);

  // Refuse to clobber an existing file -- the renderer should pick a
  // unique name (e.g. by appending " 2" or similar) before calling.
  if (await fs.exists(abs)) {
    throw new IpcError('ALREADY_EXISTS', `Una nota a "${args.path}" esiste già.`);
  }

  const parent = path.dirname(abs);
  await fsp.mkdir(parent, { recursive: true });

  markSelfWrite(args.path);

  const body = args.initialBody ?? '';
  const frontmatter: Frontmatter = {};
  await coreSaveNote(fs, vault.root, args.path, body, frontmatter);

  const st = await fs.stat(abs);
  await reindexSingle(args.path, body, frontmatter, st.mtimeMs);

  // Watcher echo suppressed for this write. Push a synthetic add/change
  // event so the renderer learns about the new file immediately.
  pushSyntheticChangeEvent(args.path, st.mtimeMs);

  // AI: queue an embed for the new note. No-op when disabled.
  getEmbeddingIndexer()?.enqueue(args.path);

  const title = parseMarkdown(body).headingTitle ?? deriveTitleFromPath(args.path);

  return {
    path: args.path,
    title,
    frontmatter,
    content: body,
    wikilinks: extractWikilinks(body),
    mtimeMs: st.mtimeMs,
  };
}

export async function renameNote(args: {
  from: NotePath;
  to: NotePath;
}): Promise<{ newPath: NotePath }> {
  assertVaultRelative(args.from);
  assertVaultRelative(args.to);
  const vault = requireVault();
  const fs = getFilesystemAdapter();
  const store = requireIndexStore();

  const fromAbs = fs.resolveAbsolute(vault.root, args.from);
  const toAbs = fs.resolveAbsolute(vault.root, args.to);
  assertResolvedWithinVault(vault.root, fromAbs);
  assertResolvedWithinVault(vault.root, toAbs);

  if (await fs.exists(toAbs)) {
    throw new IpcError('ALREADY_EXISTS', `La destinazione "${args.to}" esiste già.`);
  }

  markSelfWrite(args.from);
  markSelfWrite(args.to);
  await fs.rename(fromAbs, toAbs);

  // Move the note's index entry from old → new path.
  const note = await coreLoadNote(fs, vault.root, args.to);
  await store.deleteNote(args.from);
  await store.upsertNote({
    path: note.path,
    title: note.title,
    frontmatter: note.frontmatter,
    wikilinks: note.wikilinks,
    mtimeMs: note.mtimeMs,
    body: note.content,
  });
  const allRelations = extractAllRelations({
    frontmatter: note.frontmatter,
    content: note.content,
  });
  const resolved: ResolvedRelation[] = [];
  for (const r of allRelations) {
    const targetPath = await store.resolveTitleToPath(r.targetTitle);
    resolved.push({ kind: r.kind, targetTitle: r.targetTitle, targetPath });
  }
  await store.replaceRelations(args.to, resolved);

  const contentTags = extractTags(note.content);
  const mergedTags = mergeTagsFromFrontmatter(note.frontmatter, contentTags);
  await store.replaceTags(args.to, mergedTags);

  // Carry typed properties over to the new path. The CASCADE delete on
  // `deleteNote(args.from)` already wiped the old rows.
  await store.replaceProperties(args.to, extractProperties(note.frontmatter));

  // v0.3 fix: every inbound wikilink that resolved to the old path is now
  // stale — the old path no longer exists in `notes`. Re-resolve them by
  // title against the current index (which already reflects the new
  // path). The result lands on the new path when the title is unchanged,
  // on a different note when the title is now ambiguous, or on null
  // (broken) when the title changed during the rename. Without this,
  // backlinks and the global graph silently lose every inbound edge to
  // the renamed note.
  await store.reresolveStaleWikilinks(args.from);

  // AI: drop the old path's embedding and queue a re-embed at the new path.
  await getEmbeddingIndexer()?.rename(args.from, args.to);

  return { newPath: args.to };
}

export async function deleteNote(args: { path: NotePath }): Promise<void> {
  assertVaultRelative(args.path);
  const vault = requireVault();
  const fs = getFilesystemAdapter();
  const store = requireIndexStore();

  const abs = fs.resolveAbsolute(vault.root, args.path);
  assertResolvedWithinVault(vault.root, abs);

  markSelfWrite(args.path);
  await fs.deleteFile(abs);
  await store.deleteNote(args.path);

  // AI: drop this note's embedding too. No-op when disabled / absent.
  await getEmbeddingIndexer()?.remove(args.path);
}

export async function searchByTitle(args: {
  prefix: string;
  limit?: number;
}): Promise<NoteSummary[]> {
  const store = requireIndexStore();
  // Clamp the limit at the boundary so a malicious renderer can't ask for
  // millions of rows. The interface enforces non-null at the type level,
  // but defence in depth is cheap here.
  const requested = args.limit ?? SEARCH_LIMIT_DEFAULT;
  const limit = Math.max(1, Math.min(requested, SEARCH_LIMIT_MAX));
  return store.searchNotesByTitle(args.prefix, limit);
}
