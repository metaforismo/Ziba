// Folder operations: create / rename / delete.
//
// Rename and delete must update every indexed note inside the affected
// subtree, since their paths change (rename) or disappear (delete). For
// v0.1 we just walk the index and patch rows; we don't rewrite wikilinks
// in other files that referenced the moved notes.

import {
  extractAllRelations,
  loadNote as coreLoadNote,
  type NotePath,
  type ResolvedRelation,
} from '@ziba/core';
import { getFilesystemAdapter } from '../adapters/filesystem.electron.js';
import { assertResolvedWithinVault, assertVaultRelative, IpcError } from '../security.js';
import { markSelfWrite, requireIndexStore, requireVault } from '../state.js';

function ensureTrailingSlash(p: string): string {
  return p.endsWith('/') ? p : p + '/';
}

function shouldSkipDir(name: string): boolean {
  return name === '.ziba' || name === 'node_modules' || name.startsWith('.');
}

export async function listFolders(): Promise<string[]> {
  const vault = requireVault();
  const fs = getFilesystemAdapter();
  const queue: string[] = [vault.root];
  const folders: string[] = [];

  while (queue.length > 0) {
    const dir = queue.shift()!;
    let entries;
    try {
      entries = await fs.readDir(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory) continue;
      if (shouldSkipDir(entry.name)) continue;
      folders.push(entry.path);
      queue.push(fs.resolveAbsolute(vault.root, entry.path));
    }
  }

  return folders.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export async function createFolder(args: { path: NotePath }): Promise<void> {
  assertVaultRelative(args.path);
  const vault = requireVault();
  const fs = getFilesystemAdapter();
  const abs = fs.resolveAbsolute(vault.root, args.path);
  assertResolvedWithinVault(vault.root, abs);
  await fs.mkdir(abs, { recursive: true });
}

export async function renameFolder(args: { from: NotePath; to: NotePath }): Promise<void> {
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
    throw new IpcError('ALREADY_EXISTS', `La cartella "${args.to}" esiste già.`);
  }

  await fs.rename(fromAbs, toAbs);

  // Patch the index: any note whose path starts with `<from>/` is now at
  // `<to>/...`. We do this by listing all notes (cheap -- the table is
  // small relative to RAM in v0.1) and filtering in memory.
  const fromPrefix = ensureTrailingSlash(args.from);
  const toPrefix = ensureTrailingSlash(args.to);

  const all = await store.listNotes();
  const affected = all.filter((n) => n.path.startsWith(fromPrefix));

  for (const summary of affected) {
    const newPath = toPrefix + summary.path.slice(fromPrefix.length);
    markSelfWrite(summary.path);
    markSelfWrite(newPath);
    let reloaded;
    try {
      reloaded = await coreLoadNote(fs, vault.root, newPath);
    } catch {
      // If reload fails we still need to remove the stale entry.
      await store.deleteNote(summary.path);
      continue;
    }
    await store.deleteNote(summary.path);
    await store.upsertNote({
      path: reloaded.path,
      title: reloaded.title,
      frontmatter: reloaded.frontmatter,
      wikilinks: reloaded.wikilinks,
      mtimeMs: reloaded.mtimeMs,
    });
    // Re-resolve outgoing relations (target paths might now be
    // different if the moved note's title shadows or unshadows another
    // note).
    const allRelations = extractAllRelations({
      frontmatter: reloaded.frontmatter,
      content: reloaded.content,
    });
    const resolved: ResolvedRelation[] = [];
    for (const r of allRelations) {
      const targetPath = await store.resolveTitleToPath(r.targetTitle);
      resolved.push({ kind: r.kind, targetTitle: r.targetTitle, targetPath });
    }
    await store.replaceRelations(reloaded.path, resolved);
    // Re-resolve INBOUND wikilinks that pointed at the old path. Same
    // reasoning as renameNote: without this, backlinks + global graph
    // would silently drop every edge into a folder-renamed note.
    await store.reresolveStaleWikilinks(summary.path);
  }
}

export async function deleteFolder(args: { path: NotePath }): Promise<void> {
  assertVaultRelative(args.path);
  const vault = requireVault();
  const fs = getFilesystemAdapter();
  const store = requireIndexStore();

  const abs = fs.resolveAbsolute(vault.root, args.path);
  assertResolvedWithinVault(vault.root, abs);

  await fs.rmdir(abs, { recursive: true });

  // Drop every index row inside the folder.
  const prefix = ensureTrailingSlash(args.path);
  const all = await store.listNotes();
  for (const summary of all) {
    if (summary.path.startsWith(prefix)) {
      markSelfWrite(summary.path);
      await store.deleteNote(summary.path);
    }
  }
}
