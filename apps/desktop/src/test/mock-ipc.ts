import { vi, type Mock } from 'vitest';
import type {
  IndexProgressPayload,
  IpcChannel,
  IpcRequests,
  IpcResponses,
  ZibaApi,
  VaultEventPayload,
} from '../../shared/ipc';
import { IpcChannels } from '../../shared/ipc';

// In-test fake of `window.ziba`.
//
// The renderer talks to Electron through a single `invoke(channel, args)`
// function plus two listener registrations for push events. We mirror
// that shape here with a per-channel handler map: tests register what
// they need, defaults fill in the rest with empty / null values so
// stores boot without crashing.
//
// The returned controller exposes:
//   - `setHandler(channel, fn)` to override or add a handler at runtime
//   - `getCallsFor(channel)` to assert which channels were hit and with
//     what args (each handler is wrapped in a `vi.fn`)
//   - `triggerVaultEvent(payload)` / `triggerIndexProgress(payload)` to
//     fan out a push event to every subscribed listener
//
// Why per-channel `vi.fn`s instead of one big `vi.fn(invoke)`: when a
// test wants to assert "did `db:query` get called with these filters?"
// it shouldn't have to filter through every other invocation made by
// store initializers. Per-channel spies give clean, focused assertions.

type ChannelHandler<C extends IpcChannel> = (
  args: C extends keyof IpcRequests
    ? IpcRequests[C] extends void
      ? undefined
      : IpcRequests[C]
    : unknown,
) => Promise<C extends keyof IpcResponses ? IpcResponses[C] : unknown>;

export type MockHandlers = Partial<{
  [C in IpcChannel]: ChannelHandler<C>;
}>;

export interface MockController {
  /** Replace or add a handler for a single channel. */
  setHandler<C extends IpcChannel>(channel: C, fn: ChannelHandler<C>): void;
  /** Vi-style spy for the handler of a given channel. Useful for `.toHaveBeenCalledWith`. */
  getCallsFor(channel: IpcChannel): Mock['mock']['calls'];
  /** Vi-style spy itself, e.g. for `expect(spy).toHaveBeenCalledTimes(2)`. */
  getSpy(channel: IpcChannel): Mock;
  /** Spy for `onVaultEvent` listener registrations. */
  onVaultEventSpy: Mock;
  /** Spy for `onIndexProgress` listener registrations. */
  onIndexProgressSpy: Mock;
  /** Push a vault event to every subscribed listener. */
  triggerVaultEvent(payload: VaultEventPayload): void;
  /** Push an index-progress event to every subscribed listener. */
  triggerIndexProgress(payload: IndexProgressPayload): void;
  /** Number of vault-event listeners currently registered. */
  vaultEventListenerCount(): number;
  /** Number of index-progress listeners currently registered. */
  indexProgressListenerCount(): number;
}

/** Default handler returns for channels tests don't explicitly set up.
 *  The values match the IPC contract's "empty" return for that channel
 *  so stores can boot in any order without exploding. */
