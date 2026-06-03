// File/folder actions that do not fit neatly into CRUD buckets.
// Paths from the renderer are vault-relative and validated before they
// touch the shell or filesystem.

import path from 'node:path';
import { shell } from 'electron';
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
  type ResolvedRelation,
} from '@ziba/core';
import { getFilesystemAdapter } from '../adapters/filesystem.electron.js';
import { assertResolvedWithinVault, assertVaultRelative } from '../security.js';
import { markSelfWrite, requireIndexStore, requireVault } from '../state.js';

function uniqueCopyPath(original: NotePath, exists: (path: NotePath) => Promise<boolean>) {
  const dir = path.posix.dirname(original);
  const ext = path.posix.extname(original) || '.md';
  const base = path.posix.basename(original, ext);
  const prefix = dir === '.' ? '' : `${dir}/`;

  return async (): Promise<NotePath> => {
    let n = 1;
    while (true) {
      const suffix = n === 1 ? ' copy' : ` copy ${n}`;
      const candidate = `${prefix}${base}${suffix}${ext}`;
      if (!(await exists(candidate))) return candidate;
      n += 1;
    }
  };
}

async function reindexCopiedNote(
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

  await store.upsertNote({
    path: filePath,
    title,
    frontmatter,
    wikilinks: extractWikilinks(body),
    mtimeMs,
    body,
  });

  const allRelations = extractAllRelations({ frontmatter, content: body });
  const resolved: ResolvedRelation[] = [];
  for (const r of allRelations) {
    const targetPath = await store.resolveTitleToPath(r.targetTitle);
    resolved.push({ kind: r.kind, targetTitle: r.targetTitle, targetPath });
  }
  await store.replaceRelations(filePath, resolved);

  const contentTags = extractTags(body);
  await store.replaceTags(filePath, mergeTagsFromFrontmatter(frontmatter, contentTags));
  await store.replaceProperties(filePath, extractProperties(frontmatter));
}

export async function duplicateNote(args: { path: NotePath }): Promise<Note> {
  assertVaultRelative(args.path);
  const vault = requireVault();
  const fs = getFilesystemAdapter();
  const sourceAbs = fs.resolveAbsolute(vault.root, args.path);
  assertResolvedWithinVault(vault.root, sourceAbs);

  const source = await coreLoadNote(fs, vault.root, args.path);
  const nextPath = await uniqueCopyPath(args.path, async (candidate) => {
    const abs = fs.resolveAbsolute(vault.root, candidate);
    assertResolvedWithinVault(vault.root, abs);
    return fs.exists(abs);
  })();

  markSelfWrite(nextPath);
  await coreSaveNote(fs, vault.root, nextPath, source.content, source.frontmatter);
  const copyAbs = fs.resolveAbsolute(vault.root, nextPath);
  const st = await fs.stat(copyAbs);
  await reindexCopiedNote(nextPath, source.content, source.frontmatter, st.mtimeMs);

  return {
    ...source,
    path: nextPath,
    title:
      getFrontmatterTitle(source.frontmatter) ??
      parseMarkdown(source.content).headingTitle ??
      deriveTitleFromPath(nextPath),
    mtimeMs: st.mtimeMs,
  };
}

export async function showInFinder(args: { path: NotePath }): Promise<void> {
  assertVaultRelative(args.path);
  const vault = requireVault();
  const fs = getFilesystemAdapter();
  const abs = fs.resolveAbsolute(vault.root, args.path);
  assertResolvedWithinVault(vault.root, abs);
  shell.showItemInFolder(abs);
}
