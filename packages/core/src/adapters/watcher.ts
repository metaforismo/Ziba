import type { NotePath } from '../types/note.js';

export type WatcherEvent =
  | { type: 'add' | 'change'; path: NotePath; mtimeMs: number }
  | { type: 'unlink'; path: NotePath }
  | { type: 'addDir' | 'unlinkDir'; path: NotePath };

/**
 * File-watcher abstraction. The desktop implementation is chokidar in the
 * Electron main process, forwarding events over IPC to the renderer.
 * Web/mobile implementations would use FileSystem Observer or Expo APIs.
 */
export interface WatcherAdapter {
  start(vaultRoot: string, onEvent: (e: WatcherEvent) => void): Promise<void>;
  stop(): Promise<void>;
}
