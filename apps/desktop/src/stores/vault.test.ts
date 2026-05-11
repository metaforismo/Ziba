import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteSummary } from '@ziba/core';
import { IpcChannels } from '../../shared/ipc';
import { installMockIpc, type MockController } from '../test/mock-ipc';

// `useVaultStore` is module-level state; reset between tests so each
// test starts with a clean store and fresh IPC spies.
async function loadStore(): Promise<{
  useVaultStore: typeof import('./vault').useVaultStore;
}> {
  vi.resetModules();
  const vault = await import('./vault');
  return { useVaultStore: vault.useVaultStore };
}

const NOTE_HOBBIT: NoteSummary = { path: 'books/hobbit.md', title: 'The Hobbit', mtimeMs: 1 };

let mock: MockController;

beforeEach(() => {
  mock = installMockIpc();
});

describe('useVaultStore — typedPaths slice', () => {
  it('populates typedPaths on openVault → refreshNotes', async () => {
    const { useVaultStore } = await loadStore();
    mock.setHandler(IpcChannels.openVault, async () => ({
      root: '/tmp/v',
      name: 'v',
      openedAt: 0,
    }));
    mock.setHandler(IpcChannels.listNotes, async () => [NOTE_HOBBIT]);
    mock.setHandler(
      IpcChannels.getTypedPaths,
      async () => [['books/hobbit.md', 'book']] as [string, string][],
    );
    mock.setHandler(IpcChannels.getRecentVaults, async () => []);

    await useVaultStore.getState().openVault('/tmp/v');

    expect(useVaultStore.getState().typedPaths.get('books/hobbit.md')).toBe('book');
  });

  it('resets typedPaths to an empty map on closeVault', async () => {
    const { useVaultStore } = await loadStore();
    useVaultStore.setState({
      current: { root: '/tmp/v', name: 'v', openedAt: 0 },
      typedPaths: new Map([['x.md', 'book']]),
    });
    mock.setHandler(IpcChannels.closeVault, async () => undefined);

    await useVaultStore.getState().closeVault();

    expect(useVaultStore.getState().typedPaths.size).toBe(0);
  });

  it('refreshNotes() fetches typedPaths in lockstep with notes', async () => {
    const { useVaultStore } = await loadStore();
    useVaultStore.setState({
      current: { root: '/tmp/v', name: 'v', openedAt: 0 },
    });
    mock.setHandler(IpcChannels.listNotes, async () => [NOTE_HOBBIT]);
    mock.setHandler(
      IpcChannels.getTypedPaths,
      async () => [['books/hobbit.md', 'book']] as [string, string][],
    );

    await useVaultStore.getState().refreshNotes();

    expect(useVaultStore.getState().notes).toEqual([NOTE_HOBBIT]);
    expect(useVaultStore.getState().typedPaths.get('books/hobbit.md')).toBe('book');
  });

  it('refreshNotes() is a no-op when no vault is open', async () => {
    const { useVaultStore } = await loadStore();
    useVaultStore.setState({ current: null });
    mock.setHandler(IpcChannels.listNotes, async () => [NOTE_HOBBIT]);
    mock.setHandler(
      IpcChannels.getTypedPaths,
      async () => [['books/hobbit.md', 'book']] as [string, string][],
    );

    await useVaultStore.getState().refreshNotes();

    expect(mock.getSpy(IpcChannels.listNotes)).not.toHaveBeenCalled();
    expect(mock.getSpy(IpcChannels.getTypedPaths)).not.toHaveBeenCalled();
    expect(useVaultStore.getState().typedPaths.size).toBe(0);
  });
});
