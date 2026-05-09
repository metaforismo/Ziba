// Node-backed implementation of FilesystemAdapter for the Electron main
// process. All vault-relative paths in core types use forward slashes; we
// only translate at the OS boundary.
//
// scanVault (in @ziba/core) calls readDir with absolute directory
// paths and stores `entry.path` directly as a NotePath. That requires us
// to compute vault-relative paths inside readDir -- but the adapter
// signature doesn't pass vaultRoot. We solve this by storing the active
// vault root on the adapter via setVaultRoot() at openVault time.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { DirEntry, FilesystemAdapter, NotePath } from '@ziba/core';

function toForwardSlashes(p: string): string {
  return p.split(path.sep).join('/');
}

function fromForwardSlashes(p: NotePath): string {
  return p.split('/').join(path.sep);
}

export class ElectronFilesystemAdapter implements FilesystemAdapter {
  private vaultRoot: string | null = null;

  /**
   * Set the active vault root used by `readDir` to compute vault-relative
   * paths. Should be called once when a vault is opened.
   */
  setVaultRoot(vaultRoot: string | null): void {
    this.vaultRoot = vaultRoot;
  }

  async exists(p: string): Promise<boolean> {
    try {
      await fsp.access(p);
      return true;
    } catch {
      return false;
    }
  }

  async readFile(p: string): Promise<string> {
    return fsp.readFile(p, 'utf8');
  }

  async writeFile(p: string, content: string): Promise<void> {
    await fsp.writeFile(p, content, 'utf8');
  }

  async deleteFile(p: string): Promise<void> {
    await fsp.unlink(p);
  }

  async rename(from: string, to: string): Promise<void> {
    // Make sure the destination's parent exists before renaming -- this
    // saves the caller from doing it for "move into a new folder".
    const parent = path.dirname(to);
    await fsp.mkdir(parent, { recursive: true });
    await fsp.rename(from, to);
  }

  async mkdir(p: string, opts?: { recursive?: boolean }): Promise<void> {
    await fsp.mkdir(p, { recursive: opts?.recursive ?? false });
  }

  async rmdir(p: string, opts?: { recursive?: boolean }): Promise<void> {
    if (opts?.recursive) {
      await fsp.rm(p, { recursive: true, force: true });
    } else {
      await fsp.rmdir(p);
    }
  }

  async readDir(p: string): Promise<DirEntry[]> {
    const dirents = await fsp.readdir(p, { withFileTypes: true });
    const out: DirEntry[] = [];
    for (const d of dirents) {
      const abs = path.join(p, d.name);
      let mtimeMs = 0;
      try {
        const st = await fsp.stat(abs);
        mtimeMs = st.mtimeMs;
      } catch {
        // Entry vanished between readdir and stat -- skip silently.
        continue;
      }
      out.push({
        name: d.name,
        path: this.computeRelative(abs),
        isDirectory: d.isDirectory(),
        mtimeMs,
      });
    }
    return out;
  }

  async stat(p: string): Promise<{ mtimeMs: number; size: number; isDirectory: boolean }> {
    const st = await fsp.stat(p);
    return {
      mtimeMs: st.mtimeMs,
      size: st.size,
      isDirectory: st.isDirectory(),
    };
  }

  resolveAbsolute(vaultRoot: string, relativePath: NotePath): string {
    return path.join(vaultRoot, fromForwardSlashes(relativePath));
  }

  toRelative(vaultRoot: string, absolutePath: string): NotePath {
    return toForwardSlashes(path.relative(vaultRoot, absolutePath));
  }

  private computeRelative(abs: string): NotePath {
    if (!this.vaultRoot) {
      // Fallback: best effort, return the basename. In practice openVault
      // always calls setVaultRoot before any scan triggers readDir.
      return toForwardSlashes(path.basename(abs));
    }
    return toForwardSlashes(path.relative(this.vaultRoot, abs));
  }
}

// Singleton -- there's at most one filesystem per main process in v0.1.
let instance: ElectronFilesystemAdapter | null = null;

export function getFilesystemAdapter(): ElectronFilesystemAdapter {
  if (!instance) instance = new ElectronFilesystemAdapter();
  return instance;
}
