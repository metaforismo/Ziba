import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '../../shared/ipc';
import type { SearchHit } from '../../shared/ipc';
import { installMockIpc, type MockController } from '../test/mock-ipc';

// We `vi.resetModules()` between tests so the Zustand store factory
// re-runs and we get a fresh `requestSeq` + a fresh debounced scheduler.
// Without this, the first test's debounce timer would leak into the
// next, and the sequence guard wouldn't reset for out-of-order tests.
async function loadStores(): Promise<{
  useSearchStore: typeof import('./search').useSearchStore;
  useEditorStore: typeof import('./editor').useEditorStore;
}> {
  vi.resetModules();
  const search = await import('./search');
  const editor = await import('./editor');
  return { useSearchStore: search.useSearchStore, useEditorStore: editor.useEditorStore };
}

const HIT_A: SearchHit = { path: 'a.md', title: 'A', snippet: 'hello' };
const HIT_B: SearchHit = { path: 'b.md', title: 'B', snippet: 'world' };
const HIT_C: SearchHit = { path: 'c.md', title: 'C', snippet: '!' };

let mock: MockController;

beforeEach(() => {
  mock = installMockIpc();
});

afterEach(() => {
  // setup.ts already restores timers + clears window state. Keeping
  // an empty hook here makes the test boilerplate symmetric and gives
  // future authors a clear extension point.
});

describe('useSearchStore — palette open/close', () => {
  it('openPalette sets open=true without touching the query', async () => {
    const { useSearchStore } = await loadStores();
    useSearchStore.setState({ query: 'lingering' });
    useSearchStore.getState().openPalette();
    expect(useSearchStore.getState().open).toBe(true);
    // Open should *not* clobber the last query so users can reuse it.
    expect(useSearchStore.getState().query).toBe('lingering');
    expect(useSearchStore.getState().selectedIndex).toBe(0);
  });

  it('closePalette clears open + query + results', async () => {
    const { useSearchStore } = await loadStores();
    useSearchStore.setState({
      open: true,
      query: 'foo',
      results: [HIT_A],
      selectedIndex: 0,
    });
    useSearchStore.getState().closePalette();
    const s = useSearchStore.getState();
    expect(s.open).toBe(false);
    expect(s.query).toBe('');
    expect(s.results).toEqual([]);
    expect(s.loading).toBe(false);
    expect(s.error).toBe(null);
  });
});

describe('useSearchStore — setQuery + debounce', () => {
  it('setQuery("") clears results synchronously without an IPC call', async () => {
    const { useSearchStore } = await loadStores();
    useSearchStore.setState({ results: [HIT_A], query: 'old' });
    useSearchStore.getState().setQuery('');
    expect(useSearchStore.getState().results).toEqual([]);
    expect(useSearchStore.getState().query).toBe('');
    expect(mock.getSpy(IpcChannels.searchFullText)).not.toHaveBeenCalled();
  });

  it('setQuery("foo") debounces and fires IPC after 150ms', async () => {
    const { useSearchStore } = await loadStores();
    vi.useFakeTimers();
    mock.setHandler(IpcChannels.searchFullText, async () => [HIT_A]);

    useSearchStore.getState().setQuery('foo');
    // Mid-debounce: nothing has fired yet.
    expect(mock.getSpy(IpcChannels.searchFullText)).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(160);
    // Allow the awaited IPC promise resolution to flush.
    await vi.runAllTimersAsync();

    expect(mock.getSpy(IpcChannels.searchFullText)).toHaveBeenCalledTimes(1);
    expect(mock.getCallsFor(IpcChannels.searchFullText)[0]?.[0]).toMatchObject({
      query: 'foo',
    });
    expect(useSearchStore.getState().results).toEqual([HIT_A]);
  });

  it('rapid setQuery calls coalesce to a single IPC call with the last query', async () => {
    const { useSearchStore } = await loadStores();
    vi.useFakeTimers();
    mock.setHandler(IpcChannels.searchFullText, async () => []);

    useSearchStore.getState().setQuery('f');
    useSearchStore.getState().setQuery('fo');
    useSearchStore.getState().setQuery('foo');
    await vi.advanceTimersByTimeAsync(160);
    await vi.runAllTimersAsync();

    expect(mock.getSpy(IpcChannels.searchFullText)).toHaveBeenCalledTimes(1);
    expect(mock.getCallsFor(IpcChannels.searchFullText)[0]?.[0]).toMatchObject({ query: 'foo' });
  });

  it('drops out-of-order responses: only the latest sequence wins', async () => {
    const { useSearchStore } = await loadStores();
    // Two in-flight queries — the FIRST one resolves SECOND. The store
    // must drop the stale result and keep the latest.
    let resolveFirst: ((hits: SearchHit[]) => void) | null = null;
    let resolveSecond: ((hits: SearchHit[]) => void) | null = null;
    let calls = 0;
    mock.setHandler(IpcChannels.searchFullText, () => {
      calls++;
      return new Promise<SearchHit[]>((resolve) => {
        if (calls === 1) resolveFirst = resolve;
        else resolveSecond = resolve;
      });
    });

    // Drive runSearch directly to bypass the debounce timing.
    useSearchStore.setState({ query: 'first' });
    const p1 = useSearchStore.getState().runSearch();
    useSearchStore.setState({ query: 'second' });
    const p2 = useSearchStore.getState().runSearch();

    // Resolve the SECOND request first (the "correct" current one).
    resolveSecond!([HIT_B]);
    await p2;
    expect(useSearchStore.getState().results).toEqual([HIT_B]);

    // Now resolve the stale first request — its result must be dropped.
    resolveFirst!([HIT_A]);
    await p1;
    expect(useSearchStore.getState().results).toEqual([HIT_B]);
  });

  it('IPC error sets `error`, clears `loading`, leaves results empty', async () => {
    const { useSearchStore } = await loadStores();
    mock.setHandler(IpcChannels.searchFullText, async () => {
      throw new Error('boom');
    });

    useSearchStore.setState({ query: 'foo', loading: true });
    await useSearchStore.getState().runSearch();
    const s = useSearchStore.getState();
    expect(s.error).toBe('boom');
    expect(s.loading).toBe(false);
    expect(s.results).toEqual([]);
  });

  it('closePalette mid-flight cancels the pending debounced search', async () => {
    const { useSearchStore } = await loadStores();
    vi.useFakeTimers();

    useSearchStore.getState().setQuery('foo');
    // The debounce is armed but hasn't fired yet.
    useSearchStore.getState().closePalette();

    // Even after the debounce window passes, no IPC call should occur.
    await vi.advanceTimersByTimeAsync(500);
    await vi.runAllTimersAsync();
    expect(mock.getSpy(IpcChannels.searchFullText)).not.toHaveBeenCalled();
  });
});

