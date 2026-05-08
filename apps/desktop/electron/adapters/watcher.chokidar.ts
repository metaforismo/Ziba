// Chokidar-backed WatcherAdapter. Translates absolute filesystem events
// to vault-relative NotePaths (forward slashes) before forwarding to the
// caller. Rapid same-file events are debounced (200ms) to coalesce
// editor-save bursts.

import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import type { WatcherAdapter, WatcherEvent } from '@synapsium/core';

const DEBOUNCE_MS = 200;

function toForwardSlashes(p: string): string {
  return p.split(path.sep).join('/');
}

export class ChokidarWatcher implements WatcherAdapter {
  private watcher: FSWatcher | null = null;
  private vaultRoot: string | null = null;

  // Per-path debounce timers. We keep the *latest* event so the emitted
  // event reflects the final state at the end of the burst.
  private pending = new Map<
    string,
    { timer: NodeJS.Timeout; event: WatcherEvent }
  >();

  async start(vaultRoot: string, onEvent: (e: WatcherEvent) => void): Promise<void> {
    if (this.watcher) {
      throw new Error('Watcher already started');
    }
    this.vaultRoot = vaultRoot;

    const watcher = chokidar.watch(vaultRoot, {
      ignored: [
        // Anything inside our own metadata folder.
        /(^|[\\/])\.synapsium($|[\\/])/,
        /(^|[\\/])node_modules($|[\\/])/,
        /(^|[\\/])\.git($|[\\/])/,
        /(^|[\\/])\.DS_Store$/,
      ],
      ignoreInitial: true,
      // Editors often write atomically (tmp + rename); awaitWriteFinish
      // smooths the resulting flurry of FS events into one.
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
      persistent: true,
    });

    this.watcher = watcher;

    const toRel = (abs: string): string => toForwardSlashes(path.relative(vaultRoot, abs));

    const queue = (e: WatcherEvent): void => {
      const key = e.path;
      const existing = this.pending.get(key);
      if (existing) clearTimeout(existing.timer);
      const entry = { event: e, timer: undefined as unknown as NodeJS.Timeout };
      entry.timer = setTimeout(() => {
        this.pending.delete(key);
        onEvent(entry.event);
      }, DEBOUNCE_MS);
      this.pending.set(key, entry);
    };

    watcher.on('add', async (abs: string) => {
      if (!abs.endsWith('.md')) return;
      try {
        const st = await fsp.stat(abs);
        queue({ type: 'add', path: toRel(abs), mtimeMs: st.mtimeMs });
      } catch {
        // File vanished between event and stat -- ignore.
      }
    });

    watcher.on('change', async (abs: string) => {
      if (!abs.endsWith('.md')) return;
      try {
        const st = await fsp.stat(abs);
        queue({ type: 'change', path: toRel(abs), mtimeMs: st.mtimeMs });
      } catch {
        // ignore
      }
    });

    watcher.on('unlink', (abs: string) => {
      if (!abs.endsWith('.md')) return;
      queue({ type: 'unlink', path: toRel(abs) });
    });

    watcher.on('addDir', (abs: string) => {
      // Skip the root itself -- chokidar emits it on startup.
      if (path.resolve(abs) === path.resolve(vaultRoot)) return;
      queue({ type: 'addDir', path: toRel(abs) });
    });

    watcher.on('unlinkDir', (abs: string) => {
      if (path.resolve(abs) === path.resolve(vaultRoot)) return;
      queue({ type: 'unlinkDir', path: toRel(abs) });
    });

    // Resolve when chokidar finishes its initial scan -- the caller can
    // then assume all ongoing events are real changes, not boot-scan noise.
    await new Promise<void>((resolve, reject) => {
      const onReady = (): void => {
        watcher.off('error', onError);
        resolve();
      };
      const onError = (err: unknown): void => {
        watcher.off('ready', onReady);
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      watcher.once('ready', onReady);
      watcher.once('error', onError);
    });
  }

  async stop(): Promise<void> {
    // Drain any pending debounced events without firing them.
    for (const { timer } of this.pending.values()) {
      clearTimeout(timer);
    }
    this.pending.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.vaultRoot = null;
  }
}
