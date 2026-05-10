import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { installMockIpc, type MockController } from '../../test/mock-ipc';
import { useEditorStore } from '../../stores/editor';
import { useToastStore } from '../../stores/toast';
import { useVaultStore } from '../../stores/vault';
import { useSidebarMutations } from './useSidebarMutations';

// Tests pin the two-stage error split that the hook's docstring calls
// out as load-bearing: a previous shape collapsed both stages into a
// single try/catch and mis-reported follow-up failures (refresh,
// re-open) as "Impossibile eliminare la nota" — even when the file was
// actually deleted. The split must keep the user-facing message
// truthful in three distinct outcomes.

let mock: MockController;

beforeEach(() => {
  mock = installMockIpc();
  useToastStore.getState().clear();
  // The follow-up branch deliberately logs failures via console.error
  // for the dev console — silence the chatter in test output.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  // Reset stores between tests so vault/editor state doesn't leak.
  useVaultStore.setState({
    current: { root: '/test', name: 'test', openedAt: 0 },
    notes: [],
    indexProgress: null,
  });
  useEditorStore.setState({
    currentPath: null,
    currentNote: null,
    dirty: false,
    lastSaveError: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function lastToast(): { kind: string; title: string | undefined; message: string } | undefined {
  const toasts = useToastStore.getState().toasts;
  if (toasts.length === 0) return undefined;
  const t = toasts[toasts.length - 1]!;
  return { kind: t.kind, title: t.title, message: t.message };
}

describe('useSidebarMutations — deleteFile two-stage split', () => {
  it('IPC succeeds + refresh succeeds → no error toast surfaces', async () => {
    // Defaults already make both succeed. Just call and verify silence.
    const { result } = renderHook(() => useSidebarMutations());
    await result.current.deleteFile('foo.md');
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('IPC fails → "Impossibile eliminare" error toast, refresh NOT called', async () => {
    mock.setHandler('notes:delete', async () => {
      throw Object.assign(new Error('[PERMISSION_DENIED] Permesso negato.'), {
        code: 'PERMISSION_DENIED',
      });
    });
    const refreshSpy = vi.spyOn(useVaultStore.getState(), 'refreshNotes');

    const { result } = renderHook(() => useSidebarMutations());
    await result.current.deleteFile('foo.md');

    const t = lastToast();
    expect(t?.kind).toBe('error');
    expect(t?.title).toBe('Impossibile eliminare la nota');
    expect(t?.message).toBe('Permesso negato.');
    // Refresh must NOT run: the IPC failed so the file is still on disk
    // and the in-app tree is consistent already.
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('IPC succeeds + refresh fails → warning toast (NOT "Impossibile eliminare")', async () => {
    // The exact regression the hook's docstring warns about: the file
    // *was* deleted on disk, but the watcher / refresh fell over.
    const refreshErr = new Error('watcher stalled');
    vi.spyOn(useVaultStore.getState(), 'refreshNotes').mockRejectedValueOnce(refreshErr);

    const { result } = renderHook(() => useSidebarMutations());
    await result.current.deleteFile('foo.md');

    const t = lastToast();
    expect(t?.kind).toBe('warning');
    expect(t?.title).toBe('Aggiornamento incompleto');
    // Truthful message: tells the user the delete *did* happen but the
    // tree didn't update. Critically NOT "Impossibile eliminare la nota".
    expect(t?.message).toMatch(/Eliminazione nota riuscito/);
    expect(t?.message).not.toMatch(/Impossibile/);
  });
});

describe('useSidebarMutations — renameFile two-stage split', () => {
  it('IPC fails → error toast with rename title, no follow-up runs', async () => {
    mock.setHandler('notes:rename', async () => {
      throw Object.assign(new Error('[ALREADY_EXISTS] Una nota esiste già.'), {
        code: 'ALREADY_EXISTS',
      });
    });
    const openSpy = vi.spyOn(useEditorStore.getState(), 'openNote');

    const { result } = renderHook(() => useSidebarMutations());
    await result.current.renameFile('foo.md', 'bar');

    expect(lastToast()?.title).toBe('Impossibile rinominare la nota');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('IPC ok + openNote (re-open after rename) fails → warning, not error', async () => {
    // Set the editor's currentPath so the rename triggers a re-open.
    useEditorStore.setState({ currentPath: 'foo.md' });
    vi.spyOn(useEditorStore.getState(), 'openNote').mockRejectedValueOnce(
      new Error('disk read failed'),
    );

    const { result } = renderHook(() => useSidebarMutations());
    await result.current.renameFile('foo.md', 'bar');

    const t = lastToast();
    expect(t?.kind).toBe('warning');
    expect(t?.title).toBe('Aggiornamento incompleto');
    expect(t?.message).toMatch(/Rinomina nota riuscito/);
  });

  it('no-op when newName resolves to the same path (no IPC, no toast)', async () => {
    const renameSpy = mock.getSpy('notes:rename');

    const { result } = renderHook(() => useSidebarMutations());
    // Renaming "foo.md" to "foo" lands at the same path — should
    // short-circuit without touching IPC.
    await result.current.renameFile('foo.md', 'foo');

    expect(renameSpy).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});

describe('useSidebarMutations — createNoteIn two-stage split', () => {
  it('IPC fails → error toast with create title, no openNote', async () => {
    mock.setHandler('notes:create', async () => {
      throw Object.assign(new Error('[INVALID_PATH] Percorso non valido.'), {
        code: 'INVALID_PATH',
      });
    });
    const openSpy = vi.spyOn(useEditorStore.getState(), 'openNote');

    const { result } = renderHook(() => useSidebarMutations());
    await result.current.createNoteIn('new', '');

    expect(lastToast()?.title).toBe('Impossibile creare la nota');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('IPC succeeds + openNote fails → warning, NOT "Impossibile creare"', async () => {
    vi.spyOn(useEditorStore.getState(), 'openNote').mockRejectedValueOnce(new Error('load failed'));

    const { result } = renderHook(() => useSidebarMutations());
    await result.current.createNoteIn('new', '');

    const t = lastToast();
    expect(t?.kind).toBe('warning');
    expect(t?.title).toBe('Aggiornamento incompleto');
    expect(t?.message).not.toMatch(/Impossibile/);
  });
});
