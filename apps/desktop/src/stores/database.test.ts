import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseQuery, DatabaseResult, ScalarFilter, VaultInfo } from '../../shared/ipc';
import { IpcChannels } from '../../shared/ipc';
import { installMockIpc, type MockController } from '../test/mock-ipc';

// Database store tests share the same `vi.resetModules()` pattern as
// `search.test.ts`: each `loadStores()` call yields a fresh store
// factory, fresh `requestSeq`, and fresh debounced scheduler.
async function loadStores(): Promise<{
  useDatabaseStore: typeof import('./database').useDatabaseStore;
  useVaultStore: typeof import('./vault').useVaultStore;
}> {
  vi.resetModules();
  const db = await import('./database');
  const vault = await import('./vault');
  return { useDatabaseStore: db.useDatabaseStore, useVaultStore: vault.useVaultStore };
}

const FAKE_VAULT: VaultInfo = { root: '/tmp/vault', name: 'vault', openedAt: 0 };

const EQ_FILTER: ScalarFilter = { kind: 'eq', key: 'status', value: 'done' };
const CONTAINS_FILTER: ScalarFilter = { kind: 'contains', key: 'title', value: 'foo' };
const HAS_FILTER: ScalarFilter = { kind: 'has', key: 'tags' };

// Build a fake DatabaseResult. Property values are typed as `DetectedProperty`
// in the real schema, but the renderer store only reads `Object.keys`, so
// we cast through `unknown` to keep the test data terse.
function makeResult(rowProperties: Array<Record<string, unknown>>): DatabaseResult {
  return {
    rows: rowProperties.map((properties, i) => ({
      path: `n${i}.md`,
      title: `Note ${i}`,
      mtimeMs: 0,
      properties: properties as unknown as DatabaseResult['rows'][number]['properties'],
    })),
    groups: [],
    totalCount: rowProperties.length,
  };
}

let mock: MockController;

beforeEach(() => {
  mock = installMockIpc();
});

afterEach(() => {
  // Reset for next test — setup.ts handles timers/localStorage.
});

describe('useDatabaseStore — initial state', () => {
  it('starts with empty filters, no sort/groupBy/folder, default limit', async () => {
    const { useDatabaseStore } = await loadStores();
    const s = useDatabaseStore.getState();
    expect(s.query.filters).toEqual([]);
    expect(s.query.sort).toBeUndefined();
    expect(s.query.groupBy).toBeUndefined();
    expect(s.query.folder).toBeUndefined();
    expect(s.query.limit).toBe(1000);
    expect(s.result).toBeNull();
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
    expect(s.availableProperties).toEqual([]);
  });
});

describe('useDatabaseStore — filter mutators', () => {
  it('addFilter appends to the array', async () => {
    const { useDatabaseStore } = await loadStores();
    useDatabaseStore.getState().addFilter(EQ_FILTER);
    useDatabaseStore.getState().addFilter(CONTAINS_FILTER);
    expect(useDatabaseStore.getState().query.filters).toEqual([EQ_FILTER, CONTAINS_FILTER]);
  });

  it('updateFilter replaces by index', async () => {
    const { useDatabaseStore } = await loadStores();
    useDatabaseStore.getState().addFilter(EQ_FILTER);
    useDatabaseStore.getState().addFilter(CONTAINS_FILTER);
    useDatabaseStore.getState().updateFilter(0, HAS_FILTER);
    expect(useDatabaseStore.getState().query.filters).toEqual([HAS_FILTER, CONTAINS_FILTER]);
  });

  it('removeFilter splices', async () => {
    const { useDatabaseStore } = await loadStores();
    useDatabaseStore.getState().addFilter(EQ_FILTER);
    useDatabaseStore.getState().addFilter(CONTAINS_FILTER);
    useDatabaseStore.getState().removeFilter(0);
    expect(useDatabaseStore.getState().query.filters).toEqual([CONTAINS_FILTER]);
  });

  it('removeFilter / updateFilter no-op for out-of-range index', async () => {
    const { useDatabaseStore } = await loadStores();
    useDatabaseStore.getState().addFilter(EQ_FILTER);
    useDatabaseStore.getState().removeFilter(5);
    useDatabaseStore.getState().updateFilter(-1, HAS_FILTER);
    expect(useDatabaseStore.getState().query.filters).toEqual([EQ_FILTER]);
  });

  it('setFilters replaces the whole list', async () => {
    const { useDatabaseStore } = await loadStores();
    useDatabaseStore.getState().addFilter(EQ_FILTER);
    useDatabaseStore.getState().setFilters([HAS_FILTER, CONTAINS_FILTER]);
    expect(useDatabaseStore.getState().query.filters).toEqual([HAS_FILTER, CONTAINS_FILTER]);
  });
});

