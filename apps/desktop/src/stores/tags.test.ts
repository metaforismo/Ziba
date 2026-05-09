import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteSummary } from '@synapsium/core';
import type { TagSummary, VaultInfo } from '../../shared/ipc';
import { IpcChannels } from '../../shared/ipc';
import { installMockIpc, type MockController } from '../test/mock-ipc';

// `useTagsStore` installs a module-level subscription on
// `useVaultStore` at import time. To test that wiring cleanly we
// `vi.resetModules()` before every test so the subscription re-attaches
// against a fresh vault store, instead of leaking subscribers from
// previous tests.
async function loadStores(): Promise<{
  useTagsStore: typeof import('./tags').useTagsStore;
  useVaultStore: typeof import('./vault').useVaultStore;
}> {
  vi.resetModules();
  const vault = await import('./vault');
  const tags = await import('./tags');
  return { useTagsStore: tags.useTagsStore, useVaultStore: vault.useVaultStore };
}

const VAULT_A: VaultInfo = { root: '/tmp/a', name: 'A', openedAt: 0 };
const VAULT_B: VaultInfo = { root: '/tmp/b', name: 'B', openedAt: 0 };

const TAG_FOO: TagSummary = { tag: 'foo', display: 'foo', count: 3 };
const TAG_BAR: TagSummary = { tag: 'bar', display: 'bar', count: 1 };

const NOTE_A: NoteSummary = { path: 'a.md', title: 'A', mtimeMs: 0 };
const NOTE_B: NoteSummary = { path: 'b.md', title: 'B', mtimeMs: 0 };

let mock: MockController;

beforeEach(() => {
  mock = installMockIpc();
});

afterEach(() => {
  // setup.ts handles localStorage / timers / window.synapsium reset.
});

describe('useTagsStore — refresh', () => {
  it('refresh() with a vault open populates `tags`', async () => {
    const { useTagsStore, useVaultStore } = await loadStores();
    useVaultStore.setState({ current: VAULT_A });
    mock.setHandler(IpcChannels.listTags, async () => [TAG_FOO, TAG_BAR]);

    await useTagsStore.getState().refresh();

    expect(useTagsStore.getState().tags).toEqual([TAG_FOO, TAG_BAR]);
    expect(useTagsStore.getState().loading).toBe(false);
  });

  it('refresh() no-ops when no vault is open', async () => {
    const { useTagsStore, useVaultStore } = await loadStores();
    useVaultStore.setState({ current: null });

    await useTagsStore.getState().refresh();

    expect(mock.getSpy(IpcChannels.listTags)).not.toHaveBeenCalled();
    expect(useTagsStore.getState().tags).toEqual([]);
  });

  it('clears the selection when the previously-selected tag disappears', async () => {
    const { useTagsStore, useVaultStore } = await loadStores();
    useVaultStore.setState({ current: VAULT_A });
    useTagsStore.setState({
      selectedTag: 'foo',
      notesForSelectedTag: [NOTE_A],
    });
    mock.setHandler(IpcChannels.listTags, async () => [TAG_BAR]); // foo gone

    await useTagsStore.getState().refresh();

    const s = useTagsStore.getState();
    expect(s.selectedTag).toBeNull();
    expect(s.notesForSelectedTag).toEqual([]);
    expect(s.tags).toEqual([TAG_BAR]);
  });
});

