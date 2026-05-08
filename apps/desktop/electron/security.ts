// Centralised security helpers for the IPC boundary.
//
// Two things matter here:
//   1. Path validation: a malicious or buggy renderer could send paths like
//      `../../etc/passwd` and trick our handlers into reading/writing
//      outside the open vault. `assertVaultRelative` rejects those before
//      we touch the filesystem; `assertResolvedWithinVault` is a defence
//      in depth after `path.resolve`.
//   2. Error translation: Electron's `ipcMain.handle` serialises rejections
//      with the full stack trace and absolute paths. We wrap handlers so
//      the renderer only sees a sanitised `{ code, message }` shape, and
//      the full error stays in the main-process console where it belongs.

import path from 'node:path';
import type { NotePath } from '@synapsium/core';

export type IpcErrorCode =
  | 'NO_VAULT'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'INVALID_PATH'
  | 'INVALID_QUERY'
  | 'PERMISSION_DENIED'
  | 'INTERNAL';

/** Thrown by IPC handlers; the channel wrapper translates to a sanitised error. */
export class IpcError extends Error {
  readonly code: IpcErrorCode;
  constructor(code: IpcErrorCode, message: string) {
    super(message);
    this.name = 'IpcError';
    this.code = code;
  }
}

/**
 * Reject paths that try to escape the vault or that contain dangerous
 * characters. Vault-relative paths must:
 *   - be non-empty
 *   - use forward slashes
 *   - not start with `/`
 *   - not contain a `..` segment
 *   - not be a Windows-absolute path (`C:\…`)
 *   - not contain a NUL byte (filesystem injection vector on POSIX)
 */
export function assertVaultRelative(p: unknown): asserts p is NotePath {
  if (typeof p !== 'string' || p.length === 0) {
    throw new IpcError('INVALID_PATH', 'Il percorso non può essere vuoto.');
  }
  if (p.includes('\0')) {
    throw new IpcError('INVALID_PATH', 'Il percorso contiene caratteri non validi.');
  }
  if (p.startsWith('/') || p.startsWith('\\')) {
    throw new IpcError('INVALID_PATH', 'Il percorso deve essere relativo al vault.');
  }
  // Windows drive letter, e.g. C:foo or C:\foo
  if (/^[A-Za-z]:/.test(p)) {
    throw new IpcError('INVALID_PATH', 'Il percorso deve essere relativo al vault.');
  }
  // Reject any segment that's `..` — covers `../foo`, `foo/../bar`,
  // `foo/..`, etc. Also reject single-`.` segments because they hint at
  // sloppy normalisation upstream.
  const segments = p.split(/[/\\]/);
  for (const seg of segments) {
    if (seg === '..' || seg === '.') {
      throw new IpcError('INVALID_PATH', 'Il percorso non può contenere "." o "..".');
    }
  }
}

/**
 * Belt-and-braces check: after `path.resolve(vaultRoot, relPath)` we expect
 * the result to live inside `vaultRoot`. Defends against tricks the path
 * validator might miss (symlinks, normalised forms we didn't anticipate).
 */
export function assertResolvedWithinVault(vaultRoot: string, resolvedAbs: string): void {
  const root = path.resolve(vaultRoot);
  const abs = path.resolve(resolvedAbs);
  // Accept the vault root itself and anything underneath it.
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new IpcError('INVALID_PATH', 'Il percorso risolve fuori dal vault.');
  }
}

/**
 * Serialised shape sent across IPC. Renderer reads `code` to branch and
 * `message` for display. Field naming matches `IpcError`.
 */
export type SerializedIpcError = {
  code: IpcErrorCode;
  message: string;
};

/**
 * Translate an arbitrary error into the sanitised wire shape. Logs the
 * full error to the main-process console (preserving stack + system
 * paths) but never exposes those to the renderer.
 */
export function toSerializedError(err: unknown): SerializedIpcError {
  if (err instanceof IpcError) {
    return { code: err.code, message: err.message };
  }
  if (err && typeof err === 'object' && 'code' in err) {
    const sysCode = (err as NodeJS.ErrnoException).code;
    if (sysCode === 'ENOENT') {
      return { code: 'NOT_FOUND', message: 'File o cartella non trovato.' };
    }
    if (sysCode === 'EEXIST') {
      return { code: 'ALREADY_EXISTS', message: 'File o cartella già esistente.' };
    }
    if (sysCode === 'EACCES' || sysCode === 'EPERM') {
      return { code: 'PERMISSION_DENIED', message: 'Permesso negato.' };
    }
  }
  // Log the raw error for debugging; renderer gets a generic message.
  console.error('[ipc] unexpected error:', err);
  return { code: 'INTERNAL', message: 'Errore interno. Controlla i log.' };
}
