import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { installMockIpc } from './test/mock-ipc';
import { App } from './App';
import { useEditorStore } from './stores/editor';
import { useSearchStore } from './stores/search';
import { useUiStore } from './stores/ui';
import { useVaultStore } from './stores/vault';

// Smoke + integration tests for the global keyboard shortcuts wired
// in App.tsx. We render the full App (so the keydown listener is
// actually attached to `window`) and dispatch synthetic events.
//
// Each test exercises one shortcut path and asserts that the matching
// store action fired (or that the editor save was triggered) — that's
// the contract the App is responsible for. The downstream behaviour
// (palette opens, prompt dialog appears, save round-trips through IPC)
// has its own tests.

beforeEach(() => {
  installMockIpc();
  // Pretend a vault is open: the App short-circuits the shortcuts when
  // `current === null`, so without this stub we'd be testing the
  // empty-state branch.
  useVaultStore.setState({
    current: { root: '/test', name: 'test', openedAt: 0 },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function dispatchShortcut(key: string, opts: { shift?: boolean; alt?: boolean } = {}): void {
  const e = new KeyboardEvent('keydown', {
    key,
    metaKey: true,
    ctrlKey: true,
    shiftKey: opts.shift ?? false,
    altKey: opts.alt ?? false,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(e);
}

describe('App keyboard shortcuts', () => {
  it('Cmd+K opens the search palette', () => {
    const openSpy = vi.fn();
    useSearchStore.setState({ openPalette: openSpy });

    render(<App />);
    dispatchShortcut('k');

    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('Cmd+S triggers editor.save when there is a dirty note', () => {
    const saveSpy = vi.fn(async () => undefined);
    useEditorStore.setState({
      currentPath: 'foo.md',
      currentNote: {
        path: 'foo.md',
        title: 'foo',
        frontmatter: {},
        content: 'body',
        wikilinks: [],
        mtimeMs: 0,
      },
      dirty: true,
      save: saveSpy,
    });

    render(<App />);
    dispatchShortcut('s');

    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('Cmd+S is a no-op when no note is open', () => {
    const saveSpy = vi.fn(async () => undefined);
    useEditorStore.setState({
      currentPath: null,
      currentNote: null,
      dirty: false,
      save: saveSpy,
    });

    render(<App />);
    dispatchShortcut('s');

    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('Cmd+S is a no-op when the note is clean (not dirty)', () => {
    const saveSpy = vi.fn(async () => undefined);
    useEditorStore.setState({
      currentPath: 'foo.md',
      currentNote: {
        path: 'foo.md',
        title: 'foo',
        frontmatter: {},
        content: 'body',
        wikilinks: [],
        mtimeMs: 0,
      },
      dirty: false,
      save: saveSpy,
    });

    render(<App />);
    dispatchShortcut('s');

    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('Cmd+Shift+S does not save (reserved for future "Save as")', () => {
    const saveSpy = vi.fn(async () => undefined);
    useEditorStore.setState({
      currentPath: 'foo.md',
      currentNote: {
        path: 'foo.md',
        title: 'foo',
        frontmatter: {},
        content: 'body',
        wikilinks: [],
        mtimeMs: 0,
      },
      dirty: true,
      save: saveSpy,
    });

    render(<App />);
    dispatchShortcut('s', { shift: true });

    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('Cmd+N requests the new-note prompt via UI store', () => {
    render(<App />);
    expect(useUiStore.getState().newNotePromptOpen).toBe(false);

    dispatchShortcut('n');

    expect(useUiStore.getState().newNotePromptOpen).toBe(true);
  });

  it('shortcuts are inert on the empty-state screen (no vault open)', () => {
    useVaultStore.setState({ current: null });
    const openSpy = vi.fn();
    useSearchStore.setState({ openPalette: openSpy });

    render(<App />);
    dispatchShortcut('k');
    dispatchShortcut('n');

    expect(openSpy).not.toHaveBeenCalled();
    expect(useUiStore.getState().newNotePromptOpen).toBe(false);
  });
});
