import { Fragment } from 'react';

type SnippetTextProps = {
  /**
   * FTS5 `snippet()` output. Contains literal `<mark>...</mark>` markers
   * around matched terms; everything else is plain text from the note
   * body. We never receive other HTML — the upstream query escapes nothing
   * and the body is markdown source — so a simple split-on-marker parse
   * is both safe and lets React escape stray `<` / `&` characters.
   */
  snippet: string;
  className?: string;
};

// Splitting on the literal markers keeps each chunk as a plain string —
// React escapes any stray `<` or `&` in the body automatically when
// rendering it as text content, so we get XSS safety for free.
const MARK_OPEN = '<mark>';
const MARK_CLOSE = '</mark>';

type Segment = { text: string; mark: boolean };

function parseSnippet(snippet: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;

  while (cursor < snippet.length) {
    const open = snippet.indexOf(MARK_OPEN, cursor);
    if (open === -1) {
      segments.push({ text: snippet.slice(cursor), mark: false });
      break;
    }
    if (open > cursor) {
      segments.push({ text: snippet.slice(cursor, open), mark: false });
    }
    const close = snippet.indexOf(MARK_CLOSE, open + MARK_OPEN.length);
    if (close === -1) {
      // Malformed input (open without close) — treat the rest as plain
      // text rather than crashing the row. Defensive against future
      // tokenizer changes.
      segments.push({ text: snippet.slice(open + MARK_OPEN.length), mark: false });
      break;
    }
    segments.push({ text: snippet.slice(open + MARK_OPEN.length, close), mark: true });
    cursor = close + MARK_CLOSE.length;
  }

  return segments;
}

/**
 * Renders an FTS5 snippet with `<mark>` markers as React, highlighting
 * matched terms in the accent color via a proper React parse.
 */
export function SnippetText({ snippet, className }: SnippetTextProps): JSX.Element {
  const segments = parseSnippet(snippet);
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.mark ? (
          <mark key={i} className="rounded-sm bg-accent/20 px-0.5 text-accent">
            {seg.text}
          </mark>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        ),
      )}
    </span>
  );
}
