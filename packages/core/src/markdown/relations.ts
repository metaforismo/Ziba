import { extractWikilinks } from './wikilinks.js';
import { TYPE_SLUG_RE } from '../types/schema.js';
import type { Frontmatter } from '../types/frontmatter.js';

/**
 * One observed relation between a source note and a target. The
 * source path comes from the note's location on disk; we track only
 * `kind` (the relation label, or `''` for generic body wikilinks)
 * and `targetTitle` (the raw `[[Target]]` value, before path
 * resolution by the adapter caller).
 */
export type RelationEntry = {
  /** `''` for generic body wikilinks, otherwise the relation kind from frontmatter. */
  kind: string;
  /** Raw target title — what the user wrote between `[[` and `]]`, sans heading ref. */
  targetTitle: string;
};

/**
 * Pull a `type:` slug out of frontmatter. Returns null when the field
 * is missing, isn't a string, is empty, or fails the slug regex.
 * Keeping the regex strict prevents typos like `Book` (capital B) or
 * `book title` (space) from silently splintering the type taxonomy.
 */
export function extractType(frontmatter: Frontmatter): string | null {
  const t = frontmatter.type;
  if (typeof t !== 'string') return null;
  if (!TYPE_SLUG_RE.test(t)) return null;
  return t;
}

/**
 * Parse a single `[[Target]]`, `[[Target|Alias]]`, or `[[Target#heading]]`
 * value into the canonical target title (the part *before* the alias
 * pipe and the heading hash). Returns null for non-wikilink strings.
 *
 * We don't reuse `extractWikilinks` here because that one walks an
 * entire markdown body — for a single field value the regex is
 * cheaper and easier to reason about.
 */
const WIKILINK_VALUE_RE = /^\[\[([^\]]+)\]\]$/;
function parseWikilinkValue(raw: string): string | null {
  const trimmed = raw.trim();
  const m = trimmed.match(WIKILINK_VALUE_RE);
  if (m === null) return null;
  const inner = m[1] ?? '';
  const pipe = inner.indexOf('|');
  const beforePipe = pipe === -1 ? inner : inner.slice(0, pipe);
  const hash = beforePipe.indexOf('#');
  const target = (hash === -1 ? beforePipe : beforePipe.slice(0, hash)).trim();
  return target.length === 0 ? null : target;
}

/**
 * Pull `relations:` out of frontmatter. Each value can be either a
 * scalar wikilink string or a list of wikilink strings; everything
 * else is silently skipped (it's authoring noise we'd rather not
 * crash on — the editor will surface validation in a later phase).
 */
export function extractFrontmatterRelations(frontmatter: Frontmatter): RelationEntry[] {
  const rels = frontmatter.relations;
  if (rels === null || rels === undefined) return [];
  if (typeof rels !== 'object' || Array.isArray(rels)) return [];

  const out: RelationEntry[] = [];
  for (const [kind, value] of Object.entries(rels as Record<string, unknown>)) {
    if (typeof value === 'string') {
      const target = parseWikilinkValue(value);
      if (target !== null) out.push({ kind, targetTitle: target });
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item !== 'string') continue;
        const target = parseWikilinkValue(item);
        if (target !== null) out.push({ kind, targetTitle: target });
      }
    }
  }
  return out;
}

/**
 * Walk the body markdown for generic `[[wikilinks]]` and emit them as
 * relation entries with `kind = ''` (the SQL sentinel, see Phase 1
 * design doc §4.1). Reuses the existing scanner so code-block
 * exclusion + heading-ref stripping behave exactly like before.
 */
export function extractBodyRelations(body: string): RelationEntry[] {
  return extractWikilinks(body).map((target) => ({ kind: '', targetTitle: target }));
}

/**
 * Combine frontmatter relations + body wikilinks into a single
 * deduplicated list. De-dup is per (kind, targetTitle) pair: a note
 * that mentions `[[Foo]]` in the body AND declares a typed relation
 * `cites: [[Foo]]` produces TWO entries (different kinds), but
 * mentioning `[[Foo]]` twice in the body produces one.
 */
export function extractAllRelations(note: {
  frontmatter: Frontmatter;
  content: string;
}): RelationEntry[] {
  const seen = new Set<string>();
  const out: RelationEntry[] = [];
  const push = (e: RelationEntry): void => {
    const key = `${e.kind}\x00${e.targetTitle}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  };
  for (const e of extractFrontmatterRelations(note.frontmatter)) push(e);
  for (const e of extractBodyRelations(note.content)) push(e);
  return out;
}
