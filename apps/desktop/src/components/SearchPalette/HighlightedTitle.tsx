import { Fragment } from 'react';
import type { JSX } from 'react';

type HighlightedTitleProps = {
  title: string;
  /** Raw user query. May contain FTS5 operators we strip before matching. */
  query: string;
  className?: string;
};

/**
 * FTS5 returns highlight markers for the body snippet but not the title,
 * so we approximate title highlighting on the renderer side: split the
 * query into bare word tokens (dropping FTS operators / quotes) and mark
 * each case-insensitive literal occurrence in the title.
 *
 * This is a display nicety, not a search-correctness guarantee — a token
 * absent from the title simply isn't marked.
 */
function queryTokens(query: string): string[] {
  return (
    query
      .toLowerCase()
      .replace(/[()"*-]/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      // Drop FTS5 boolean operators and trivially-short tokens that would
      // highlight almost everything.
      .filter((t) => t.length >= 2 && t !== 'or' && t !== 'and' && t !== 'not' && t !== 'near')
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function HighlightedTitle({ title, query, className }: HighlightedTitleProps): JSX.Element {
  const tokens = queryTokens(query);
  if (tokens.length === 0) {
    return <span className={className}>{title}</span>;
  }

  // One pass over the title, marking the longest tokens first so a token
  // that is a prefix of another doesn't pre-empt the better match.
  const pattern = new RegExp(
    `(${tokens
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join('|')})`,
    'gi',
  );
  const parts = title.split(pattern);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        // Odd indices are the captured (matched) groups.
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-accent/20 px-0.5 text-accent">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </span>
  );
}