describe('useDatabaseStore — debounce + IPC', () => {
  it('rapid filter edits coalesce into a single debounced IPC call', async () => {
    const { useDatabaseStore, useVaultStore } = await loadStores();
    useVaultStore.setState({ current: FAKE_VAULT });
    vi.useFakeTimers();
    mock.setHandler(IpcChannels.runDatabaseQuery, async () => makeResult([]));

    // Text-input style mutations — these go through scheduleRun (debounced).
    useDatabaseStore.getState().setFolder('projects');
    useDatabaseStore.getState().addFilter(EQ_FILTER);
    useDatabaseStore.getState().addFilter(CONTAINS_FILTER);
    expect(mock.getSpy(IpcChannels.runDatabaseQuery)).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(220);
    await vi.runAllTimersAsync();

    // 200ms trailing-edge debounce → exactly one query.
    expect(mock.getSpy(IpcChannels.runDatabaseQuery)).toHaveBeenCalledTimes(1);
  });

  it('discrete actions (setSort, setGroupBy, setType, setLimit) bypass the debounce', async () => {
    const { useDatabaseStore, useVaultStore } = await loadStores();
    useVaultStore.setState({ current: FAKE_VAULT });
    mock.setHandler(IpcChannels.runDatabaseQuery, async () => makeResult([]));

    // Each discrete action fires runQuery immediately.
    await useDatabaseStore.getState().setSort([{ key: 'title', direction: 'asc' }]);
    expect(mock.getSpy(IpcChannels.runDatabaseQuery)).toHaveBeenCalledTimes(1);

    await useDatabaseStore.getState().setGroupBy('status');
    expect(mock.getSpy(IpcChannels.runDatabaseQuery)).toHaveBeenCalledTimes(2);

    await useDatabaseStore.getState().setType('book');
    expect(mock.getSpy(IpcChannels.runDatabaseQuery)).toHaveBeenCalledTimes(3);

    await useDatabaseStore.getState().setLimit(250);
    expect(mock.getSpy(IpcChannels.runDatabaseQuery)).toHaveBeenCalledTimes(4);
    expect(useDatabaseStore.getState().query.limit).toBe(250);
  });

  it('runQuery populates result and derives availableProperties sorted', async () => {
    const { useDatabaseStore, useVaultStore } = await loadStores();
    useVaultStore.setState({ current: FAKE_VAULT });
    mock.setHandler(IpcChannels.runDatabaseQuery, async () =>
      makeResult([
        { status: 'done', priority: 1 },
        { tags: ['x'], status: 'todo' },
      ]),
    );

    await useDatabaseStore.getState().runQuery();

    const s = useDatabaseStore.getState();
    expect(s.result?.rows).toHaveLength(2);
    expect(s.availableProperties).toEqual(['priority', 'status', 'tags']);
    expect(s.error).toBeNull();
    expect(s.loading).toBe(false);
    expect(s.lastUpdatedAt).toBeTypeOf('number');
  });

  it('IPC error sets error and preserves the previous result', async () => {
    const { useDatabaseStore, useVaultStore } = await loadStores();
    useVaultStore.setState({ current: FAKE_VAULT });
    const initial = makeResult([{ status: 'done' }]);
    mock.setHandler(IpcChannels.runDatabaseQuery, async () => initial);
    await useDatabaseStore.getState().runQuery();
    expect(useDatabaseStore.getState().result).toEqual(initial);

    // Second call: error.
    mock.setHandler(IpcChannels.runDatabaseQuery, async () => {
      throw new Error('boom');
    });
    await useDatabaseStore.getState().runQuery();

    const s = useDatabaseStore.getState();
    expect(s.error).toBe('boom');
    expect(s.loading).toBe(false);
    // Previous rows are still there — don't blank the table on a flake.
    expect(s.result).toEqual(initial);
  });

  it('drops late responses when newer query is in flight', async () => {
    const { useDatabaseStore, useVaultStore } = await loadStores();
    useVaultStore.setState({ current: FAKE_VAULT });

    let resolveFirst: ((r: DatabaseResult) => void) | null = null;
    let resolveSecond: ((r: DatabaseResult) => void) | null = null;
    let calls = 0;
    mock.setHandler(IpcChannels.runDatabaseQuery, () => {
      calls++;
      return new Promise<DatabaseResult>((resolve) => {
        if (calls === 1) resolveFirst = resolve;
        else resolveSecond = resolve;
      });
    });

    const newer = makeResult([{ status: 'newer' }]);
    const older = makeResult([{ status: 'older' }]);

    const p1 = useDatabaseStore.getState().runQuery();
    const p2 = useDatabaseStore.getState().runQuery();

    resolveSecond!(newer);
    await p2;
    expect(useDatabaseStore.getState().result).toBe(newer);

    resolveFirst!(older);
    await p1;
    // Stale response must NOT overwrite.
    expect(useDatabaseStore.getState().result).toBe(newer);
  });

  it('runQuery is a no-op when no vault is open', async () => {
    const { useDatabaseStore, useVaultStore } = await loadStores();
    useVaultStore.setState({ current: null });
    await useDatabaseStore.getState().runQuery();
    expect(mock.getSpy(IpcChannels.runDatabaseQuery)).not.toHaveBeenCalled();
    const s = useDatabaseStore.getState();
    expect(s.result).toBeNull();
    expect(s.loading).toBe(false);
  });
});

