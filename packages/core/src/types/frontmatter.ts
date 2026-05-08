import type { Frontmatter } from './note.js';

/**
 * `typeof null === 'object'` and arrays are objects too, so we explicitly
 * exclude both. Used as a type guard before treating an `unknown` value as
 * a frontmatter map.
 */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Returns `frontmatter.title` only when it is a non-empty string.
 * Anything else (number, array, missing, etc.) → undefined, so the caller
 * can fall back to the next title source.
 */
export function getFrontmatterTitle(fm: Frontmatter): string | undefined {
  const t = fm['title'];
  if (typeof t === 'string' && t.length > 0) return t;
  return undefined;
}
