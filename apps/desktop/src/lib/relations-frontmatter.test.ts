import { describe, expect, it } from 'vitest';
import {
  relationsFromFrontmatter,
  setRelationInFrontmatter,
  removeRelationFromFrontmatter,
} from './relations-frontmatter';

describe('relationsFromFrontmatter', () => {
  it('returns [] when no relations field is present', () => {
    expect(relationsFromFrontmatter({})).toEqual([]);
    expect(relationsFromFrontmatter({ relations: null })).toEqual([]);
  });

  it('flattens scalars and lists into a single ordered array', () => {
    const fm = { relations: { author: '[[Tolkien]]', cites: ['[[A]]', '[[B]]'] } };
    expect(relationsFromFrontmatter(fm)).toEqual([
      { kind: 'author', target: 'Tolkien' },
      { kind: 'cites', target: 'A' },
      { kind: 'cites', target: 'B' },
    ]);
  });

  it('skips non-wikilink scalar values and non-string list entries', () => {
    const fm = {
      relations: {
        author: 'not a wikilink',
        cites: ['[[A]]', 42, null, '[[B]]'],
      },
    };
    expect(relationsFromFrontmatter(fm)).toEqual([
      { kind: 'cites', target: 'A' },
      { kind: 'cites', target: 'B' },
    ]);
  });
});

describe('setRelationInFrontmatter', () => {
  it('creates the relations map if absent and stores a scalar wikilink for a single target', () => {
    const result = setRelationInFrontmatter({}, 'author', 'Tolkien');
    expect(result.relations).toEqual({ author: '[[Tolkien]]' });
  });

  it('is idempotent when the existing entry is a scalar wikilink', () => {
    const start = { relations: { author: '[[Tolkien]]' } };
    const result = setRelationInFrontmatter(start, 'author', 'Tolkien');
    expect(result.relations).toEqual({ author: '[[Tolkien]]' });
  });

  it('upgrades to a list when adding a second target of the same kind', () => {
    const start = { relations: { cites: '[[A]]' } };
    const result = setRelationInFrontmatter(start, 'cites', 'B');
    expect(result.relations).toEqual({ cites: ['[[A]]', '[[B]]'] });
  });

  it('is idempotent — adding the same (kind, target) does not duplicate', () => {
    const start = { relations: { cites: ['[[A]]', '[[B]]'] } };
    const result = setRelationInFrontmatter(start, 'cites', 'A');
    expect(result.relations).toEqual({ cites: ['[[A]]', '[[B]]'] });
  });

  it('keeps other relations untouched', () => {
    const start = { relations: { author: '[[Tolkien]]' } };
    const result = setRelationInFrontmatter(start, 'cites', 'A');
    expect(result.relations).toEqual({
      author: '[[Tolkien]]',
      cites: '[[A]]',
    });
  });

  it('preserves alias when provided', () => {
    const result = setRelationInFrontmatter({}, 'author', 'Tolkien', { alias: 'JRR' });
    expect(result.relations).toEqual({ author: '[[Tolkien|JRR]]' });
  });

  it('preserves heading when provided', () => {
    const result = setRelationInFrontmatter({}, 'cites', 'Book', { heading: 'chapter-3' });
    expect(result.relations).toEqual({ cites: '[[Book#chapter-3]]' });
  });

  it('preserves both alias and heading', () => {
    const result = setRelationInFrontmatter({}, 'cites', 'Book', { heading: 'ch3', alias: 'Ch3' });
    expect(result.relations).toEqual({ cites: '[[Book#ch3|Ch3]]' });
  });
});

describe('removeRelationFromFrontmatter', () => {
  it('drops the scalar target and removes the relations field when it becomes empty', () => {
    const start = { relations: { author: '[[Tolkien]]' } };
    const result = removeRelationFromFrontmatter(start, 'author', 'Tolkien');
    expect(result).not.toHaveProperty('relations');
  });

  it('drops the kind entirely when its only list entry was removed', () => {
    const start = { relations: { cites: ['[[A]]'] } };
    const result = removeRelationFromFrontmatter(start, 'cites', 'A');
    expect(result).not.toHaveProperty('relations');
  });

  it('collapses a one-entry list into a scalar', () => {
    const start = { relations: { cites: ['[[A]]', '[[B]]'] } };
    const result = removeRelationFromFrontmatter(start, 'cites', 'A');
    expect(result.relations).toEqual({ cites: '[[B]]' });
  });

  it('removes the relations field entirely when all kinds are empty', () => {
    const start = { relations: { author: '[[Tolkien]]', cites: '[[A]]' } };
    const r1 = removeRelationFromFrontmatter(start, 'author', 'Tolkien');
    const r2 = removeRelationFromFrontmatter(r1, 'cites', 'A');
    expect(r2).not.toHaveProperty('relations');
  });

  it('is a no-op when (kind, target) was not present', () => {
    const start = { relations: { cites: '[[A]]' } };
    const result = removeRelationFromFrontmatter(start, 'cites', 'Z');
    expect(result.relations).toEqual({ cites: '[[A]]' });
  });
});
