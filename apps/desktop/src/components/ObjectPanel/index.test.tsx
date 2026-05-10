import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ObjectTypeRow } from '@ziba/core';
import { installMockIpc, type MockController } from '../../test/mock-ipc';
import { useEditorStore } from '../../stores/editor';
import { useTagsStore } from '../../stores/tags';
import { useVaultStore } from '../../stores/vault';
import { ObjectPanel } from './index';

// ObjectPanel is the typed-note replacement for the right-pane
// backlinks list. Tests cover the four interesting branches:
//   1. no current note → empty hint
//   2. current note has no `type:` → empty hint (parent decides
//      whether to mount us; we render defensively)
//   3. typed note + populated relations → renders TYPE / PROPERTIES /
//      RELATIONS / INVERSE sections with values
//   4. typed note but the type has no schema → falls back to id as
//      label, '◆' as icon, no color stripe

let mock: MockController;

beforeEach(() => {
  mock = installMockIpc();
  useVaultStore.setState({
    current: { root: '/test', name: 'test', openedAt: 0 },
  });
  useEditorStore.setState({
    currentPath: null,
    currentNote: null,
    dirty: false,
    lastSaveError: null,
  });
  useTagsStore.setState({
    types: [
      {
        id: 'book',
        label: 'Libro',
        icon: '📖',
        color: '#6366f1',
        count: 1,
      },
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ObjectPanel — empty branches', () => {
  it('renders the empty hint when no note is open', () => {
    render(<ObjectPanel />);
    expect(screen.getByText(/Apri una nota tipizzata/)).toBeDefined();
  });

  it('renders the empty hint when the open note has no `type:`', () => {
    useEditorStore.setState({
      currentPath: 'untyped.md',
      currentNote: {
        path: 'untyped.md',
        title: 'Untyped',
        frontmatter: {},
        content: '',
        wikilinks: [],
        mtimeMs: 0,
      },
    });
    render(<ObjectPanel />);
    expect(screen.getByText(/Apri una nota tipizzata/)).toBeDefined();
  });

  it('renders the empty hint when type fails the slug regex', () => {
    useEditorStore.setState({
      currentPath: 'weird.md',
      currentNote: {
        path: 'weird.md',
        title: 'Weird',
        // Capital letter → not a valid slug → ignored.
        frontmatter: { type: 'Book' },
        content: '',
        wikilinks: [],
        mtimeMs: 0,
      },
    });
    render(<ObjectPanel />);
    expect(screen.getByText(/Apri una nota tipizzata/)).toBeDefined();
  });
});

describe('ObjectPanel — typed note', () => {
  it('renders TYPE header with label / icon and PROPERTIES + RELATIONS sections', async () => {
    useEditorStore.setState({
      currentPath: 'tolkien.md',
      currentNote: {
        path: 'tolkien.md',
        title: 'The Hobbit',
        frontmatter: {
          type: 'book',
          title: 'The Hobbit',
          year: 1937,
        },
        content: '',
        wikilinks: [],
        mtimeMs: 0,
      },
    });

    const bookSchema: ObjectTypeRow = {
      id: 'book',
      label: 'Libro',
      icon: '📖',
      color: '#6366f1',
      schema: {
        id: 'book',
        label: 'Libro',
        properties: {
          title: { type: 'text', label: 'Titolo' },
          year: { type: 'number', label: 'Anno' },
        },
        relations: {
          author: { target: 'person', label: 'Autore' },
        },
        inverse: {
          cited_by: { reverse_of: 'cites', label: 'Citato da' },
        },
      },
      mtimeMs: 0,
    };
    // ObjectPanel reads the schema from the renderer-side cache
    // (`useTagsStore.objectTypeSchemas`) rather than per-mount IPC,
    // so we seed the store directly.
    useTagsStore.setState({ objectTypeSchemas: [bookSchema] });
    mock.setHandler('relations:bySource', async () => [
      {
        sourcePath: 'tolkien.md',
        kind: 'author',
        targetTitle: 'Tolkien',
        targetPath: 'people/tolkien.md',
      },
      // kind = '' is a body wikilink; should NOT appear in the
      // outgoing relations group.
      { sourcePath: 'tolkien.md', kind: '', targetTitle: 'Body', targetPath: 'body.md' },
    ]);
    mock.setHandler('relations:byTarget', async () => [
      {
        sourcePath: 'review.md',
        kind: 'cites',
        targetTitle: 'The Hobbit',
        targetPath: 'tolkien.md',
      },
    ]);

    render(<ObjectPanel />);

    // TYPE header — uses the cached typeMeta synchronously so it's
    // visible on first render.
    expect(screen.getByText('Libro')).toBeDefined();
    expect(screen.getByText('Tipo')).toBeDefined();

    // PROPERTIES — schema fields rendered in declaration order.
    await waitFor(() => {
      expect(screen.getByText('Titolo')).toBeDefined();
      expect(screen.getByText('The Hobbit')).toBeDefined();
      expect(screen.getByText('Anno')).toBeDefined();
      expect(screen.getByText('1937')).toBeDefined();
    });

    // RELATIONS — outgoing kind=author renders, body wikilink does not.
    await waitFor(() => {
      expect(screen.getByText('Autore')).toBeDefined();
      expect(screen.getByText('Tolkien')).toBeDefined();
    });

    // INVERSE — schema's `cited_by` label used for `kind=cites`.
    await waitFor(() => {
      expect(screen.getByText('Citato da')).toBeDefined();
    });
  });

  it('falls back to id + neutral icon when the type has no schema', async () => {
    useEditorStore.setState({
      currentPath: 'orphan.md',
      currentNote: {
        path: 'orphan.md',
        title: 'Orphan',
        frontmatter: { type: 'newkind' },
        content: '',
        wikilinks: [],
        mtimeMs: 0,
      },
    });
    useTagsStore.setState({ types: [] });
    mock.setHandler('types:list', async () => []);
    mock.setHandler('relations:bySource', async () => []);
    mock.setHandler('relations:byTarget', async () => []);

    render(<ObjectPanel />);

    // No "Libro" / icon from a missing schema — falls back to id.
    expect(screen.getByText('newkind')).toBeDefined();
    // Empty-state hints in PROPERTIES / RELATIONS / INVERSE
    await waitFor(() => {
      expect(screen.getByText(/Nessuna proprietà nel frontmatter/)).toBeDefined();
      expect(screen.getByText(/Nessuna relazione dichiarata/)).toBeDefined();
      expect(screen.getByText(/Nessuna nota punta a questa/)).toBeDefined();
    });
  });

  it('renders broken outgoing links (targetPath null) as a non-clickable warning row', async () => {
    useEditorStore.setState({
      currentPath: 'a.md',
      currentNote: {
        path: 'a.md',
        title: 'A',
        frontmatter: { type: 'book' },
        content: '',
        wikilinks: [],
        mtimeMs: 0,
      },
    });
    mock.setHandler('relations:bySource', async () => [
      {
        sourcePath: 'a.md',
        kind: 'author',
        targetTitle: 'Missing',
        targetPath: null, // broken
      },
    ]);

    render(<ObjectPanel />);

    await waitFor(() => {
      const row = screen.getByText('Missing').closest('li');
      expect(row).not.toBeNull();
      expect(row?.getAttribute('title')).toBe('Link rotto');
      // No button → not navigable.
      expect(row?.querySelector('button')).toBeNull();
    });
  });
});
