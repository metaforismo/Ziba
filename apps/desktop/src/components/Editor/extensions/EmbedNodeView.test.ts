import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderPreview } from './EmbedNodeView';

// renderPreview is the in-house markdown→React renderer used by the
// embed node view. The full renderer surface (paragraphs, headings,
// lists, code, emphasis, links, wikilinks) is exercised through manual
// QA of the editor, but two behaviours warrant pinned unit tests
// because they regress silently:
//
//  1. Leading frontmatter must be stripped (so a note that starts with
//     `---\ntitle: …\n---` doesn't dump YAML into the preview body).
//  2. Nested embeds `![[Other]]` must render as a compact pill, not as
//     a `!` followed by a wikilink span — that visual artefact made
//     embedded notes that themselves transclude others look broken.

function html(markdown: string): string {
  return renderToStaticMarkup(renderPreview(markdown) as React.ReactElement);
}

describe('renderPreview — frontmatter stripping', () => {
  it('strips a leading YAML frontmatter block delimited by ---', () => {
    const md = '---\ntitle: Example\ntags: [a, b]\n---\nHello world.';
    const out = html(md);
    expect(out).not.toContain('title:');
    expect(out).not.toContain('---');
    expect(out).toContain('Hello world.');
  });

  it('accepts the alternate `...` end delimiter', () => {
    const md = '---\nfoo: bar\n...\nBody.';
    const out = html(md);
    expect(out).not.toContain('foo: bar');
    expect(out).toContain('Body.');
  });

  it('renders documents with no frontmatter unchanged', () => {
    expect(html('Plain note.')).toContain('Plain note.');
  });

  it('passes through unterminated frontmatter rather than blanking', () => {
    // A `---` opener with no closer is a corrupt note; we'd rather
    // show garbled markdown than nothing at all.
    const md = '---\noops never closes\nthen body.';
    const out = html(md);
    expect(out).toContain('oops never closes');
  });

  it('does not strip a `---` mid-document (horizontal rule)', () => {
    const md = 'Top.\n\n---\n\nBottom.';
    const out = html(md);
    expect(out).toContain('Top.');
    expect(out).toContain('Bottom.');
    expect(out).toContain('<hr');
  });
});

describe('renderPreview — nested embeds and wikilinks', () => {
  it('renders `![[Other]]` as a styled embed pill, not raw text', () => {
    const out = html('Vedi ![[Altra Nota]] per dettagli.');
    expect(out).toContain('synapsium-embed-nested');
    expect(out).toContain('Altra Nota');
    // No bare `!` should leak through next to the pill.
    expect(out).not.toMatch(/>!</);
  });

  it('renders bare `[[Target]]` as a wikilink (not as embed)', () => {
    const out = html('Linked to [[Note A]].');
    expect(out).toContain('synapsium-embed-wikilink');
    expect(out).not.toContain('synapsium-embed-nested');
  });

  it('uses the alias side of a piped embed `![[Path|Alias]]`', () => {
    const out = html('![[notes/path|My Display]]');
    expect(out).toContain('My Display');
    expect(out).not.toContain('notes/path');
  });
});
