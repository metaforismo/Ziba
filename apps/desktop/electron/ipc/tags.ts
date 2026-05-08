// Tag listing + lookup handlers.
//
// Tags are matched case-insensitively. The handler lowercases the input
// before passing to the adapter so callers don't have to.

import type { NoteSummary } from '@synapsium/core';
import type { TagSummary } from '../../shared/ipc.js';
import { IpcError } from '../security.js';
import { requireIndexStore } from '../state.js';

export async function listTags(): Promise<TagSummary[]> {
  const rows = await requireIndexStore().listTags();
  return rows.map((r) => ({ tag: r.tag, display: r.display, count: r.count }));
}

export async function getNotesByTag(args: { tag: string }): Promise<NoteSummary[]> {
  if (typeof args.tag !== 'string' || args.tag.trim().length === 0) {
    throw new IpcError('INVALID_PATH', 'Il tag non può essere vuoto.');
  }
  const canonical = args.tag.trim().toLowerCase();
  return requireIndexStore().getNotesByTag(canonical);
}
