// Helpers for working with the sanitised errors thrown by the IPC bridge.
//
// The main process wraps every handler with a translator that sets a
// short canonical `code` (NO_VAULT, NOT_FOUND, ALREADY_EXISTS,
// INVALID_PATH, INVALID_QUERY, PERMISSION_DENIED, INTERNAL — see
// `electron/security.ts`). The wrapper surfaces the code in two
// independent ways so the renderer can branch reliably:
//
//   1. as an own enumerable `code` property on the rejected Error,
//   2. as a `[CODE] ` prefix on the error message.
//
// The first path is the normal one. The second is a safety net in case
// a future Electron version (or a custom transport like a web build)
// strips own properties during serialization. `extractIpcErrorCode`
// reads both and returns whichever it finds first; pure typo-noise
// codes the renderer doesn't know about return `null`.

import { IPC_ERROR_CODES, type IpcErrorCode } from '../../shared/ipc';

const PREFIX_RE = /^\[([A-Z_]+)\]\s/;

export function extractIpcErrorCode(err: unknown): IpcErrorCode | null {
  if (err === null || err === undefined) return null;

  // Path 1: own `code` property.
  if (typeof err === 'object' && 'code' in err) {
    const candidate = (err as { code: unknown }).code;
    if (typeof candidate === 'string' && (IPC_ERROR_CODES as ReadonlySet<string>).has(candidate)) {
      return candidate as IpcErrorCode;
    }
  }

  // Path 2: parse `[CODE] ...` prefix from message.
  const message = readMessageString(err);
  if (message !== null) {
    const m = message.match(PREFIX_RE);
    if (m !== null) {
      const code = m[1];
      if (code !== undefined && (IPC_ERROR_CODES as ReadonlySet<string>).has(code)) {
        return code as IpcErrorCode;
      }
    }
  }

  return null;
}

/**
 * Strip the `[CODE] ` prefix from a message so it can be shown to the
 * user without exposing the implementation-detail tag. If no prefix
 * is present, returns the original message unchanged.
 *
 * Accepts both `Error` instances and plain `{ message: string }`
 * objects: a future serialization path (e.g. a web build that posts
 * `SerializedIpcError` JSON over a service-worker bridge) would
 * otherwise silently degrade to "Errore sconosciuto" because the
 * payload never reaches an `Error` instance on the renderer side.
 */
export function ipcErrorMessage(err: unknown): string {
  const message = readMessageString(err);
  if (message !== null) return message.replace(PREFIX_RE, '');
  if (typeof err === 'string') return err;
  return 'Errore sconosciuto';
}

function readMessageString(err: unknown): string | null {
  if (err instanceof Error) return err.message;
  if (err !== null && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return null;
}
