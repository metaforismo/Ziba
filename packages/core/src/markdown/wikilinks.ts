/**
 * Wikilink parsing/transformation that ignores fenced and inline code.
 *
 * Why a state machine instead of a regex: regex can't track nested
 * "are we currently inside a fenced code block?" state across lines, and
 * naive regex over multi-line content matches `[[foo]]` even when wrapped
 * in ``` ... ``` or `...`. We walk the string once and skip code regions
 * explicitly.
 *
 * Wikilink syntax supported:
 *   [[Target]]              → target = "Target"
 *   [[Target|Alias text]]   → target = "Target" (alias is informational only)
 *
 * Out of scope for v0.1:
 *   - block refs: [[Target#^block]]
 *   - heading refs: [[Target#Heading]]
 *   These will be considered later; for now we treat the whole inner text
 *   (before `|`) as the raw target.
 */

type Scan = {
  src: string;
  i: number;
};

/**
 * Advance past a fenced code block opened by `marker` (``` or ~~~).
 * `marker` is the opener already detected at s.i. We move past the opener,
 * then skip until we find a line that starts (after optional whitespace)
 * with a closing fence of the same character of length >= opener length.
 *
 * If no closing fence is found, we consume to end-of-string — a tolerant
 * stance that matches how most markdown renderers behave on malformed input.
 */
function skipFencedBlock(s: Scan, marker: string): void {
  s.i += marker.length;
  // Skip rest of the opener line (info string).
  while (s.i < s.src.length && s.src[s.i] !== '\n') s.i++;
  if (s.i < s.src.length) s.i++; // past '\n'

  while (s.i < s.src.length) {
    // At line start: check for closing fence (allowing leading whitespace).
    let j = s.i;
    while (j < s.src.length && (s.src[j] === ' ' || s.src[j] === '\t')) j++;
    let runLen = 0;
    const fenceChar = marker[0]!;
    while (j + runLen < s.src.length && s.src[j + runLen] === fenceChar) runLen++;
    if (runLen >= marker.length) {
      // Consume the closing fence and the rest of its line.
      s.i = j + runLen;
      while (s.i < s.src.length && s.src[s.i] !== '\n') s.i++;
      if (s.i < s.src.length) s.i++;
      return;
    }
    // Otherwise advance to next line.
    while (s.i < s.src.length && s.src[s.i] !== '\n') s.i++;
    if (s.i < s.src.length) s.i++;
  }
}

/**
 * Skip an inline-code span starting at s.i which is on a backtick run.
 * Length of the run determines the matching closer (CommonMark rule).
 */
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
  // No closer: tolerated, we've consumed the rest.
}

function isAtLineStart(src: string, i: number): boolean {
  if (i === 0) return true;
  // Allow leading spaces/tabs before a fence (CommonMark: up to 3 spaces).
  let k = i - 1;
  while (k >= 0 && (src[k] === ' ' || src[k] === '\t')) k--;
  return k < 0 || src[k] === '\n';
}

/**
 * Walk the source and invoke `onWikilink` for each `[[...]]` outside code.
 * The callback receives the inner-text span [innerStart, innerEnd) and the
 * raw target (text before `|`, trimmed).
 */
function walkWikilinks(
  src: string,
  onWikilink: (innerStart: number, innerEnd: number, target: string) => void,
): void {
  const s: Scan = { src, i: 0 };
  while (s.i < s.src.length) {
    const c = s.src[s.i]!;

    // Fenced code block (``` or ~~~), only at start of line.
    if ((c === '`' || c === '~') && isAtLineStart(src, s.i)) {
      // Count the run.
      let runLen = 0;
      while (s.i + runLen < s.src.length && s.src[s.i + runLen] === c) runLen++;
      if (runLen >= 3) {
        skipFencedBlock(s, c.repeat(runLen));
        continue;
      }
      // Otherwise fall through to inline-code handling for backticks,
      // or treat tildes as plain text.
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

    if (c === '[' && s.src[s.i + 1] === '[') {
      const innerStart = s.i + 2;
      // Find closing ]] without crossing a newline (wikilinks are single-line).
      // Reject `[` inside the inner content too — this matches the editor's
      // markdown-it parser, so what the index sees and what the editor
      // renders agree.
      let j = innerStart;
      let found = -1;
      while (j < s.src.length) {
        const ch = s.src[j]!;
        if (ch === '\n') break;
        if (ch === '[') {
          found = -1;
          break;
        }
        if (ch === ']' && j + 1 < s.src.length && s.src[j + 1] === ']') {
          found = j;
          break;
        }
        j++;
      }
      if (found !== -1) {
        const inner = s.src.slice(innerStart, found);
        const pipe = inner.indexOf('|');
        const rawTarget = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
        if (rawTarget.length > 0) {
          onWikilink(innerStart, found, rawTarget);
        }
        s.i = found + 2;
        continue;
      }
      s.i++;
      continue;
    }

    s.i++;
  }
}

/**
 * Returns deduplicated wikilink targets in source order.
 * Targets are trimmed; aliases (`|alias`) are dropped.
 */
export function extractWikilinks(content: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  walkWikilinks(content, (_s, _e, target) => {
    if (!seen.has(target)) {
      seen.add(target);
      out.push(target);
    }
  });
  return out;
}

/**
 * Rewrite the target portion of every wikilink in `content` using
 * `replacer(oldTarget) → newTarget`. Aliases (text after `|`) are preserved.
 * Wikilinks inside code regions are left alone.
 */
export function replaceWikilinkTargets(
  content: string,
  replacer: (target: string) => string,
): string {
  // Collect spans first to avoid mutating positions during the walk.
  const edits: { innerStart: number; innerEnd: number; target: string }[] = [];
  walkWikilinks(content, (innerStart, innerEnd, target) => {
    edits.push({ innerStart, innerEnd, target });
  });

  if (edits.length === 0) return content;

  let out = '';
  let cursor = 0;
  for (const edit of edits) {
    out += content.slice(cursor, edit.innerStart);
    const inner = content.slice(edit.innerStart, edit.innerEnd);
    const pipe = inner.indexOf('|');
    const newTarget = replacer(edit.target);
    if (pipe === -1) {
      out += newTarget;
    } else {
      out += newTarget + inner.slice(pipe);
    }
    cursor = edit.innerEnd;
  }
  out += content.slice(cursor);
  return out;
}
