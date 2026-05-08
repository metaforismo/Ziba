import { describe, it, expect } from 'vitest';
import { getFrontmatterTitle, isPlainObject } from './frontmatter.js';

describe('getFrontmatterTitle', () => {
  it('returns the title when it is a non-empty string', () => {
    expect(getFrontmatterTitle({ title: 'Hello' })).toBe('Hello');
  });

  it('returns undefined when title is missing', () => {
    expect(getFrontmatterTitle({})).toBeUndefined();
  });

  it('returns undefined when title is an empty string', () => {
    expect(getFrontmatterTitle({ title: '' })).toBeUndefined();
  });

  it('returns undefined when title is a number', () => {
    expect(getFrontmatterTitle({ title: 42 })).toBeUndefined();
  });

  it('returns undefined when title is an array', () => {
    expect(getFrontmatterTitle({ title: ['a', 'b'] })).toBeUndefined();
  });

  it('returns undefined when title is null', () => {
    expect(getFrontmatterTitle({ title: null })).toBeUndefined();
  });
});

describe('isPlainObject', () => {
  it('returns true for an empty object literal', () => {
    expect(isPlainObject({})).toBe(true);
  });

  it('returns true for an object with properties', () => {
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isPlainObject(null)).toBe(false);
  });

  it('returns false for an array', () => {
    expect(isPlainObject([])).toBe(false);
  });

  it('treats Date instances as plain objects (intentional narrow guard)', () => {
    // The guard only excludes null, arrays, and non-objects. A Date instance
    // therefore passes — gray-matter parses YAML dates as Date, and the
    // top-level frontmatter still satisfies the contract of "key/value map".
    expect(isPlainObject(new Date())).toBe(true);
  });

  it('returns false for a string', () => {
    expect(isPlainObject('hello')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isPlainObject(42)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isPlainObject(undefined)).toBe(false);
  });

  it('returns false for a boolean', () => {
    expect(isPlainObject(true)).toBe(false);
  });
});
