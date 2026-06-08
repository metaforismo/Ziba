import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  detectProperty,
  extractProperties,
  mergeMentionEdges,
  MENTION_EDGE_KIND,
  type DatabaseQuery,
  type DetectedProperty,
  type GraphEdge,
  type MentionEdge,
  type ScalarFilter,
} from './index.js';

describe('detectProperty', () => {
  // ---- boolean ----------------------------------------------------------

  it('detects true booleans as boolean', () => {
    expect(detectProperty('done', true)).toEqual({ key: 'done', type: 'boolean', value: true });
  });

  it('detects false booleans as boolean', () => {
    expect(detectProperty('done', false)).toEqual({ key: 'done', type: 'boolean', value: false });
  });

  // ---- number -----------------------------------------------------------

  it('detects finite numbers as number', () => {
    expect(detectProperty('priority', 3)).toEqual({ key: 'priority', type: 'number', value: 3 });
  });

  it('detects negative numbers as number', () => {
    expect(detectProperty('delta', -1.5)).toEqual({
      key: 'delta',
      type: 'number',
      value: -1.5,
    });
  });

  it('rejects NaN (not finite) as null', () => {
    expect(detectProperty('priority', Number.NaN)).toBeNull();
  });

  it('rejects Infinity as null', () => {
    expect(detectProperty('priority', Number.POSITIVE_INFINITY)).toBeNull();
  });

  // ---- date strings -----------------------------------------------------

  it('detects ISO YYYY-MM-DD strings as date', () => {
    expect(detectProperty('due', '2025-12-31')).toEqual({
      key: 'due',
      type: 'date',
      value: '2025-12-31',
    });
  });

  it('does not detect non-ISO date strings as date', () => {
    expect(detectProperty('due', '12/31/2025')).toEqual({
      key: 'due',
      type: 'text',
      value: '12/31/2025',
    });
  });

  // ---- Date instances ---------------------------------------------------

  it('converts Date instances to ISO date strings', () => {
    const d = new Date('2024-06-15T10:00:00Z');
    expect(detectProperty('due', d)).toEqual({ key: 'due', type: 'date', value: '2024-06-15' });
  });

  it('rejects invalid Date instances as null', () => {
    expect(detectProperty('due', new Date('not-a-date'))).toBeNull();
  });

  // ---- urls -------------------------------------------------------------

  it('detects http URLs as url', () => {
    expect(detectProperty('site', 'http://example.com')).toEqual({
      key: 'site',
      type: 'url',
      value: 'http://example.com',
    });
  });

  it('detects https URLs as url', () => {
    expect(detectProperty('site', 'https://example.com')).toEqual({
      key: 'site',
      type: 'url',
      value: 'https://example.com',
    });
  });

  it('does not detect ftp URLs as url (falls back to text)', () => {
    expect(detectProperty('site', 'ftp://example.com')).toEqual({
      key: 'site',
      type: 'text',
      value: 'ftp://example.com',
    });
  });

  // ---- text fallback ----------------------------------------------------

  it('falls back to text for plain strings', () => {
    expect(detectProperty('status', 'todo')).toEqual({
      key: 'status',
      type: 'text',
      value: 'todo',
    });
  });

  it('treats empty strings as text', () => {
    expect(detectProperty('status', '')).toEqual({ key: 'status', type: 'text', value: '' });
  });

  // ---- string-array -----------------------------------------------------

  it('detects arrays of strings as string-array', () => {
    expect(detectProperty('tags', ['a', 'b'])).toEqual({
      key: 'tags',
      type: 'string-array',
      value: ['a', 'b'],
    });
  });

  it('detects empty arrays as string-array', () => {
    expect(detectProperty('tags', [])).toEqual({ key: 'tags', type: 'string-array', value: [] });
  });

  it('rejects mixed arrays as null', () => {
    expect(detectProperty('tags', ['a', 1])).toBeNull();
  });

  it('rejects arrays of objects as null', () => {
    expect(detectProperty('tags', [{ a: 1 }])).toBeNull();
  });

  // ---- unsupported ------------------------------------------------------

  it('returns null for plain objects', () => {
    expect(detectProperty('meta', { foo: 'bar' })).toBeNull();
  });

  it('returns null for null', () => {
    expect(detectProperty('meta', null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(detectProperty('meta', undefined)).toBeNull();
  });
});

describe('extractProperties', () => {
  it('returns [] for an empty frontmatter object', () => {
    expect(extractProperties({})).toEqual([]);
  });

  it('skips unsupported values silently', () => {
    const fm = {
      title: 'Hello',
      bad: { nested: true },
      mixed: ['a', 1],
    };
    expect(extractProperties(fm)).toEqual([{ key: 'title', type: 'text', value: 'Hello' }]);
  });

  it('preserves insertion order of keys', () => {
    const fm = { z: 1, a: 'x', m: true };
    const props = extractProperties(fm);
    expect(props.map((p) => p.key)).toEqual(['z', 'a', 'm']);
  });

  it('emits one DetectedProperty per supported key', () => {
    const fm = {
      status: 'todo',
      priority: 3,
      done: false,
      due: '2024-01-15',
      site: 'https://example.com',
      tags: ['x', 'y'],
    };
    const props = extractProperties(fm);
    expect(props).toHaveLength(6);
    const types = props.map((p) => p.type);
    expect(types).toEqual(['text', 'number', 'boolean', 'date', 'url', 'string-array']);
  });

  it('handles Date instances surfaced by gray-matter', () => {
    const fm = { due: new Date('2025-03-04T00:00:00Z') };
    expect(extractProperties(fm)).toEqual([{ key: 'due', type: 'date', value: '2025-03-04' }]);
  });
});

// Compile-time pattern checks for the query types. These won't execute
// any runtime assertions worth speaking of; they pin down the shape so a
// future refactor can't silently break the IPC contract.
describe('query types', () => {
  it('DatabaseQuery accepts all filter kinds', () => {
    const q: DatabaseQuery = {
      folder: 'projects',
      filters: [
        { kind: 'eq', key: 'status', value: 'todo' },
        { kind: 'in', key: 'status', values: ['todo', 'doing'] },
        { kind: 'has', key: 'priority' },
        { kind: 'lacks', key: 'done' },
        { kind: 'lt', key: 'priority', value: 3 },
        { kind: 'gt', key: 'priority', value: 1 },
        { kind: 'lte', key: 'due', value: '2025-12-31' },
        { kind: 'gte', key: 'due', value: '2025-01-01' },
        { kind: 'contains', key: 'tags', value: 'urgent' },
      ],
      sort: [{ key: 'due', direction: 'asc' }],
      groupBy: 'status',
      limit: 100,
    };
    // Just ensure the compile-time shape is reachable at runtime.
    expect(q.filters).toHaveLength(9);
  });

  it('ScalarFilter is a discriminated union on `kind`', () => {
    const f: ScalarFilter = { kind: 'eq', key: 'k', value: 1 };
    expectTypeOf(f).toMatchTypeOf<ScalarFilter>();
  });

  it('DetectedProperty narrows on `type`', () => {
    const p: DetectedProperty = { key: 'k', type: 'number', value: 42 };
    if (p.type === 'number') {
      expectTypeOf(p.value).toBeNumber();
    }
    expect(p.type).toBe('number');
  });
});

describe('mergeMentionEdges', () => {
  const A = 'A.md';
  const B = 'B.md';
  const C = 'C.md';
  const known = new Set([A, B, C]);

  function mention(source: string, target: string): MentionEdge {
    return { source, target, targetTitle: target };
  }

  it('adds mention edges as a distinct kind after explicit edges', () => {
    const explicit: GraphEdge[] = [{ source: A, target: B, targetTitle: 'B', kind: '' }];
    const merged = mergeMentionEdges(explicit, [mention(B, C)], known);
    expect(merged).toEqual([
      { source: A, target: B, targetTitle: 'B', kind: '' },
      { source: B, target: C, targetTitle: C, kind: MENTION_EDGE_KIND },
    ]);
  });

  it('drops a mention when an explicit edge already exists for the same pair', () => {
    const explicit: GraphEdge[] = [{ source: A, target: B, targetTitle: 'B', kind: '' }];
    const merged = mergeMentionEdges(explicit, [mention(A, B)], known);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.kind).toBe('');
  });

  it('lets an explicit edge of ANY kind win over a mention for that pair', () => {
    const explicit: GraphEdge[] = [{ source: A, target: B, targetTitle: 'B', kind: 'author' }];
    const merged = mergeMentionEdges(explicit, [mention(A, B)], known);
    expect(merged.filter((e) => e.kind === MENTION_EDGE_KIND)).toHaveLength(0);
  });

  it('does NOT dedupe a mention against the reverse-direction explicit edge', () => {
    // A→B explicit should not suppress a B→A mention (different pair).
    const explicit: GraphEdge[] = [{ source: A, target: B, targetTitle: 'B', kind: '' }];
    const merged = mergeMentionEdges(explicit, [mention(B, A)], known);
    expect(merged).toContainEqual({
      source: B,
      target: A,
      targetTitle: A,
      kind: MENTION_EDGE_KIND,
    });
  });

  it('skips self-mentions', () => {
    const merged = mergeMentionEdges([], [mention(A, A)], known);
    expect(merged).toEqual([]);
  });

  it('collapses duplicate mentions for the same pair', () => {
    const merged = mergeMentionEdges([], [mention(A, B), mention(A, B)], known);
    expect(merged).toHaveLength(1);
  });

  it('drops mentions whose endpoints are not both known nodes', () => {
    const merged = mergeMentionEdges([], [mention(A, 'ghost.md'), mention('ghost.md', B)], known);
    expect(merged).toEqual([]);
  });
});
