import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Note, NotePath } from '@ziba/core';
import { attemptCreateNoteForEmbed, renderPreview, type EmbedCreateIpc } from './EmbedNodeView';

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
    expect(out).toContain('ziba-embed-nested');
    expect(out).toContain('Altra Nota');
    // No bare `!` should leak through next to the pill.
    expect(out).not.toMatch(/>!</);
  });

  it('renders bare `[[Target]]` as a wikilink (not as embed)', () => {
    const out = html('Linked to [[Note A]].');
    expect(out).toContain('ziba-embed-wikilink');
    expect(out).not.toContain('ziba-embed-nested');
  });

  it('uses the alias side of a piped embed `![[Path|Alias]]`', () => {
    const out = html('![[notes/path|My Display]]');
    expect(out).toContain('My Display');
    expect(out).not.toContain('notes/path');
  });
});

// Helper: build a fake note for the IPC mocks below without dragging
// in gray-matter / vault adapter machinery.
function fakeNote(path: NotePath, content = ''): Note {
  return {
    path,
    title: path.replace(/\.md$/, ''),
    frontmatter: {},
    content,
    wikilinks: [],
    mtimeMs: 0,
  };
}

function makeIpcError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(`[${code}] ${message}`), { code });
}

describe('attemptCreateNoteForEmbed', () => {
  it('happy path: createNote succeeds → loaded', async () => {
    const ipc: EmbedCreateIpc = {
      createNote: vi.fn(async ({ path }) => fakeNote(path)),
      resolveTitle: vi.fn(async () => null),
      loadNote: vi.fn(async ({ path }) => fakeNote(path)),
    };

    const out = await attemptCreateNoteForEmbed('Foo', ipc);

    expect(out).toEqual({ kind: 'loaded', path: 'Foo.md', note: fakeNote('Foo.md') });
    expect(ipc.createNote).toHaveBeenCalledWith({ path: 'Foo.md' });
    // Recovery path not exercised on the happy path.
    expect(ipc.resolveTitle).not.toHaveBeenCalled();
    expect(ipc.loadNote).not.toHaveBeenCalled();
  });

  it('ALREADY_EXISTS + resolve hits → recovers to loaded', async () => {
    // Race window: by the time we called createNote, a watcher event
    // had already created the note. Re-resolve picks it up.
    const ipc: EmbedCreateIpc = {
      createNote: vi.fn(async () => {
        throw makeIpcError('ALREADY_EXISTS', 'esiste già');
      }),
      resolveTitle: vi.fn(async () => 'Foo.md' as NotePath),
      loadNote: vi.fn(async ({ path }) => fakeNote(path, '# Existing')),
    };

    const out = await attemptCreateNoteForEmbed('Foo', ipc);

    expect(out.kind).toBe('loaded');
    if (out.kind === 'loaded') {
      expect(out.path).toBe('Foo.md');
      expect(out.note.content).toBe('# Existing');
    }
  });

  it('ALREADY_EXISTS + resolve returns null → not-found (race resolved differently)', async () => {
    // The ALREADY_EXISTS race-mate (the parallel creator) was deleted
    // before our re-resolve ran. The note really doesn't exist now.
    const ipc: EmbedCreateIpc = {
      createNote: vi.fn(async () => {
        throw makeIpcError('ALREADY_EXISTS', 'esiste già');
      }),
      resolveTitle: vi.fn(async () => null),
      loadNote: vi.fn(),
    };

    const out = await attemptCreateNoteForEmbed('Foo', ipc);

    expect(out).toEqual({ kind: 'not-found' });
    expect(ipc.loadNote).not.toHaveBeenCalled();
  });

  it('ALREADY_EXISTS + recovery throws → error with recovery message (not original)', async () => {
    // Recovery itself failed (e.g. NO_VAULT). The recovery error is
    // more actionable than the stale ALREADY_EXISTS, so surface it.
    const ipc: EmbedCreateIpc = {
      createNote: vi.fn(async () => {
        throw makeIpcError('ALREADY_EXISTS', 'duplicato');
      }),
      resolveTitle: vi.fn(async () => {
        throw makeIpcError('NO_VAULT', 'nessun vault aperto');
      }),
      loadNote: vi.fn(),
    };

    const out = await attemptCreateNoteForEmbed('Foo', ipc);

    expect(out).toEqual({ kind: 'error', message: 'nessun vault aperto' });
  });

  it('non-recoverable error: createNote throws something else → error with original message', async () => {
    const ipc: EmbedCreateIpc = {
      createNote: vi.fn(async () => {
        throw makeIpcError('PERMISSION_DENIED', 'permesso negato');
      }),
      resolveTitle: vi.fn(),
      loadNote: vi.fn(),
    };

    const out = await attemptCreateNoteForEmbed('Foo', ipc);

    expect(out).toEqual({ kind: 'error', message: 'permesso negato' });
    // Recovery path NOT entered for non-ALREADY_EXISTS errors.
    expect(ipc.resolveTitle).not.toHaveBeenCalled();
  });

  it('ALREADY_EXISTS + loadNote throws → error with loadNote message', async () => {
    const ipc: EmbedCreateIpc = {
      createNote: vi.fn(async () => {
        throw makeIpcError('ALREADY_EXISTS', 'esiste già');
      }),
      resolveTitle: vi.fn(async () => 'Foo.md' as NotePath),
      loadNote: vi.fn(async () => {
        throw makeIpcError('INTERNAL', 'lettura fallita');
      }),
    };

    const out = await attemptCreateNoteForEmbed('Foo', ipc);

    expect(out).toEqual({ kind: 'error', message: 'lettura fallita' });
  });
});
