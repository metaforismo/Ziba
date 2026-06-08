import { describe, expect, it } from 'vitest';
import type { DatabaseQuery } from '@ziba/core';
import { IpcError } from '../security';
import { validateDatabaseQuery } from './database';

// Pure validation/normalisation of the renderer-supplied DatabaseQuery,
// extracted from `runDatabaseQuery` so the guards can be exercised without
// a live SQLite store. These specs pin the edge cases the IPC boundary is
// responsible for catching before the (strict, trusting) adapter runs.

describe('validateDatabaseQuery — filter key guards', () => {
  it('accepts a well-formed eq filter and clamps the default limit', () => {
    const out = validateDatabaseQuery({
      filters: [{ kind: 'eq', key: 'status', value: 'done' }],
    });
    expect(out.filters).toEqual([{ kind: 'eq', key: 'status', value: 'done' }]);
    expect(out.limit).toBe(1000);
  });

  it('rejects an empty filter key', () => {
    expect(() => validateDatabaseQuery({ filters: [{ kind: 'eq', key: '', value: 'x' }] })).toThrow(
      IpcError,
    );
  });

  it('rejects a whitespace-only filter key', () => {
    // `'   '` has length > 0 so a naive check would let it through, then the
    // filter silently matches nothing because no prop_key is blank.
    expect(() =>
      validateDatabaseQuery({ filters: [{ kind: 'eq', key: '   ', value: 'x' }] }),
    ).toThrow(IpcError);
    expect(() => validateDatabaseQuery({ filters: [{ kind: 'has', key: '\t\n' }] })).toThrow(
      IpcError,
    );
  });

  it('rejects an unknown filter kind (prototype-pollution shape)', () => {
    expect(() =>
      // @ts-expect-error — deliberately malformed kind from an untrusted caller.
      validateDatabaseQuery({ filters: [{ kind: '__proto__', key: 'status' }] }),
    ).toThrow(IpcError);
  });

  it('rejects an "in" filter whose values is not an array', () => {
    expect(() =>
      // @ts-expect-error — `values` must be an array.
      validateDatabaseQuery({ filters: [{ kind: 'in', key: 'tag', values: 'urgent' }] }),
    ).toThrow(IpcError);
  });

  it('rejects a non-array filters field', () => {
    // @ts-expect-error — filters must be an array.
    expect(() => validateDatabaseQuery({ filters: 'nope' })).toThrow(IpcError);
  });
});

describe('validateDatabaseQuery — sort + groupBy guards', () => {
  it('rejects an empty/whitespace sort key', () => {
    expect(() => validateDatabaseQuery({ sort: [{ key: '  ', direction: 'asc' }] })).toThrow(
      IpcError,
    );
  });

  it('rejects an invalid sort direction', () => {
    expect(() =>
      // @ts-expect-error — direction must be asc|desc.
      validateDatabaseQuery({ sort: [{ key: 'status', direction: 'sideways' }] }),
    ).toThrow(IpcError);
  });

  it('rejects a whitespace-only groupBy key', () => {
    expect(() => validateDatabaseQuery({ groupBy: '   ' })).toThrow(IpcError);
  });

  it('accepts a valid multi-key sort and groupBy', () => {
    const query: DatabaseQuery = {
      sort: [
        { key: 'priority', direction: 'desc' },
        { key: 'due', direction: 'asc' },
      ],
      groupBy: 'status',
    };
    expect(() => validateDatabaseQuery(query)).not.toThrow();
  });
});

describe('validateDatabaseQuery — limit clamping', () => {
  it('defaults to 1000 when no limit is given', () => {
    expect(validateDatabaseQuery({}).limit).toBe(1000);
  });

  it('clamps below 1 up to 1', () => {
    expect(validateDatabaseQuery({ limit: 0 }).limit).toBe(1);
    expect(validateDatabaseQuery({ limit: -50 }).limit).toBe(1);
  });

  it('clamps above the cap down to 5000', () => {
    expect(validateDatabaseQuery({ limit: 5001 }).limit).toBe(5000);
    expect(validateDatabaseQuery({ limit: 1_000_000 }).limit).toBe(5000);
  });

  it('passes through an in-range limit', () => {
    expect(validateDatabaseQuery({ limit: 250 }).limit).toBe(250);
  });
});
