// Small helpers shared across Sidebar dialogs. Kept local to the Sidebar
// folder so the rest of the app doesn't accumulate stringly-typed path
// helpers — the canonical NotePath shape is owned by @synapsium/core.

import type { NotePath } from '@synapsium/core';

/** Characters that are illegal in Windows file names (and confusing on macOS/Linux). */
const ILLEGAL_NAME_RE = /[\\:*?"<>|]/;

/**
 * Validate a single segment (a file basename or a folder name — i.e. no
 * `/` allowed). Returns an Italian error message or null if valid.
 */
export function validateNameSegment(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Il nome non può essere vuoto.';
  if (trimmed === '.' || trimmed === '..') return 'Nome non valido.';
  if (ILLEGAL_NAME_RE.test(trimmed)) {
    return 'Il nome contiene caratteri non validi (\\ : * ? " < > |).';
  }
  if (trimmed.includes('/')) {
    return 'Il nome non può contenere "/" (usa "Nuova cartella" per creare sottocartelle).';
  }
  return null;
}

/**
 * Validate a relative path the user typed for a new note: allow `/` as
 * folder separator, reject illegal characters, reject empty segments
 * (`a//b`).
 */
export function validateRelativeNotePath(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return 'Il percorso non può essere vuoto.';
  if (trimmed.startsWith('/')) return 'Il percorso non può iniziare con "/".';
  const segments = trimmed.split('/');
  for (const seg of segments) {
    const err = validateNameSegment(seg);
    if (err !== null) return err;
  }
  return null;
}

/**
 * Normalize a user-typed note name into a NotePath:
 *   - trim whitespace
 *   - strip a trailing `.md` if the user typed it (we always append it)
 *   - prepend `parentFolder/` if the typed value has no slash
 *   - ensure `.md` suffix
 *
 * `parentFolder` should be the vault-relative folder path (no trailing
 * slash, empty string for vault root).
 */
export function buildNotePath(rawName: string, parentFolder: string): NotePath {
  let name = rawName.trim();
  if (name.toLowerCase().endsWith('.md')) {
    name = name.slice(0, -3);
  }
  const hasExplicitFolder = name.includes('/');
  const fullRel = hasExplicitFolder ? name : parentFolder === '' ? name : `${parentFolder}/${name}`;
  return `${fullRel}.md`;
}

/**
 * Build a NotePath for a new folder (no `.md` suffix, just the relative
 * path). The IPC contract uses NotePath as the type for folder paths too.
 */
export function buildFolderPath(rawName: string, parentFolder: string): NotePath {
  const name = rawName.trim();
  if (name.includes('/')) {
    // User typed a nested path — just normalize it relative to root.
    return name;
  }
  return parentFolder === '' ? name : `${parentFolder}/${name}`;
}

/**
 * Replace the last segment of a path with a new name. Used for renaming.
 * For files, preserves the `.md` extension automatically.
 */
export function replaceLastSegment(
  originalPath: string,
  newSegment: string,
  isFile: boolean,
): string {
  const segments = originalPath.split('/');
  segments.pop();
  let next = newSegment.trim();
  if (isFile) {
    if (next.toLowerCase().endsWith('.md')) {
      next = next.slice(0, -3);
    }
    next = `${next}.md`;
  }
  segments.push(next);
  return segments.join('/');
}

/**
 * Strip the `.md` suffix from a NotePath for display in rename dialogs.
 */
export function stripMdExtension(path: string): string {
  return path.toLowerCase().endsWith('.md') ? path.slice(0, -3) : path;
}