function buildDefaultHandlers(): Required<MockHandlers> {
  // We cast through `unknown` because TypeScript can't infer the
  // mapped-type union here without enumerating each channel.
  // The runtime values do match the IPC contract.
  const defaults = {
    [IpcChannels.pickVaultFolder]: async () => null,
    [IpcChannels.openVault]: async (args: { root: string }) => ({
      root: args.root,
      name: args.root.split('/').pop() ?? 'vault',
      openedAt: Date.now(),
    }),
    [IpcChannels.closeVault]: async () => undefined,
    [IpcChannels.getCurrentVault]: async () => null,
    [IpcChannels.reindexVault]: async () => ({ count: 0 }),

    [IpcChannels.listNotes]: async () => [],
    [IpcChannels.loadNote]: async (args: { path: string }) => ({
      path: args.path,
      title: 'Untitled',
      content: '',
      frontmatter: {},
      wikilinks: [],
      mtimeMs: 0,
    }),
    [IpcChannels.saveNote]: async () => ({ mtimeMs: Date.now() }),
    [IpcChannels.createNote]: async (args: { path: string }) => ({
      path: args.path,
      title: 'Untitled',
      content: '',
      frontmatter: {},
      wikilinks: [],
      mtimeMs: Date.now(),
    }),
    [IpcChannels.renameNote]: async (args: { to: string }) => ({ newPath: args.to }),
    [IpcChannels.deleteNote]: async () => undefined,
    [IpcChannels.searchByTitle]: async () => [],

    [IpcChannels.createFolder]: async () => undefined,
    [IpcChannels.renameFolder]: async () => undefined,
    [IpcChannels.deleteFolder]: async () => undefined,

    [IpcChannels.getBacklinks]: async () => [],
    [IpcChannels.resolveTitle]: async () => null,

    [IpcChannels.searchFullText]: async () => [],
    [IpcChannels.listTags]: async () => [],
    [IpcChannels.getNotesByTag]: async () => [],

    [IpcChannels.runDatabaseQuery]: async () => ({
      rows: [],
      groups: [],
      totalCount: 0,
    }),
    [IpcChannels.getFullGraph]: async () => ({ nodes: [], edges: [] }),

    // v1.0 — taxonomy + relations
    [IpcChannels.listObjectTypes]: async () => [],
    [IpcChannels.upsertObjectType]: async () => undefined,
    [IpcChannels.deleteObjectType]: async () => undefined,
    [IpcChannels.getTypeCounts]: async () => [],
    [IpcChannels.getRelationsBySource]: async () => [],
    [IpcChannels.getRelationsByTarget]: async () => [],

    [IpcChannels.getRecentVaults]: async () => [],
  };
  return defaults as unknown as Required<MockHandlers>;
}

/**
 * Build and install a fake `window.ziba`. Returns a controller
 * tests use to drive behaviour. Calling this is idempotent — each call
 * fully replaces the previous mock (and any previously-attached
 * listeners) so tests don't leak state across `it` blocks.
 */
export function installMockIpc(overrides: MockHandlers = {}): MockController {
  const handlers = { ...buildDefaultHandlers(), ...overrides } as Record<
    IpcChannel,
    ChannelHandler<IpcChannel>
  >;
  // Wrap each handler in vi.fn so we can assert call sites.
  const spies = new Map<IpcChannel, Mock>();
  for (const [channel, fn] of Object.entries(handlers)) {
    spies.set(channel as IpcChannel, vi.fn(fn as (args: unknown) => Promise<unknown>));
  }

  const vaultEventListeners = new Set<(p: VaultEventPayload) => void>();
  const indexProgressListeners = new Set<(p: IndexProgressPayload) => void>();

  const onVaultEventSpy = vi.fn((listener: (p: VaultEventPayload) => void) => {
    vaultEventListeners.add(listener);
    return () => {
      vaultEventListeners.delete(listener);
    };
  });
  const onIndexProgressSpy = vi.fn((listener: (p: IndexProgressPayload) => void) => {
    indexProgressListeners.add(listener);
    return () => {
      indexProgressListeners.delete(listener);
    };
  });

  const api: ZibaApi = {
    invoke: ((channel: IpcChannel, args?: unknown) => {
      const spy = spies.get(channel);
      if (!spy) {
        return Promise.reject(new Error(`No handler for channel '${channel}'`));
      }
      return spy(args);
    }) as ZibaApi['invoke'],
    onVaultEvent: onVaultEventSpy as unknown as ZibaApi['onVaultEvent'],
    onIndexProgress: onIndexProgressSpy as unknown as ZibaApi['onIndexProgress'],
  };

  window.ziba = api;

  return {
    setHandler<C extends IpcChannel>(channel: C, fn: ChannelHandler<C>) {
      const spy = vi.fn(fn as (args: unknown) => Promise<unknown>);
      spies.set(channel, spy);
    },
    getCallsFor(channel) {
      const spy = spies.get(channel);
      if (!spy) return [];
      return spy.mock.calls;
    },
    getSpy(channel) {
      const spy = spies.get(channel);
      if (!spy) throw new Error(`No spy registered for channel '${channel}'`);
      return spy;
    },
    onVaultEventSpy,
    onIndexProgressSpy,
    triggerVaultEvent(payload) {
      for (const l of vaultEventListeners) l(payload);
    },
    triggerIndexProgress(payload) {
      for (const l of indexProgressListeners) l(payload);
    },
    vaultEventListenerCount() {
      return vaultEventListeners.size;
    },
    indexProgressListenerCount() {
      return indexProgressListeners.size;
    },
  };
}
