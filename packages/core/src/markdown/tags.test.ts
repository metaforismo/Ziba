import { describe, it, expect } from 'vitest';
import { extractTags, mergeTagsFromFrontmatter } from './tags.js';

describe('extractTags', () => {
  it('returns empty array for empty input', () => {
    expect(extractTags('')).toEqual([]);
  });

  it('returns empty array when no tags present', () => {
    expect(extractTags('plain markdown text with no tags')).toEqual([]);
  });

  it('extracts a simple tag', () => {
    expect(extractTags('#foo')).toEqual([{ canonical: 'foo', display: 'foo' }]);
  });

  it('deduplicates tags case-insensitively, keeping first display-case', () => {
    expect(extractTags('#Foo and #foo')).toEqual([{ canonical: 'foo', display: 'Foo' }]);
  });

  it('supports nested tags via slash', () => {
    expect(extractTags('#projects/ziba')).toEqual([
      { canonical: 'projects/ziba', display: 'projects/ziba' },
    ]);
  });

  it('supports multi-word tags via dash', () => {
    expect(extractTags('#multi-word')).toEqual([
      { canonical: 'multi-word', display: 'multi-word' },
    ]);
  });

  it('rejects pure-numeric tags (e.g. CSS hex shorthand or anchors)', () => {
    expect(extractTags('#123')).toEqual([]);
  });

  it('ignores tags inside fenced code blocks', () => {
    const input = '```\n#foo\n```';
    expect(extractTags(input)).toEqual([]);
  });

  it('ignores tags inside inline code spans', () => {
    expect(extractTags('`#foo`')).toEqual([]);
  });

  it('rejects `#` not at a word boundary (preceded by alnum)', () => {
    expect(extractTags('foo#bar')).toEqual([]);
  });

  it('rejects `#` preceded by `)` (e.g. markdown link href anchor)', () => {
    expect(extractTags('[link](#anchor)')).toEqual([]);
  });

  it('rejects `#` preceded by `]`', () => {
    expect(extractTags('foo]#bar')).toEqual([]);
  });

  it('rejects `#` preceded by `_`', () => {
    expect(extractTags('foo_#bar')).toEqual([]);
  });

  it('captures multiple distinct tags in source order', () => {
    expect(extractTags('#alpha and #beta and #alpha again')).toEqual([
      { canonical: 'alpha', display: 'alpha' },
      { canonical: 'beta', display: 'beta' },
    ]);
  });

  it('captures a tag at the very start of the string', () => {
    expect(extractTags('#start of file')).toEqual([{ canonical: 'start', display: 'start' }]);
  });

  it('captures a tag after a newline', () => {
    expect(extractTags('text\n#foo')).toEqual([{ canonical: 'foo', display: 'foo' }]);
  });

  it('does not pick up bare `#` with no following tag chars', () => {
    expect(extractTags('# heading')).toEqual([]);
  });

  it('captures tag preceded by punctuation that is not in the reject list', () => {
    expect(extractTags('hello, #world')).toEqual([{ canonical: 'world', display: 'world' }]);
  });
});

describe('mergeTagsFromFrontmatter', () => {
  it('returns content tags when frontmatter has none', () => {
    const result = mergeTagsFromFrontmatter({}, [{ canonical: 'foo', display: 'foo' }]);
    expect(result).toEqual([{ canonical: 'foo', display: 'foo' }]);
  });

  it('merges frontmatter array tags with content tags, deduplicating case-insensitively', () => {
    const result = mergeTagsFromFrontmatter({ tags: ['Bar', 'foo'] }, [
      { canonical: 'foo', display: 'foo' },
    ]);
    // Both `foo` and `bar` present, no duplicates.
    const canonicals = result.map((t) => t.canonical).sort();
    expect(canonicals).toEqual(['bar', 'foo']);
  });

  it('frontmatter wins on display-case when both sources contain the same canonical tag', () => {
    const result = mergeTagsFromFrontmatter({ tags: ['FOO'] }, [
      { canonical: 'foo', display: 'foo' },
    ]);
    expect(result).toEqual([{ canonical: 'foo', display: 'FOO' }]);
  });

  it('accepts a single string frontmatter tag', () => {
    const result = mergeTagsFromFrontmatter({ tags: 'Solo' }, []);
    expect(result).toEqual([{ canonical: 'solo', display: 'Solo' }]);
  });

  it('strips a leading `#` from frontmatter tag entries', () => {
    const result = mergeTagsFromFrontmatter({ tags: ['#hashed'] }, []);
    expect(result).toEqual([{ canonical: 'hashed', display: 'hashed' }]);
  });

  it('ignores non-string frontmatter tag entries', () => {
    const result = mergeTagsFromFrontmatter({ tags: [42, null, 'ok'] }, []);
    expect(result).toEqual([{ canonical: 'ok', display: 'ok' }]);
  });

  it('ignores non-string / non-array `tags` frontmatter values', () => {
    const result = mergeTagsFromFrontmatter({ tags: 42 }, [{ canonical: 'foo', display: 'foo' }]);
    expect(result).toEqual([{ canonical: 'foo', display: 'foo' }]);
  });
});
