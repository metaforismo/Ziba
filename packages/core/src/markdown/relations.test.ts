import { describe, it, expect } from 'vitest';
import {
  extractType,
  extractFrontmatterRelations,
  extractBodyRelations,
  extractAllRelations,
  type RelationEntry,
} from './relations';

describe('extractType', () => {
  it('returns the slug when frontmatter.type is a valid slug', () => {
    expect(extractType({ type: 'book' })).toBe('book');
    expect(extractType({ type: 'multi-word-type' })).toBe('multi-word-type');
  });

  it('returns null for missing or non-string type', () => {
    expect(extractType({})).toBeNull();
    expect(extractType({ type: 42 })).toBeNull();
    expect(extractType({ type: ['book'] })).toBeNull();
    expect(extractType({ type: null })).toBeNull();
  });

  it('returns null for slugs that fail the regex', () => {
    expect(extractType({ type: 'Book' })).toBeNull();
    expect(extractType({ type: 'book title' })).toBeNull();
    expect(extractType({ type: '1book' })).toBeNull();
    expect(extractType({ type: '' })).toBeNull();
  });
});

describe('extractFrontmatterRelations', () => {
  it('handles a scalar wikilink relation', () => {
    expect(extractFrontmatterRelations({ relations: { author: '[[Tolkien]]' } })).toEqual<
      RelationEntry[]
    >([{ kind: 'author', targetTitle: 'Tolkien' }]);
  });

  it('handles a list of wikilinks', () => {
    expect(extractFrontmatterRelations({ relations: { knows: ['[[Alice]]', '[[Bob]]'] } })).toEqual<
      RelationEntry[]
    >([
      { kind: 'knows', targetTitle: 'Alice' },
      { kind: 'knows', targetTitle: 'Bob' },
    ]);
  });

  it('strips heading refs in targets', () => {
    expect(extractFrontmatterRelations({ relations: { cites: '[[Foo#section]]' } })).toEqual<
      RelationEntry[]
    >([{ kind: 'cites', targetTitle: 'Foo' }]);
  });

  it('honors the alias side of a piped wikilink', () => {
    expect(extractFrontmatterRelations({ relations: { author: '[[Tolkien|J.R.R.]]' } })).toEqual<
      RelationEntry[]
    >([{ kind: 'author', targetTitle: 'Tolkien' }]);
  });

  it('skips entries that are not wikilinks (silent)', () => {
    const fm = { relations: { author: 'plain string', knows: ['[[Real]]', 42] } };
    expect(extractFrontmatterRelations(fm)).toEqual<RelationEntry[]>([
      { kind: 'knows', targetTitle: 'Real' },
    ]);
  });

  it('returns [] for missing or malformed relations', () => {
    expect(extractFrontmatterRelations({})).toEqual([]);
    expect(extractFrontmatterRelations({ relations: 'oops' })).toEqual([]);
    expect(extractFrontmatterRelations({ relations: ['nope'] })).toEqual([]);
  });
});

describe('extractBodyRelations', () => {
  it('emits one entry per body wikilink with kind=""', () => {
    expect(extractBodyRelations('See [[Foo]] and [[Bar|alias]] for context.')).toEqual<
      RelationEntry[]
    >([
      { kind: '', targetTitle: 'Foo' },
      { kind: '', targetTitle: 'Bar' },
    ]);
  });

  it('does not emit anything for body code blocks', () => {
    const body = 'Inline `[[InCode]]` and:\n```\n[[AlsoInCode]]\n```\nthen [[Real]].';
    const entries = extractBodyRelations(body);
    expect(entries.map((e) => e.targetTitle)).toEqual(['Real']);
  });

  it('returns [] for empty / no-link body', () => {
    expect(extractBodyRelations('')).toEqual([]);
    expect(extractBodyRelations('plain text, no links')).toEqual([]);
  });
});

describe('extractAllRelations', () => {
  it('combines frontmatter relations + body wikilinks', () => {
    const note = {
      frontmatter: { type: 'book', relations: { author: '[[Tolkien]]' } },
      content: 'See [[Inspiration]].',
    };
    expect(extractAllRelations(note)).toEqual<RelationEntry[]>([
      { kind: 'author', targetTitle: 'Tolkien' },
      { kind: '', targetTitle: 'Inspiration' },
    ]);
  });

  it('keeps both kinds when target is the same but kind differs', () => {
    const note = {
      frontmatter: { relations: { cites: '[[Foo]]' } },
      content: '[[Foo]] is mentioned both ways.',
    };
    expect(extractAllRelations(note)).toEqual<RelationEntry[]>([
      { kind: 'cites', targetTitle: 'Foo' },
      { kind: '', targetTitle: 'Foo' },
    ]);
  });

  it('de-duplicates two body mentions of the same target', () => {
    const note = {
      frontmatter: {},
      content: '[[Foo]] then [[Foo]] again.',
    };
    expect(extractAllRelations(note)).toEqual<RelationEntry[]>([{ kind: '', targetTitle: 'Foo' }]);
  });
});
