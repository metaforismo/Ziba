// Preload script: runs in an isolated context with access to a tiny slice
// of Node and exposes a typed bridge to the renderer.
//
// The renderer never touches `ipcRenderer` directly -- it goes through
// `window.ziba`, whose surface is the `ZibaApi` interface in
// `shared/ipc.ts`. That keeps the IPC contract explicit and makes it
// straightforward to swap the transport layer later (e.g. for a web
// build that talks to a service worker instead of the main process).

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IpcChannels,
  type DatabaseViewsChangedPayload,
  type IndexProgressPayload,
  type IpcRequests,
  type IpcResponses,
  type ZibaApi,
  type VaultEventPayload,
} from '../shared/ipc.js';

const api: ZibaApi = {
  invoke<C extends keyof IpcRequests>(
    channel: C,
    ...args: IpcRequests[C] extends void ? [] : [IpcRequests[C]]
  ): Promise<IpcResponses[C]> {
    // `args` may be empty for void-payload channels; ipcRenderer.invoke
    // tolerates undefined as the payload, which is what we want.
    const payload = args.length > 0 ? (args[0] as IpcRequests[C]) : undefined;
    return ipcRenderer.invoke(channel, payload) as Promise<IpcResponses[C]>;
  },

  onVaultEvent(listener: (payload: VaultEventPayload) => void): () => void {
    const wrapped = (_e: IpcRendererEvent, payload: VaultEventPayload): void => {
      listener(payload);
    };
    ipcRenderer.on(IpcChannels.vaultEvent, wrapped);
    return () => {
      ipcRenderer.off(IpcChannels.vaultEvent, wrapped);
    };
  },

  onIndexProgress(listener: (payload: IndexProgressPayload) => void): () => void {
    const wrapped = (_e: IpcRendererEvent, payload: IndexProgressPayload): void => {
      listener(payload);
    };
    ipcRenderer.on(IpcChannels.indexProgress, wrapped);
    return () => {
      ipcRenderer.off(IpcChannels.indexProgress, wrapped);
    };
  },

  onDatabaseViewsChanged(listener: (payload: DatabaseViewsChangedPayload) => void): () => void {
    const wrapped = (_e: IpcRendererEvent, payload: DatabaseViewsChangedPayload): void => {
      listener(payload);
    };
    ipcRenderer.on(IpcChannels.databaseViewsChanged, wrapped);
    return () => {
      ipcRenderer.off(IpcChannels.databaseViewsChanged, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld('ziba', api);
