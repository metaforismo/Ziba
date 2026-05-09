// Full graph IPC handler (v0.3 Wave 1).
//
// Returns every note + every RESOLVED outgoing wikilink in a single call.
// Wave 2's global graph view will read this once on mount and re-fetch
// when the index reports it has been rebuilt.

import type { FullGraph } from '@ziba/core';
import { requireIndexStore } from '../state.js';

export async function getFullGraph(): Promise<FullGraph> {
  return requireIndexStore().getFullGraph();
}
