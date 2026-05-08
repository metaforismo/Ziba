import { describe, it, expect } from 'vitest';
import { serializeMarkdown } from './serialize.js';
import { parseMarkdown } from './parse.js';

describe('serializeMarkdown', () => {
  it('returns body unchanged when frontmatter is empty', () => {
    expect(serializeMarkdown({}, 'just body')).toBe('just body');
  });

  it('wraps non-empty frontmatter as a YAML block before the body', () => {
    const out = serializeMarkdown({ title: 'Hello' }, 'body text');
    expect(out.startsWith('---\n')).toBe(true);
    expect(out).toContain('title: Hello');
    expect(out).toContain('body text');
  });

  it('produces output where the body still appears after the frontmatter delimiter', () => {
    const out = serializeMarkdown({ title: 'X' }, 'body');
    const closingDelim = out.indexOf('\n---\n', 4);
    expect(closingDelim).toBeGreaterThan(0);
    expect(out.slice(closingDelim).includes('body')).toBe(true);
  });
});

describe('parseMarkdown ⇄ serializeMarkdown round trip', () => {
  it('round-trips an empty frontmatter and a plain body', () => {
    const fm = {};
    const body = 'just body text';
    const reparsed = parseMarkdown(serializeMarkdown(fm, body));
    expect(reparsed.frontmatter).toEqual(fm);
    expect(reparsed.body.trim()).toBe(body);
  });

  it('round-trips frontmatter with a title and a body with a heading', () => {
    const fm = { title: 'My Note' };
    const body = '# Heading\n\nparagraph';
    const reparsed = parseMarkdown(serializeMarkdown(fm, body));
    expect(reparsed.frontmatter).toEqual(fm);
    expect(reparsed.body.trim()).toBe(body.trim());
  });

  it('round-trips multiple frontmatter keys', () => {
    const fm = { title: 'A', tags: ['x', 'y'] };
    const body = 'content';
    const reparsed = parseMarkdown(serializeMarkdown(fm, body));
    expect(reparsed.frontmatter).toEqual(fm);
  });
});
