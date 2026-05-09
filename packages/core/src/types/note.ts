/**
 * A vault-relative path using forward slashes (POSIX-style), e.g.
 * "projects/ziba.md". Always relative to the vault root, never absolute.
 * Adapters are responsible for converting to/from platform-specific paths.
 */
export type NotePath = string;

/**
 * Parsed YAML frontmatter as a plain object. Values are unknown until
 * narrowed with the helpers in `./frontmatter`.
 */
export type Frontmatter = Record<string, unknown>;

/**
 * A note loaded from disk with its parsed body, frontmatter, derived title
 * and the raw wikilink targets extracted from the body.
 */
export type Note = {
  path: NotePath;
  title: string;
  frontmatter: Frontmatter;
  /** Body markdown WITHOUT the frontmatter block. */
  content: string;
  /** Raw target strings extracted from `[[target]]` / `[[target|alias]]`. */
  wikilinks: string[];
  mtimeMs: number;
};

/**
 * Lightweight projection of a note used for sidebar listings and search
 * results, where the body is unnecessary.
 */
export type NoteSummary = Pick<Note, 'path' | 'title' | 'mtimeMs'>;