describe('useSearchStore — selection navigation', () => {
  it('selectNext wraps from last to first', async () => {
    const { useSearchStore } = await loadStores();
    useSearchStore.setState({ results: [HIT_A, HIT_B, HIT_C], selectedIndex: 2 });
    useSearchStore.getState().selectNext();
    expect(useSearchStore.getState().selectedIndex).toBe(0);
  });

  it('selectPrev wraps from first to last', async () => {
    const { useSearchStore } = await loadStores();
    useSearchStore.setState({ results: [HIT_A, HIT_B, HIT_C], selectedIndex: 0 });
    useSearchStore.getState().selectPrev();
    expect(useSearchStore.getState().selectedIndex).toBe(2);
  });

  it('select is a no-op on empty results', async () => {
    const { useSearchStore } = await loadStores();
    useSearchStore.setState({ results: [], selectedIndex: 0 });
    useSearchStore.getState().selectNext();
    useSearchStore.getState().selectPrev();
    expect(useSearchStore.getState().selectedIndex).toBe(0);
  });
});

describe('useSearchStore — chooseSelected', () => {
  it('opens the selected note via the editor store and closes the palette', async () => {
    const { useSearchStore, useEditorStore } = await loadStores();
    const openNote = vi.fn(async () => undefined);
    useEditorStore.setState({ openNote } as unknown as Parameters<
      typeof useEditorStore.setState
    >[0]);
    useSearchStore.setState({
      open: true,
      query: 'foo',
      results: [HIT_A, HIT_B],
      selectedIndex: 1,
    });

    await useSearchStore.getState().chooseSelected();

    expect(openNote).toHaveBeenCalledWith('b.md');
    expect(useSearchStore.getState().open).toBe(false);
    expect(useSearchStore.getState().query).toBe('');
  });

  it('is a no-op when results are empty (no IPC, no openNote)', async () => {
    const { useSearchStore, useEditorStore } = await loadStores();
    const openNote = vi.fn(async () => undefined);
    useEditorStore.setState({ openNote } as unknown as Parameters<
      typeof useEditorStore.setState
    >[0]);
    useSearchStore.setState({ open: true, results: [], selectedIndex: 0 });

    await useSearchStore.getState().chooseSelected();

    expect(openNote).not.toHaveBeenCalled();
    // Palette stays open since no choice was made.
    expect(useSearchStore.getState().open).toBe(true);
  });
});
