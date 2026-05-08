import { describe, it, expect } from 'vitest';
import { parseMarkdown } from './parse.js';

describe('parseMarkdown', () => {
  it('returns empty frontmatter and full body for plain markdown without a frontmatter block', () => {
    const result = parseMarkdown('plain body');
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe('plain body');
    expect(result.headingTitle).toBeUndefined();
  });

  it('parses frontmatter and exposes it on the result', () => {
    const raw = '---\ntitle: Hello\n---\nbody text';
    const result = parseMarkdown(raw);
    expect(result.frontmatter).toEqual({ title: 'Hello' });
  });

  it('strips the frontmatter block from the body', () => {
    const raw = '---\ntitle: Hello\n---\nbody text';
    const result = parseMarkdown(raw);
    expect(result.body.trim()).toBe('body text');
  });

  it('derives headingTitle from the first H1 in the body', () => {
    const raw = '# H1 Title\n\nbody';
    expect(parseMarkdown(raw).headingTitle).toBe('H1 Title');
  });

  it('returns undefined headingTitle when the body has no headings', () => {
    expect(parseMarkdown('just body, no heading').headingTitle).toBeUndefined();
  });

  it('uses the first heading even when multiple H1s exist', () => {
    const raw = '# First\n\nstuff\n\n# Second';
    expect(parseMarkdown(raw).headingTitle).toBe('First');
  });

  it('strips trailing closing hashes from ATX headings', () => {
    expect(parseMarkdown('# Title #').headingTitle).toBe('Title');
  });

  it('matches H2 as a heading at all heading levels (1-6)', () => {
    // The current regex matches `#{1,6}` so it picks up the first heading
    // at any level. This documents the behavior.
    expect(parseMarkdown('## Sub heading first').headingTitle).toBe('Sub heading first');
  });

  it('combines frontmatter and headingTitle independently', () => {
    const raw = '---\ntitle: From FM\n---\n# From Heading\n\nbody';
    const result = parseMarkdown(raw);
    expect(result.frontmatter).toEqual({ title: 'From FM' });
    expect(result.headingTitle).toBe('From Heading');
  });

  it('treats malformed frontmatter values as a plain object (gray-matter tolerance)', () => {
    // gray-matter returns a normalized object even on weird YAML; the type
    // guard `isPlainObject` then accepts it. We just verify the contract:
    // frontmatter is an object and body is a string for any input.
    const raw = '---\nfoo: 1\n---\nbody';
    const result = parseMarkdown(raw);
    expect(typeof result.body).toBe('string');
    expect(typeof result.frontmatter).toBe('object');
    expect(result.frontmatter).not.toBeNull();
  });

  it('ignores a heading-shaped line indented by 4+ spaces (not ATX)', () => {
    // The heading regex allows up to 3 spaces of indent.
    const raw = '    # Not a heading\n# Real heading';
    expect(parseMarkdown(raw).headingTitle).toBe('Real heading');
  });
});
