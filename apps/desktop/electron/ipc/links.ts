// Backlinks + title resolution for the renderer.
//
// `getBacklinks` reads the index, then opens each source note to compute
// a short context snippet around the wikilink occurrence -- the renderer
// uses this to give users a preview of where their note is referenced.

import { loadNote as coreLoadNote, type IndexStoreAdapter, type NotePath } from '@ziba/core';
import type { Backlink, LinkReference, LinkReferencesResult } from '../../shared/ipc.js';
import { getFilesystemAdapter } from '../adapters/filesystem.electron.js';
import { assertResolvedWithinVault, assertVaultRelative } from '../security.js';
import { requireIndexStore, requireVault } from '../state.js';

const CONTEXT_RADIUS = 80;
const MENTION_LIMIT = 80;

type BacklinkRowWithTitle = {
  sourcePath: NotePath;
  targetTitle: string;
  sourceTitle: string;
};

type BacklinkTitleStore = {
  getBacklinksWithSourceTitle(targetPath: NotePath): BacklinkRowWithTitle[];
};

function hasBacklinkTitles(
  store: IndexStoreAdapter,
): store is IndexStoreAdapter & BacklinkTitleStore {
  return typeof (store as Partial<BacklinkTitleStore>).getBacklinksWithSourceTitle === 'function';
}

/**
 * Find the first `[[target...]]` occurrence whose pre-pipe text starts with
 * `target` (case-insensitive) inside `body`. Returns a snippet of up to
 * 2*CONTEXT_RADIUS chars centred on the wikilink, with ellipses on either
 * side if truncated. Newlines collapsed to single spaces for readability.
 */
function buildContextSnippet(body: string, target: string): string | undefined {
  const targetLower = target.toLowerCase();
  // Cheap scan: find every `[[` and inspect.
  let i = 0;
  while (i < body.length) {
    const open = body.indexOf('[[', i);
    if (open === -1) return undefined;
    const close = body.indexOf(']]', open + 2);
    if (close === -1) return undefined;
    const inner = body.slice(open + 2, close);
    const pipe = inner.indexOf('|');
    const rawTarget = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    // Strip heading/block ref so [[Foo#Heading]] still matches "Foo".
    const hash = rawTarget.indexOf('#');
    const cleanedTarget = (hash === -1 ? rawTarget : rawTarget.slice(0, hash)).trim().toLowerCase();
    if (cleanedTarget === targetLower) {
      const start = Math.max(0, open - CONTEXT_RADIUS);
      const end = Math.min(body.length, close + 2 + CONTEXT_RADIUS);
      let snippet = body.slice(start, end).replace(/\s+/g, ' ').trim();
      if (start > 0) snippet = '...' + snippet;
      if (end < body.length) snippet = snippet + '...';
      return snippet;
    }
    i = close + 2;
  }
  return undefined;
}

async function getBacklinkRows(
  store: IndexStoreAdapter,
  targetPath: NotePath,
): Promise<BacklinkRowWithTitle[]> {
  if (hasBacklinkTitles(store)) {
    return store.getBacklinksWithSourceTitle(targetPath);
  }
  return (await store.getBacklinks(targetPath)).map((r) => ({
    ...r,
    sourceTitle: r.sourcePath,
  }));
}

async function getBacklinkReferences(path: NotePath): Promise<LinkReference[]> {
  assertVaultRelative(path);
  const vault = requireVault();
  const fs = getFilesystemAdapter();
  const store = requireIndexStore();
  assertResolvedWithinVault(vault.root, fs.resolveAbsolute(vault.root, path));

  const rows = await getBacklinkRows(store, path);
  const out: LinkReference[] = [];
  for (const r of rows) {
    let context: string | undefined;
    try {
      const note = await coreLoadNote(fs, vault.root, r.sourcePath);
      context = buildContextSnippet(note.content, r.targetTitle);
    } catch {
      // Source file may have moved/disappeared between index and read.
      // Skip context but keep the row -- the index is the source of truth
      // for "what links here" until the next reindex.
    }
    out.push({
      kind: 'backlink',
      sourcePath: r.sourcePath,
      sourceTitle: r.sourceTitle,
      ...(context !== undefined ? { context } : {}),
    });
  }
  return out;
}

export async function getBacklinks(args: { path: NotePath }): Promise<Backlink[]> {
  const references = await getBacklinkReferences(args.path);
  return references.map(({ sourcePath, sourceTitle, context }) => ({
    sourcePath,
    sourceTitle,
    ...(context !== undefined ? { context } : {}),
  }));
}

export async function getReferences(args: { path: NotePath }): Promise<LinkReferencesResult> {
  assertVaultRelative(args.path);
  const vault = requireVault();
  const fs = getFilesystemAdapter();
  const store = requireIndexStore();
  assertResolvedWithinVault(vault.root, fs.resolveAbsolute(vault.root, args.path));

  const backlinks = await getBacklinkReferences(args.path);
  const target = await store.getNote(args.path);
  const title = target?.title.trim() ?? '';
  if (title.length === 0) {
    return { backlinks, mentions: [] };
  }

  const explicitSources = new Set(backlinks.map((link) => link.sourcePath));
  const seenMentions = new Set<NotePath>();
  const mentions: LinkReference[] = [];
  const hits = await store.searchFullText(title, MENTION_LIMIT);

  for (const hit of hits) {
    if (hit.path === args.path) continue;
    if (explicitSources.has(hit.path)) continue;
    if (seenMentions.has(hit.path)) continue;
    seenMentions.add(hit.path);
    mentions.push({
      kind: 'mention',
      sourcePath: hit.path,
      sourceTitle: hit.title,
      context: hit.snippet,
    });
  }

  return { backlinks, mentions };
}

export async function resolveTitle(args: { title: string }): Promise<NotePath | null> {
  return requireIndexStore().resolveTitleToPath(args.title);
}
