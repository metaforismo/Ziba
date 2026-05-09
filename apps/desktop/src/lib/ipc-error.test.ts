import { describe, expect, it } from 'vitest';
import { extractIpcErrorCode, ipcErrorMessage } from './ipc-error';

// The IPC error wrapper surfaces the canonical code via two paths
// (`err.code` and a `[CODE] ` message prefix) so the renderer can
// branch reliably even if Electron's structured-clone policy changes.
// These tests pin both paths plus the sanitisation done by
// `ipcErrorMessage` for user-facing display.

describe('extractIpcErrorCode', () => {
  it('reads the code from the `code` own property', () => {
    const err = Object.assign(new Error('Una nota a "Foo.md" esiste già.'), {
      code: 'ALREADY_EXISTS' as const,
    });
    expect(extractIpcErrorCode(err)).toBe('ALREADY_EXISTS');
  });

  it('falls back to the `[CODE] ` message prefix when `code` is gone', () => {
    const err = new Error('[NOT_FOUND] La nota non esiste.');
    expect(extractIpcErrorCode(err)).toBe('NOT_FOUND');
  });

  it('returns null for unknown codes (defence against stale parsers)', () => {
    expect(extractIpcErrorCode(new Error('[NOT_A_REAL_CODE] foo'))).toBeNull();
    const odd = Object.assign(new Error('x'), { code: 'WHATEVER' });
    expect(extractIpcErrorCode(odd)).toBeNull();
  });

  it('returns null for non-Error values', () => {
    expect(extractIpcErrorCode(null)).toBeNull();
    expect(extractIpcErrorCode(undefined)).toBeNull();
    expect(extractIpcErrorCode('not-an-error')).toBeNull();
    expect(extractIpcErrorCode(42)).toBeNull();
  });

  it('prefers the explicit `code` field over the message prefix when both are present', () => {
    const err = Object.assign(new Error('[INTERNAL] something'), {
      code: 'ALREADY_EXISTS' as const,
    });
    expect(extractIpcErrorCode(err)).toBe('ALREADY_EXISTS');
  });
});

describe('ipcErrorMessage', () => {
  it('strips a leading `[CODE] ` prefix', () => {
    expect(ipcErrorMessage(new Error('[ALREADY_EXISTS] Una nota già esiste.'))).toBe(
      'Una nota già esiste.',
    );
  });

  it('returns the message unchanged when no prefix is present', () => {
    expect(ipcErrorMessage(new Error('Plain message'))).toBe('Plain message');
  });

  it('passes a string through verbatim', () => {
    expect(ipcErrorMessage('a raw string error')).toBe('a raw string error');
  });

  it('falls back to a generic message for unknown shapes', () => {
    expect(ipcErrorMessage(null)).toBe('Errore sconosciuto');
    expect(ipcErrorMessage(undefined)).toBe('Errore sconosciuto');
    expect(ipcErrorMessage({ random: true })).toBe('Errore sconosciuto');
  });

  it('reads `message` from plain objects (non-Error)', () => {
    // A future serialization path may produce { code, message } plain
    // objects instead of Error instances.
    expect(ipcErrorMessage({ code: 'NOT_FOUND', message: 'no such file' })).toBe('no such file');
    expect(ipcErrorMessage({ message: '[ALREADY_EXISTS] esiste già' })).toBe('esiste già');
  });
});

describe('extractIpcErrorCode — plain object inputs', () => {
  it('reads `code` from a plain object that is not an Error', () => {
    expect(extractIpcErrorCode({ code: 'NOT_FOUND', message: 'gone' })).toBe('NOT_FOUND');
  });

  it('reads the prefix from a plain object message when `code` is absent', () => {
    expect(extractIpcErrorCode({ message: '[ALREADY_EXISTS] dup' })).toBe('ALREADY_EXISTS');
  });
});
