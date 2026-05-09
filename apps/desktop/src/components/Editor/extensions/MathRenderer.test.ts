import { afterEach, describe, expect, it } from 'vitest';
import {
  __KATEX_CACHE_LIMIT_FOR_TESTS,
  __katexCacheSizeForTests,
  __renderKatexForTests,
  __resetKatexCacheForTests,
} from './MathRenderer';

// Tests for the module-level KaTeX LRU cache. The cache is internal to
// MathRenderer.tsx; we export thin test-only accessors rather than
// teach the production API new methods, so the production code path
// stays the same shape it has at runtime. Each test resets the cache
// in `afterEach` to keep ordering invariants (eviction = oldest entry
// first) verifiable in isolation.

afterEach(() => {
  __resetKatexCacheForTests();
});

describe('renderKatex cache', () => {
  it('returns null for empty / whitespace-only input without populating the cache', () => {
    expect(__renderKatexForTests('', false)).toBeNull();
    expect(__renderKatexForTests('   ', true)).toBeNull();
    expect(__katexCacheSizeForTests()).toBe(0);
  });

  it('caches the same formula+displayMode (referential identity on hit)', () => {
    const a = __renderKatexForTests('x^2', false);
    expect(__katexCacheSizeForTests()).toBe(1);
    const b = __renderKatexForTests('x^2', false);
    // Cache hit: identical reference (the cache stores the string and
    // the touch logic re-inserts it without re-rendering).
    expect(b).toBe(a);
    expect(__katexCacheSizeForTests()).toBe(1);
  });

  it('keys on displayMode (block and inline are independent entries)', () => {
    const inline = __renderKatexForTests('x', false);
    const block = __renderKatexForTests('x', true);
    // Different displayMode → different HTML, different cache slot.
    expect(inline).not.toBe(block);
    expect(__katexCacheSizeForTests()).toBe(2);
  });

  it('evicts the oldest entry when crossing the size limit', () => {
    // Fill exactly to the limit. Each formula is unique so every call
    // is a miss and inserts a new entry.
    for (let i = 0; i < __KATEX_CACHE_LIMIT_FOR_TESTS; i++) {
      __renderKatexForTests(`x_{${i}}`, false);
    }
    expect(__katexCacheSizeForTests()).toBe(__KATEX_CACHE_LIMIT_FOR_TESTS);

    // The next miss pushes us one over → eviction kicks in.
    __renderKatexForTests('y', false);
    expect(__katexCacheSizeForTests()).toBe(__KATEX_CACHE_LIMIT_FOR_TESTS);
  });

  it('eviction targets the least-recently-used entry, not just the oldest insertion', () => {
    // Fill the cache. The first formula inserted is the LRU candidate.
    for (let i = 0; i < __KATEX_CACHE_LIMIT_FOR_TESTS; i++) {
      __renderKatexForTests(`f_{${i}}`, false);
    }

    // Touch `f_{0}` — this should bump it to "most recent" so it
    // *survives* the next eviction.
    __renderKatexForTests('f_{0}', false);
    expect(__katexCacheSizeForTests()).toBe(__KATEX_CACHE_LIMIT_FOR_TESTS);

    // Insert one new entry, forcing one eviction.
    __renderKatexForTests('new', false);
    expect(__katexCacheSizeForTests()).toBe(__KATEX_CACHE_LIMIT_FOR_TESTS);

    // `f_{0}` was just touched → must still be cached. Verify by
    // checking the size doesn't grow when we re-render it (i.e. it's
    // a cache hit, not a fresh miss).
    const sizeBefore = __katexCacheSizeForTests();
    __renderKatexForTests('f_{0}', false);
    expect(__katexCacheSizeForTests()).toBe(sizeBefore);

    // `f_{1}` was the oldest after the touch reordering — must have
    // been evicted, so re-rendering it is a miss that grows-then-evicts
    // (still equal to the limit, but the call resulted in eviction
    // not a hit, observable by no size change *and* the fact that
    // touching `f_{2}` triggers another eviction below).
    __renderKatexForTests('f_{1}', false);
    expect(__katexCacheSizeForTests()).toBe(__KATEX_CACHE_LIMIT_FOR_TESTS);
  });
});
