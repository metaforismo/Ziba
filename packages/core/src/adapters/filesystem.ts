import type { NotePath } from '../types/note.js';

export type DirEntry = {
  name: string;
  path: NotePath;
  isDirectory: boolean;
  mtimeMs: number;
};

/**
 * Platform-agnostic filesystem interface used by `packages/core` to read
 * and mutate the vault. Concrete implementations live in the apps:
 * `fs/promises` in Electron's main process, FileSystem Access API in the
 * web app, Expo FileSystem on mobile.
 *
 * All methods receive paths exactly as produced by `resolveAbsolute` (or
 * absolute paths the implementation chose), with the exception of
 * `resolveAbsolute`/`toRelative` which are the only translators between
 * vault-relative and platform-absolute paths.
 */
export interface FilesystemAdapter {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  rmdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  readDir(path: string): Promise<DirEntry[]>;
  stat(path: string): Promise<{ mtimeMs: number; size: number; isDirectory: boolean }>;

  /** Resolve a vault-relative path to absolute (platform-specific separator). */
  resolveAbsolute(vaultRoot: string, relativePath: NotePath): string;

  /** Resolve absolute path back to vault-relative (forward slashes). */
  toRelative(vaultRoot: string, absolutePath: string): NotePath;
}
