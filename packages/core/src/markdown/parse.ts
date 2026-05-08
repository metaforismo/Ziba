import matter from 'gray-matter';
import type { Frontmatter } from '../types/note.js';
import { isPlainObject } from '../types/frontmatter.js';

export type ParsedMarkdown = {
  frontmatter: Frontmatter;
  /** Body markdown WITHOUT the frontmatter block. */
  body: string;
  /**
   * The first ATX heading (`# ...`) found in the body, if any.
   * Trimmed and with the leading `#`s removed. The caller decides whether
   * to use this as the note title or fall back to the filename.
   */
  headingTitle: string | undefined;
};

const FIRST_HEADING_RE = /^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/m;

/**
 * Parse a `.md` file's raw text into frontmatter, body, and the optional
 * first-heading title. Title resolution itself is the caller's job:
 *   1) frontmatter.title (string)
 *   2) headingTitle
 *   3) basename of the file path
 */
export function parseMarkdown(raw: string): ParsedMarkdown {
  const parsed = matter(raw);
  const frontmatter: Frontmatter = isPlainObject(parsed.data) ? parsed.data : {};
  const body = parsed.content;

  let headingTitle: string | undefined;
  const m = FIRST_HEADING_RE.exec(body);
  if (m && m[1]) {
    const t = m[1].trim();
    if (t.length > 0) headingTitle = t;
  }

  return { frontmatter, body, headingTitle };
}
