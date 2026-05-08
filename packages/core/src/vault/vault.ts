import type { FilesystemAdapter } from '../adapters/filesystem.js';
import type { IndexStoreAdapter, OutgoingWikilink } from '../adapters/index-store.js';
import type { NotePath } from '../types/note.js';
import { loadNote } from './note.js';
import { INDEX_DIR_NAME } from '../index-store/schema.js';

/**
 * Directory names always skipped during a vault scan.
 *
 * - `.synapsium/` is our own metadata folder (SQLite cache, future settings)
 * - `node_modules/` is a frequent foot-gun if the user ever points the
 *   vault at a code project
 * - any dotfile dir is skipped on principle (`.git`, `.obsidian`, …)
 */
const SKIP_DIRS = new Set<string>([INDEX_DIR_NAME, 'node_modules']);

function shouldSkipDir(name: string): boolean {
  if (SKIP_DIRS.has(name)) return true;
  if (name.startsWith('.')) return true;
  return false;
}

/**
 * Recursive walk of the vault yielding every `.md` file as a vault-relative
 * `NotePath`. Implemented with an explicit work queue (not recursion) so a
 * deeply nested vault doesn't blow the call stack.
 */
export async function* scanVault(
  fs: FilesystemAdapter,
  vaultRoot: string,
): AsyncGenerator<NotePath> {
  const queue: string[] = [vaultRoot];
  while (queue.length > 0) {
    const dir = queue.shift()!;
    let entries;
    try {
      entries = await fs.readDir(dir);
    } catch {
      // Unreadable dir (perms, gone): skip silently rather than abort the scan.
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory) {
        if (shouldSkipDir(e.name)) continue;
        queue.push(fs.resolveAbsolute(vaultRoot, e.path));
        continue;
      }
      if (!e.name.endsWith('.md')) continue;
      yield e.path;
    }
  }
}

export type IndexResult = { count: number };

/**
 * Full reindex: clear store, walk the vault, parse every note, persist
 * notes + wikilinks. Two-pass for wikilink resolution because target paths
 * are only known after we've seen every note's title.
 *
 * Pass 1: upsert every note, save its outgoing wikilinks with `targetPath: null`.
 * Pass 2: for each source, look up the target title in the store and
 *         rewrite its wikilink rows with the resolved paths.
 *
 * `onProgress` fires once per file in pass 1.
 */
export async function indexVault(
  fs: FilesystemAdapter,
  indexStore: IndexStoreAdapter,
  vaultRoot: string,
  onProgress?: (count: number) => void,
): Promise<IndexResult> {
  await indexStore.clear();

  // Pass 1: notes + raw wikilinks (unresolved).
  const sources: { path: NotePath; targets: string[] }[] = [];
  let count = 0;
  for await (const path of scanVault(fs, vaultRoot)) {
    let note;
    try {
      note = await loadNote(fs, vaultRoot, path);
    } catch {
      // Single bad file shouldn't kill the whole index.
      continue;
    }
    await indexStore.upsertNote({
      path: note.path,
      title: note.title,
      frontmatter: note.frontmatter,
      wikilinks: note.wikilinks,
      mtimeMs: note.mtimeMs,
    });
    if (note.wikilinks.length > 0) {
      sources.push({ path: note.path, targets: note.wikilinks });
    }
    count++;
    onProgress?.(count);
  }

  // Pass 2: resolve each source's wikilinks now that all titles are known.
  for (const src of sources) {
    const links: OutgoingWikilink[] = [];
    for (const target of src.targets) {
      const resolved = await indexStore.resolveTitleToPath(target);
      links.push({ targetTitle: target, targetPath: resolved });
    }
    await indexStore.replaceWikilinks(src.path, links);
  }

  return { count };
}