describe('useDatabaseStore — vault subscription', () => {
  it('triggering a vault notes change reschedules a debounced run', async () => {
    const { useDatabaseStore, useVaultStore } = await loadStores();
    useVaultStore.setState({ current: FAKE_VAULT, notes: [] });
    vi.useFakeTimers();
    mock.setHandler(IpcChannels.runDatabaseQuery, async () => makeResult([]));

    const unsub = useDatabaseStore.getState().subscribeToVaultEvents();

    // Mutate `notes` reference — the subscription should react.
    useVaultStore.setState({ notes: [{ path: 'a.md', title: 'A', mtimeMs: 1 }] });

    await vi.advanceTimersByTimeAsync(220);
    await vi.runAllTimersAsync();

    expect(mock.getSpy(IpcChannels.runDatabaseQuery)).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('vault switch fires an immediate query and resets state on close', async () => {
    const { useDatabaseStore, useVaultStore } = await loadStores();
    useVaultStore.setState({ current: null });
    mock.setHandler(IpcChannels.runDatabaseQuery, async () => makeResult([{ x: 1 }]));

    const unsub = useDatabaseStore.getState().subscribeToVaultEvents();

    // Open a vault.
    useVaultStore.setState({ current: FAKE_VAULT, notes: [] });
    // Yield for the immediate runQuery promise.
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mock.getSpy(IpcChannels.runDatabaseQuery)).toHaveBeenCalledTimes(1);

    // Pre-populate something so the close branch has visible state to clear.
    useDatabaseStore.setState({
      result: makeResult([{ x: 1 }]),
      availableProperties: ['x'],
    });

    // Close the vault.
    useVaultStore.setState({ current: null, notes: [] });
    const s = useDatabaseStore.getState();
    expect(s.result).toBeNull();
    expect(s.availableProperties).toEqual([]);
    expect(s.error).toBeNull();
    unsub();
  });

  it('resets selectedType + query on vault switch (open A → open B)', async () => {
    const { useDatabaseStore, useVaultStore } = await loadStores();
    const VAULT_A: VaultInfo = { root: '/tmp/v1', name: 'v1', openedAt: 0 };
    const VAULT_B: VaultInfo = { root: '/tmp/v2', name: 'v2', openedAt: 1 };
    useVaultStore.setState({ current: VAULT_A, notes: [] });
    mock.setHandler(IpcChannels.runDatabaseQuery, async () => ({
      rows: [],
      groups: [],
      totalCount: 0,
    }));

    const unsub = useDatabaseStore.getState().subscribeToVaultEvents();

    // Simulate: user has set a type filter + custom query in vault A.
    const userFilter: ScalarFilter = { kind: 'eq', key: 'year', value: 1937 };
    useDatabaseStore.setState({
      selectedType: 'book',
      query: { filters: [userFilter], limit: 1000 },
    });

    // Switch to vault B.
    useVaultStore.setState({ current: VAULT_B, notes: [] });
    // Subscription is sync for the state reset; runQuery is async — yield.
    await Promise.resolve();

    expect(useDatabaseStore.getState().selectedType).toBeNull();
    expect(useDatabaseStore.getState().query.filters).toEqual([]);
    unsub();
  });
});

describe('useDatabaseStore — selectedType slice', () => {
  it('initial state is null', async () => {
    const { useDatabaseStore } = await loadStores();
    expect(useDatabaseStore.getState().selectedType).toBeNull();
  });

  it('setType(value) stores the slug', async () => {
    const { useDatabaseStore, useVaultStore } = await loadStores();
    mock.setHandler(IpcChannels.runDatabaseQuery, async () => ({
      rows: [],
      groups: [],
      totalCount: 0,
    }));
    useVaultStore.setState({ current: FAKE_VAULT });
    useDatabaseStore.getState().setType('book');
    expect(useDatabaseStore.getState().selectedType).toBe('book');
  });

  it('setType(null) clears the slug', async () => {
    const { useDatabaseStore } = await loadStores();
    useDatabaseStore.setState({ selectedType: 'book' });
    useDatabaseStore.getState().setType(null);
    expect(useDatabaseStore.getState().selectedType).toBeNull();
  });

  it('runQuery merges a {type=value} eq filter into the outgoing query when selectedType is set', async () => {
    const { useDatabaseStore, useVaultStore } = await loadStores();
    useVaultStore.setState({ current: FAKE_VAULT });
    useDatabaseStore.setState({ selectedType: 'book' });
    let observed: DatabaseQuery | null = null;
    mock.setHandler(IpcChannels.runDatabaseQuery, async ({ query }) => {
      observed = query;
      return { rows: [], groups: [], totalCount: 0 };
    });

    await useDatabaseStore.getState().runQuery();

    expect(observed).not.toBeNull();
    expect(observed!.filters).toEqual([{ kind: 'eq', key: 'type', value: 'book' }]);
  });

  it('runQuery preserves user filters AND prepends the type filter', async () => {
    const { useDatabaseStore, useVaultStore } = await loadStores();
    useVaultStore.setState({ current: FAKE_VAULT });
    const userFilter: ScalarFilter = { kind: 'eq', key: 'year', value: 1937 };
    useDatabaseStore.setState({
      selectedType: 'book',
      query: { filters: [userFilter], limit: 1000 },
    });
    let observed: DatabaseQuery | null = null;
    mock.setHandler(IpcChannels.runDatabaseQuery, async ({ query }) => {
      observed = query;
      return { rows: [], groups: [], totalCount: 0 };
    });

    await useDatabaseStore.getState().runQuery();

    expect(observed!.filters).toEqual([{ kind: 'eq', key: 'type', value: 'book' }, userFilter]);
  });

  it('runQuery does NOT include a type filter when selectedType is null', async () => {
    const { useDatabaseStore, useVaultStore } = await loadStores();
    useVaultStore.setState({ current: FAKE_VAULT });
    useDatabaseStore.setState({ selectedType: null });
    let observed: DatabaseQuery | null = null;
    mock.setHandler(IpcChannels.runDatabaseQuery, async ({ query }) => {
      observed = query;
      return { rows: [], groups: [], totalCount: 0 };
    });

    await useDatabaseStore.getState().runQuery();

    expect(observed!.filters?.some((f) => f.key === 'type')).toBe(false);
  });
});
