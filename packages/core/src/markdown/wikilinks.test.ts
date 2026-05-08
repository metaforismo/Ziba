import { describe, it, expect } from 'vitest';
import { extractWikilinks, replaceWikilinkTargets } from './wikilinks.js';

describe('extractWikilinks', () => {
  it('returns empty array for empty input', () => {
    expect(extractWikilinks('')).toEqual([]);
  });

  it('returns empty array when no wikilinks present', () => {
    expect(extractWikilinks('plain markdown text with no links')).toEqual([]);
  });

  it('extracts a single simple wikilink', () => {
    expect(extractWikilinks('[[Foo]]')).toEqual(['Foo']);
  });

  it('drops the alias part after the pipe', () => {
    expect(extractWikilinks('[[Foo|alias]]')).toEqual(['Foo']);
  });

  it('collapses duplicate targets', () => {
    expect(extractWikilinks('[[A]] x [[A]]')).toEqual(['A']);
  });

  it('preserves source order across distinct targets and dedupes repeats', () => {
    expect(extractWikilinks('[[A]] [[B]] [[A]]')).toEqual(['A', 'B']);
  });

  it('trims whitespace inside the brackets', () => {
    expect(extractWikilinks('[[ Foo ]]')).toEqual(['Foo']);
  });

  it('rejects targets containing a [ character', () => {
    expect(extractWikilinks('[[Foo[bar]]]')).toEqual([]);
  });

  it('rejects targets containing a newline', () => {
    expect(extractWikilinks('[[Foo\nBar]]')).toEqual([]);
  });

  it('rejects an empty target', () => {
    expect(extractWikilinks('[[]]')).toEqual([]);
  });

  it('matches a wikilink ending exactly at end-of-string', () => {
    expect(extractWikilinks('text [[Foo]]')).toEqual(['Foo']);
  });

  it('extracts wikilinks from a longer paragraph', () => {
    const input = 'See also [[Project A]] and [[Project B|the second one]] for details.';
    expect(extractWikilinks(input)).toEqual(['Project A', 'Project B']);
  });

  it('treats the alias as informational only when deduping', () => {
    expect(extractWikilinks('[[A|one]] [[A|two]]')).toEqual(['A']);
  });
});

describe('extractWikilinks — fenced code blocks', () => {
  it('ignores wikilinks inside a triple-backtick fence', () => {
    const input = '```\n[[Foo]]\n```';
    expect(extractWikilinks(input)).toEqual([]);
  });

  it('ignores wikilinks inside a tilde fence', () => {
    const input = '~~~\n[[Foo]]\n~~~';
    expect(extractWikilinks(input)).toEqual([]);
  });

  it('does not terminate a longer fence with a shorter closer', () => {
    // Opener of length 4 cannot be closed by a fence of length 3, so the
    // wikilink remains inside the unclosed fence and is consumed to EOF.
    const input = '~~~~\n[[Foo]]\n~~~';
    expect(extractWikilinks(input)).toEqual([]);
  });

  it('consumes to EOF when a fence is never closed', () => {
    const input = '```\n[[Foo]] and more text';
    expect(extractWikilinks(input)).toEqual([]);
  });

  it('captures wikilinks before and after a fenced block', () => {
    const input = '[[Before]]\n```\n[[Inside]]\n```\n[[After]]';
    expect(extractWikilinks(input)).toEqual(['Before', 'After']);
  });

  it('captures a wikilink on the same line as a non-fence (less than 3) backtick run at line start', () => {
    // A run of 2 backticks at line start is not a fence; it opens an inline
    // code span instead, so anything after the closer is plain text.
    const input = '``code`` then [[Foo]]';
    expect(extractWikilinks(input)).toEqual(['Foo']);
  });
});

describe('extractWikilinks — inline code', () => {
  it('ignores a wikilink inside a single-backtick span', () => {
    expect(extractWikilinks('`[[Foo]]`')).toEqual([]);
  });

  it('ignores a wikilink inside a multi-backtick span', () => {
    expect(extractWikilinks('``[[Foo]]``')).toEqual([]);
  });

  it('only matches a closer of the same length as the opener', () => {
    // Opener of 2 backticks; an inner single backtick does not close it.
    expect(extractWikilinks('``inner ` still code [[Foo]]``')).toEqual([]);
  });

  it('consumes to EOF when inline code is unclosed', () => {
    expect(extractWikilinks('` [[Foo]]')).toEqual([]);
  });

  it('captures a wikilink after a closed inline span', () => {
    expect(extractWikilinks('`code` [[Foo]]')).toEqual(['Foo']);
  });
});

describe('replaceWikilinkTargets', () => {
  it('returns input unchanged for empty string', () => {
    expect(replaceWikilinkTargets('', (t) => t + '!')).toBe('');
  });

  it('returns input unchanged when no wikilinks are present', () => {
    const input = 'plain text with no [single] brackets';
    expect(replaceWikilinkTargets(input, (t) => t + '!')).toBe(input);
  });

  it('rewrites the target of a simple wikilink', () => {
    expect(replaceWikilinkTargets('[[A]]', (t) => t + '!')).toBe('[[A!]]');
  });

  it('preserves the alias when rewriting', () => {
    expect(replaceWikilinkTargets('[[A|alias]]', (t) => t + '!')).toBe('[[A!|alias]]');
  });

  it('leaves wikilinks inside inline code untouched', () => {
    expect(replaceWikilinkTargets('`[[A]]`', (t) => t + '!')).toBe('`[[A]]`');
  });

  it('leaves wikilinks inside fenced code untouched', () => {
    const input = '```\n[[A]]\n```';
    expect(replaceWikilinkTargets(input, (t) => t + '!')).toBe(input);
  });

  it('replaces only wikilinks outside code in mixed content', () => {
    const input = '[[A]] code: `[[A]]` end [[A]]';
    expect(replaceWikilinkTargets(input, (t) => t + '!')).toBe('[[A!]] code: `[[A]]` end [[A!]]');
  });

  it('passes the original (untrimmed-then-trimmed) target to the replacer', () => {
    const calls: string[] = [];
    replaceWikilinkTargets('[[ Foo ]]', (t) => {
      calls.push(t);
      return t;
    });
    expect(calls).toEqual(['Foo']);
  });

  it('round-trips identity replacement', () => {
    const input = 'a [[X]] b [[Y|alt]] c `[[Z]]` d';
    expect(replaceWikilinkTargets(input, (t) => t)).toBe(input);
  });
});
