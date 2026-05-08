import type { FilesystemAdapter } from '../adapters/filesystem.js';
import type { Frontmatter, Note, NotePath } from '../types/note.js';
import { getFrontmatterTitle } from '../types/frontmatter.js';
import { parseMarkdown } from '../markdown/parse.js';
import { serializeMarkdown } from '../markdown/serialize.js';
import { extractWikilinks } from '../markdown/wikilinks.js';

/**
 * Title from a vault path: basename minus `.md`.
 * Forward-slash convention means we just split on `/`.
 */
export function deriveTitleFromPath(path: NotePath): string {
  const parts = path.split('/');
  const last = parts[parts.length - 1] ?? path;
  return last.endsWith('.md') ? last.slice(0, -3) : last;
}

/**
 * Read a note from disk and produce a fully populated `Note`.
 * Title resolution: frontmatter.title → first heading → filename.
 */
export async function loadNote(
  fs: FilesystemAdapter,
  vaultRoot: string,
  path: NotePath,
): Promise<Note> {
  const abs = fs.resolveAbsolute(vaultRoot, path);
  const [raw, st] = await Promise.all([fs.readFile(abs), fs.stat(abs)]);
  const { frontmatter, body, headingTitle } = parseMarkdown(raw);
  const title =
    getFrontmatterTitle(frontmatter) ?? headingTitle ?? deriveTitleFromPath(path);
  const wikilinks = extractWikilinks(body);
  return {
    path,
    title,
    frontmatter,
    content: body,
    wikilinks,
    mtimeMs: st.mtimeMs,
  };
}

/**
 * Write a note to disk. Creates intermediate directories as needed so that
 * "new note in a fresh folder" works without the caller pre-creating the
 * directory tree.
 */
export async function saveNote(
  fs: FilesystemAdapter,
  vaultRoot: string,
  path: NotePath,
  body: string,
  frontmatter: Frontmatter,
): Promise<void> {
  const abs = fs.resolveAbsolute(vaultRoot, path);
  const lastSlash = abs.lastIndexOf('/');
  const lastBackslash = abs.lastIndexOf('\\');
  const sepIdx = Math.max(lastSlash, lastBackslash);
  if (sepIdx > 0) {
    const dir = abs.slice(0, sepIdx);
    await fs.mkdir(dir, { recursive: true });
  }
  const content = serializeMarkdown(frontmatter, body);
  await fs.writeFile(abs, content);
}
