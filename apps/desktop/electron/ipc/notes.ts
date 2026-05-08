// Note-level IPC handlers: list / load / save / create / rename / delete /
// search-by-title.
//
// All paths from the renderer are vault-relative NotePaths (forward
// slashes). We resolve to absolute via the filesystem adapter immediately
// to keep platform-specific separators contained.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import {
  deriveTitleFromPath,
  extractWikilinks,
  getFrontmatterTitle,
  loadNote as coreLoadNote,
  parseMarkdown,
  saveNote as coreSaveNote,
  type Frontmatter,
  type Note,
  type NotePath,
  type NoteSummary,
  type OutgoingWikilink,
} from '@synapsium/core';
import { getFilesystemAdapter } from '../adapters/filesystem.electron.js';
import { requireIndexStore, requireVault } from '../state.js';

export async function listNotes(): Promise<NoteSummary[]> {
  return requireIndexStore().listNotes();
}

export async function loadNote(args: { path: NotePath }): Promise<Note> {
  const vault = requireVault();
  const fs = getFilesystemAdapter();
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

  await store.upsertNote({
    path: filePath,
    title,
    frontmatter,
    wikilinks,
    mtimeMs,
  });

  const links: OutgoingWikilink[] = [];
  for (const target of wikilinks) {
    const resolved = await store.resolveTitleToPath(target);
    links.push({ targetTitle: target, targetPath: resolved });
  }
  await store.replaceWikilinks(filePath, links);
}

export async function saveNote(args: {
  path: NotePath;
  body: string;
  frontmatter: Frontmatter;
}): Promise<{ mtimeMs: number }> {
  const vault = requireVault();
  const fs = getFilesystemAdapter();

  await coreSaveNote(fs, vault.root, args.path, args.body, args.frontmatter);

  // Re-stat to get the freshly-written mtime. We could trust Date.now() but
  // the FS-reported value is what the watcher / index will see, so use it
  // for consistency.
  const abs = fs.resolveAbsolute(vault.root, args.path);
  const st = await fs.stat(abs);

  await reindexSingle(args.path, args.body, args.frontmatter, st.mtimeMs);

  return { mtimeMs: st.mtimeMs };
}

export async function createNote(args: {
  path: NotePath;
  initialBody?: string;
}): Promise<Note> {
  const vault = requireVault();
  const fs = getFilesystemAdapter();
  const abs = fs.resolveAbsolute(vault.root, args.path);

  // Refuse to clobber an existing file -- the renderer should pick a
  // unique name (e.g. by appending " 2" or similar) before calling.
  if (await fs.exists(abs)) {
    throw new Error(`Note already exists: ${args.path}`);
  }

  const parent = path.dirname(abs);
  await fsp.mkdir(parent, { recursive: true });

  const body = args.initialBody ?? '';
  const frontmatter: Frontmatter = {};
  await coreSaveNote(fs, vault.root, args.path, body, frontmatter);

  const st = await fs.stat(abs);
  await reindexSingle(args.path, body, frontmatter, st.mtimeMs);

  const title =
    parseMarkdown(body).headingTitle ?? deriveTitleFromPath(args.path);

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
  const vault = requireVault();
  const fs = getFilesystemAdapter();
  const store = requireIndexStore();

  const fromAbs = fs.resolveAbsolute(vault.root, args.from);
  const toAbs = fs.resolveAbsolute(vault.root, args.to);

  if (await fs.exists(toAbs)) {
    throw new Error(`Destination already exists: ${args.to}`);
  }

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
  });
  const links: OutgoingWikilink[] = [];
  for (const target of note.wikilinks) {
    const resolved = await store.resolveTitleToPath(target);
    links.push({ targetTitle: target, targetPath: resolved });
  }
  await store.replaceWikilinks(args.to, links);

  return { newPath: args.to };
}

export async function deleteNote(args: { path: NotePath }): Promise<void> {
  const vault = requireVault();
  const fs = getFilesystemAdapter();
  const store = requireIndexStore();

  const abs = fs.resolveAbsolute(vault.root, args.path);
  await fs.deleteFile(abs);
  await store.deleteNote(args.path);
}

export async function searchByTitle(args: {
  prefix: string;
  limit?: number;
}): Promise<NoteSummary[]> {
  const store = requireIndexStore();
  return store.searchNotesByTitle(args.prefix, args.limit ?? 20);
}
