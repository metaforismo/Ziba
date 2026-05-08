// Full-text search handler.
//
// `query` is a free-form search string -- not a path -- so we don't run it
// through `assertVaultRelative`. The SQLite adapter is responsible for
// sanitising it into a safe FTS5 MATCH expression.

import type { SearchHit } from '../../shared/ipc.js';
import { requireIndexStore } from '../state.js';

const SEARCH_LIMIT_DEFAULT = 20;
const SEARCH_LIMIT_MIN = 1;
const SEARCH_LIMIT_MAX = 50;

export async function searchFullText(args: {
  query: string;
  limit?: number;
}): Promise<SearchHit[]> {
  // Empty / whitespace-only queries shouldn't hit FTS5 at all -- return no
  // hits so the renderer can show "type to search" guidance.
  if (typeof args.query !== 'string' || args.query.trim().length === 0) {
    return [];
  }

  const requested = args.limit ?? SEARCH_LIMIT_DEFAULT;
  const limit = Math.max(SEARCH_LIMIT_MIN, Math.min(requested, SEARCH_LIMIT_MAX));

  const store = requireIndexStore();
  const hits = await store.searchFullText(args.query, limit);
  return hits.map((h) => ({ path: h.path, title: h.title, snippet: h.snippet }));
}