describe('useTagsStore — selectTag', () => {
  it('selectTag(tag) fetches notes for that tag', async () => {
    const { useTagsStore, useVaultStore } = await loadStores();
    // Stub the listTags refresh that fires from the module-level vault
    // subscription so it doesn't clobber our `selectTag('foo')`. (The
    // refresh would clear the selection if it observes 'foo' missing
    // from an empty tag listing.)
    mock.setHandler(IpcChannels.listTags, async () => [TAG_FOO, TAG_BAR]);
    mock.setHandler(IpcChannels.getNotesByTag, async () => [NOTE_A, NOTE_B]);
    useVaultStore.setState({ current: VAULT_A });
    // Yield so the subscription's `refresh()` promise can settle before
    // we layer our own `selectTag` on top.
    await new Promise<void>((r) => setTimeout(r, 0));

    await useTagsStore.getState().selectTag('foo');

    expect(useTagsStore.getState().selectedTag).toBe('foo');
    expect(useTagsStore.getState().notesForSelectedTag).toEqual([NOTE_A, NOTE_B]);
  });

  it('selectTag(null) clears selection without an IPC call', async () => {
    const { useTagsStore } = await loadStores();
    useTagsStore.setState({
      selectedTag: 'foo',
      notesForSelectedTag: [NOTE_A],
    });

    await useTagsStore.getState().selectTag(null);

    expect(useTagsStore.getState().selectedTag).toBeNull();
    expect(useTagsStore.getState().notesForSelectedTag).toEqual([]);
    expect(mock.getSpy(IpcChannels.getNotesByTag)).not.toHaveBeenCalled();
  });

  it('drops late selectTag responses (last click wins)', async () => {
    const { useTagsStore, useVaultStore } = await loadStores();
    // Same precaution as above: the module-level subscription would
    // otherwise refresh-and-clear our test selection.
    mock.setHandler(IpcChannels.listTags, async () => [TAG_FOO, TAG_BAR]);
    useVaultStore.setState({ current: VAULT_A });
    await new Promise<void>((r) => setTimeout(r, 0));

    let resolveFirst: ((notes: NoteSummary[]) => void) | null = null;
    let resolveSecond: ((notes: NoteSummary[]) => void) | null = null;
    let calls = 0;
    mock.setHandler(IpcChannels.getNotesByTag, () => {
      calls++;
      return new Promise<NoteSummary[]>((resolve) => {
        if (calls === 1) resolveFirst = resolve;
        else resolveSecond = resolve;
      });
    });

    const p1 = useTagsStore.getState().selectTag('foo');
    const p2 = useTagsStore.getState().selectTag('bar');

    // Resolve the LATER click first.
    resolveSecond!([NOTE_B]);
    await p2;
    expect(useTagsStore.getState().notesForSelectedTag).toEqual([NOTE_B]);

    // The earlier click resolves now — must NOT overwrite.
    resolveFirst!([NOTE_A]);
    await p1;
    expect(useTagsStore.getState().notesForSelectedTag).toEqual([NOTE_B]);
    expect(useTagsStore.getState().selectedTag).toBe('bar');
  });
});

describe('useTagsStore — applyVaultEvent', () => {
  it('applyVaultEvent schedules a debounced refresh', async () => {
    const { useTagsStore, useVaultStore } = await loadStores();
    useVaultStore.setState({ current: VAULT_A });
    vi.useFakeTimers();
    mock.setHandler(IpcChannels.listTags, async () => [TAG_FOO]);

    useTagsStore.getState().applyVaultEvent();
    useTagsStore.getState().applyVaultEvent();
    useTagsStore.getState().applyVaultEvent();

    expect(mock.getSpy(IpcChannels.listTags)).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(220);
    await vi.runAllTimersAsync();

    // Triple-fired events coalesce into one refresh.
    expect(mock.getSpy(IpcChannels.listTags)).toHaveBeenCalledTimes(1);
  });
});

describe('useTagsStore — module-level vault subscription', () => {
  it('vault open → selectTag(null) + refresh() fires', async () => {
    const { useTagsStore, useVaultStore } = await loadStores();
    mock.setHandler(IpcChannels.listTags, async () => [TAG_FOO]);

    // Trigger the subscription by switching `current.root` from null → VAULT_A.
    useVaultStore.setState({ current: VAULT_A });

    // Yield once so the async refresh() promise can run.
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(mock.getSpy(IpcChannels.listTags)).toHaveBeenCalledTimes(1);
    expect(useTagsStore.getState().selectedTag).toBeNull();
  });

  it('vault switch resets selection and refreshes for the new vault', async () => {
    const { useTagsStore, useVaultStore } = await loadStores();
    mock.setHandler(IpcChannels.listTags, async () => [TAG_FOO]);

    // First vault.
    useVaultStore.setState({ current: VAULT_A });
    await new Promise<void>((r) => setTimeout(r, 0));
    useTagsStore.setState({ selectedTag: 'foo' });

    // Switch to second vault.
    useVaultStore.setState({ current: VAULT_B });
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(useTagsStore.getState().selectedTag).toBeNull();
    // First vault open + second vault open = 2 calls.
    expect(mock.getSpy(IpcChannels.listTags)).toHaveBeenCalledTimes(2);
  });

  it('notes-array reference change triggers debounced applyVaultEvent', async () => {
    const { useTagsStore, useVaultStore } = await loadStores();
    useVaultStore.setState({ current: VAULT_A });
    // Yield for the initial refresh().
    await new Promise<void>((r) => setTimeout(r, 0));

    vi.useFakeTimers();
    mock.setHandler(IpcChannels.listTags, async () => [TAG_BAR]);

    // Change the `notes` reference — same vault, same root.
    useVaultStore.setState({ notes: [{ path: 'x.md', title: 'X', mtimeMs: 1 }] });

    // Should NOT have fired yet — the subscription debounces.
    const callsAtTrigger = mock.getSpy(IpcChannels.listTags).mock.calls.length;

    await vi.advanceTimersByTimeAsync(220);
    await vi.runAllTimersAsync();

    expect(mock.getSpy(IpcChannels.listTags).mock.calls.length).toBe(callsAtTrigger + 1);
    void useTagsStore; // keep import live for typecheck
  });
});
