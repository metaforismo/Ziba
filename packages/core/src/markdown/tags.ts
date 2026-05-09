/**
 * Tag extraction that ignores fenced and inline code regions, mirroring the
 * approach used by `extractWikilinks`. We walk the source once, skipping
 * fenced (``` / ~~~) and inline (` ... `) code, and scan for `#tag` tokens
 * at word boundaries.
 *
 * Tag syntax supported:
 *   #foo                  → "foo"
 *   #multi-word           → "multi-word"
 *   #projects/ziba   → "projects/ziba"   (nested tags via `/`)
 *
 * Rejected:
 *   - pure-numeric tags like `#1`, `#123`         (avoid markdown anchors,
 *     CSS hex colors, etc.)
 *   - `#` preceded by `]`, `)`, `_`, or a word char
 *     (so `foo#bar`, `]#bar`, `)#bar` and `_#bar` don't trigger)
 *   - empty tags (`#` not followed by an allowed char)
 */

import type { Frontmatter } from '../types/note.js';

type Scan = {
  src: string;
  i: number;
};

/** A tag occurrence with both canonical (lowercase) and display-case forms. */
export type TagToken = {
  canonical: string;
  display: string;
};

/**
 * Advance past a fenced code block opened by `marker` (``` or ~~~). Same
 * semantics as the wikilinks scanner: tolerant of malformed input, consumes
 * to EOF if no closer is found.
 */
function skipFencedBlock(s: Scan, marker: string): void {
  s.i += marker.length;
  while (s.i < s.src.length && s.src[s.i] !== '\n') s.i++;
  if (s.i < s.src.length) s.i++;

  while (s.i < s.src.length) {
    let j = s.i;
    while (j < s.src.length && (s.src[j] === ' ' || s.src[j] === '\t')) j++;
    let runLen = 0;
    const fenceChar = marker[0]!;
    while (j + runLen < s.src.length && s.src[j + runLen] === fenceChar) runLen++;
    if (runLen >= marker.length) {
      s.i = j + runLen;
      while (s.i < s.src.length && s.src[s.i] !== '\n') s.i++;
      if (s.i < s.src.length) s.i++;
      return;
    }
    while (s.i < s.src.length && s.src[s.i] !== '\n') s.i++;
    if (s.i < s.src.length) s.i++;
  }
}

function skipInlineCode(s: Scan): void {
  let runLen = 0;
  while (s.i + runLen < s.src.length && s.src[s.i + runLen] === '`') runLen++;
  s.i += runLen;
  while (s.i < s.src.length) {
    if (s.src[s.i] === '`') {
      let close = 0;
      while (s.i + close < s.src.length && s.src[s.i + close] === '`') close++;
      if (close === runLen) {
        s.i += close;
        return;
      }
      s.i += close;
    } else {
      s.i++;
    }
  }
}

function isAtLineStart(src: string, i: number): boolean {
  if (i === 0) return true;
  let k = i - 1;
  while (k >= 0 && (src[k] === ' ' || src[k] === '\t')) k--;
  return k < 0 || src[k] === '\n';
}

const TAG_CHAR_RE = /[A-Za-z0-9_/-]/;

function isTagChar(c: string | undefined): boolean {
  return c !== undefined && TAG_CHAR_RE.test(c);
}

/**
 * Returns true if `#` at position `i` is at a valid word boundary for a tag.
 * Rejects when preceded by `]`, `)`, `(`, `_`, or a word character.
 *
 * `(` is rejected because markdown links to anchors look like `[text](#anchor)`
 * and the `#` there is a URL fragment, not a tag.
 */
function isValidTagBoundary(src: string, i: number): boolean {
  if (i === 0) return true;
  const prev = src[i - 1]!;
  if (prev === ']' || prev === ')' || prev === '(' || prev === '_') return false;
  if (/[A-Za-z0-9]/.test(prev)) return false;
  return true;
}

/**
 * Walk the source and invoke `onTag` for each `#tag` outside code that
 * passes the boundary + content rules.
 */
function walkTags(src: string, onTag: (raw: string) => void): void {
  const s: Scan = { src, i: 0 };
  while (s.i < s.src.length) {
    const c = s.src[s.i]!;

    // Fenced code block (``` or ~~~), only at start of line.
    if ((c === '`' || c === '~') && isAtLineStart(src, s.i)) {
      let runLen = 0;
      while (s.i + runLen < s.src.length && s.src[s.i + runLen] === c) runLen++;
      if (runLen >= 3) {
        skipFencedBlock(s, c.repeat(runLen));
        continue;
      }
      if (c === '`') {
        skipInlineCode(s);
        continue;
      }
      s.i++;
      continue;
    }

    if (c === '`') {
      skipInlineCode(s);
      continue;
    }

    if (c === '#') {
      // Only accept at a word boundary.
      if (!isValidTagBoundary(src, s.i)) {
        s.i++;
        continue;
      }
      // Read tag chars after the `#`.
      let j = s.i + 1;
      const start = j;
      while (j < s.src.length && isTagChar(s.src[j])) j++;
      const raw = s.src.slice(start, j);
      if (raw.length > 0 && !/^[0-9]+$/.test(raw)) {
        onTag(raw);
      }
      // Even if rejected, skip past the chars we consumed so we don't
      // re-scan inside the same token.
      s.i = j > s.i ? j : s.i + 1;
      continue;
    }

    s.i++;
  }
}

/**
 * Extract `#tag` occurrences from markdown content, skipping fenced and
 * inline code. Returns deduplicated tokens (case-insensitive on canonical),
 * with the first encountered display-case preserved.
 */
export function extractTags(content: string): TagToken[] {
  const seen = new Map<string, string>();
  walkTags(content, (raw) => {
    const canonical = raw.toLowerCase();
    if (!seen.has(canonical)) {
      seen.set(canonical, raw);
    }
  });
  const out: TagToken[] = [];
  for (const [canonical, display] of seen) {
    out.push({ canonical, display });
  }
  return out;
}

/**
 * Read frontmatter `tags`, accepting either a single string or an array of
 * strings. Anything else is ignored. Returns the raw values in their
 * original casing.
 */
function readFrontmatterTags(frontmatter: Frontmatter): string[] {
  const v = frontmatter['tags'];
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  if (Array.isArray(v)) {
    const out: string[] = [];
    for (const entry of v) {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        // Allow optional leading `#`.
        const cleaned = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
        if (cleaned.length > 0) out.push(cleaned);
      }
    }
    return out;
  }
  return [];
}

/**
 * Merge tags found in the body with tags declared in frontmatter.
 * Deduplication is case-insensitive on the canonical form. Frontmatter wins
 * on display-case when both sources contain the same canonical tag.
 */
export function mergeTagsFromFrontmatter(
  frontmatter: Frontmatter,
  contentTags: TagToken[],
): TagToken[] {
  const byCanonical = new Map<string, string>();

  // Seed with content tags first; frontmatter then overwrites display-case.
  for (const t of contentTags) {
    if (!byCanonical.has(t.canonical)) {
      byCanonical.set(t.canonical, t.display);
    }
  }

  const fmRaw = readFrontmatterTags(frontmatter);
  for (const raw of fmRaw) {
    const canonical = raw.toLowerCase();
    // Frontmatter wins on display-case.
    byCanonical.set(canonical, raw);
  }

  const out: TagToken[] = [];
  for (const [canonical, display] of byCanonical) {
    out.push({ canonical, display });
  }
  return out;
}
