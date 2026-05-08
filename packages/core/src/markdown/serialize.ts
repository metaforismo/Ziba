import matter from 'gray-matter';
import type { Frontmatter } from '../types/note.js';

/**
 * Inverse of `parseMarkdown`: produce the on-disk text from a body and
 * frontmatter object. If frontmatter is empty, returns the body unchanged
 * — we don't want to write an empty `---\n---\n` block to plain notes.
 *
 * Uses gray-matter's `stringify` so the YAML formatting matches what the
 * parser expects round-trip.
 */
export function serializeMarkdown(frontmatter: Frontmatter, body: string): string {
  const keys = Object.keys(frontmatter);
  if (keys.length === 0) return body;
  // gray-matter's stringify signature is (content, data) and tolerates the
  // arbitrary record we pass; we know our frontmatter is a plain object.
  return matter.stringify(body, frontmatter as Record<string, unknown>);
}
