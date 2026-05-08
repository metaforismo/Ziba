// Database query IPC handler (v0.3 Wave 1).
//
// Validates the renderer's `DatabaseQuery` shape before forwarding to the
// adapter. The shape itself is type-safe across the IPC boundary, but a
// malicious or buggy renderer could still send empty filter keys, an
// absurd limit, or `groupBy` pointing at nothing — we catch those here so
// the SQLite layer stays strict and trusting.

import type { DatabaseQuery, DatabaseResult, ScalarFilter } from '@synapsium/core';
import { IpcError } from '../security.js';
import { requireIndexStore } from '../state.js';

const LIMIT_DEFAULT = 1000;
const LIMIT_MAX = 5000;

function assertNonEmptyKey(key: unknown, where: string): asserts key is string {
  if (typeof key !== 'string' || key.length === 0) {
    throw new IpcError('INVALID_QUERY', `Chiave di proprietà non valida in ${where}.`);
  }
}

function validateFilter(f: ScalarFilter, idx: number): void {
  const where = `filter #${idx}`;
  assertNonEmptyKey(f.key, where);
  if (f.kind === 'in' && !Array.isArray(f.values)) {
    throw new IpcError('INVALID_QUERY', `Il filtro "in" richiede un array di valori (${where}).`);
  }
}

export async function runDatabaseQuery(args: { query: DatabaseQuery }): Promise<DatabaseResult> {
  const store = requireIndexStore();
  const q = args.query;
  if (q === null || typeof q !== 'object') {
    throw new IpcError('INVALID_QUERY', 'La query deve essere un oggetto.');
  }

  if (q.filters !== undefined) {
    if (!Array.isArray(q.filters)) {
      throw new IpcError('INVALID_QUERY', 'I filtri devono essere un array.');
    }
    q.filters.forEach((f, i) => validateFilter(f, i));
  }

  if (q.sort !== undefined) {
    if (!Array.isArray(q.sort)) {
      throw new IpcError('INVALID_QUERY', "L'ordinamento deve essere un array.");
    }
    q.sort.forEach((s, i) => assertNonEmptyKey(s.key, `sort #${i}`));
  }

  if (q.groupBy !== undefined) {
    assertNonEmptyKey(q.groupBy, 'groupBy');
  }

  // Clamp at the boundary so a renderer can't request millions of rows.
  // The adapter clamps too — defence in depth.
  const requested = q.limit ?? LIMIT_DEFAULT;
  const limit = Math.max(1, Math.min(requested, LIMIT_MAX));

  return store.runQuery({ ...q, limit });
}
