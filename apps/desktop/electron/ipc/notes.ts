// Note-level IPC handlers: list / load / save / create / rename / delete /
// search-by-title.
//
// All paths from the renderer are vault-relative NotePaths (forward
// slashes). `assertVaultRelative` rejects anything that could escape the
// vault before we touch the filesystem; `assertResolvedWithinVault` is a
// belt-and-braces check after `path.resolve`.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import {
  deriveTitleFromPath,
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
  type OutgoingWikilink,
} from '@synapsium/core';
import { getFilesystemAdapter } from '../adapters/filesystem.electron.js';
import { assertResolvedWithinVault, assertVaultRelative, IpcError } from '../security.js';
import { markSelfWrite, requireIndexStore, requireVault } from '../state.js';

const SEARCH_LIMIT_DEFAULT = 20;
const SEARCH_LIMIT_MAX = 100;

export async function listNotes(): Promise<NoteSummary[]> {
  return requireIndexStore().listNotes();
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

  const links: OutgoingWikilink[] = [];
  for (const target of wikilinks) {
    const resolved = await store.resolveTitleToPath(target);
    links.push({ targetTitle: target, targetPath: resolved });
  }
  await store.replaceWikilinks(filePath, links);
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

  // Update the index. v0.1: we don't rewrite wikilinks in other files that
  // pointed at the old path -- that's a v0.2 feature.
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
  const links: OutgoingWikilink[] = [];
  for (const target of note.wikilinks) {
    const resolved = await store.resolveTitleToPath(target);
    links.push({ targetTitle: target, targetPath: resolved });
  }
  await store.replaceWikilinks(args.to, links);

  const contentTags = extractTags(note.content);
  const mergedTags = mergeTagsFromFrontmatter(note.frontmatter, contentTags);
  await store.replaceTags(args.to, mergedTags);

  // Carry typed properties over to the new path. The CASCADE delete on
  // `deleteNote(args.from)` already wiped the old rows.
  await store.replaceProperties(args.to, extractProperties(note.frontmatter));

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
