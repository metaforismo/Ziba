// Persistence for the recent-vaults list. Stored as a small JSON file in
// the OS-standard user-data dir (e.g. ~/Library/Application Support/...).
//
// We deliberately don't use electron-store or similar -- the data shape is
// trivial and the dependency would dwarf the value.

import { app } from 'electron';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { DEFAULT_SEMANTIC_SETTINGS, type SemanticSettings } from '@ziba/core';
import type { VaultInfo } from '../../shared/ipc.js';

const FILENAME = 'recent-vaults.json';
const MAX_RECENT = 10;
const SEMANTIC_FILENAME = 'semantic-settings.json';

function filePath(): string {
  return path.join(app.getPath('userData'), FILENAME);
}

function semanticFilePath(): string {
  return path.join(app.getPath('userData'), SEMANTIC_FILENAME);
}

export async function getRecentVaults(): Promise<VaultInfo[]> {
  try {
    const raw = await fsp.readFile(filePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive shape check -- discard anything that doesn't look like a
    // VaultInfo so a stale/corrupt file doesn't break the UI.
    return parsed.filter(
      (v): v is VaultInfo =>
        typeof v === 'object' &&
        v !== null &&
        typeof v.root === 'string' &&
        typeof v.name === 'string' &&
        typeof v.openedAt === 'number',
    );
  } catch (err) {
    // Missing file is the normal first-run case — silent.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    if (err instanceof SyntaxError) {
      // JSON parse error: file got corrupted somehow. Log and recover with
      // an empty list rather than crashing the app — but the user should
      // know via the main-process console (visible in dev / `--inspect`).
      console.error('[settings] recent-vaults.json is corrupt, resetting:', err.message);
      return [];
    }
    // Other I/O errors (EACCES, etc.): log so they're visible during
    // troubleshooting, then return empty so the UI keeps working.
    console.error('[settings] failed to read recent-vaults.json:', err);
    return [];
  }
}

export async function pushRecentVault(v: VaultInfo): Promise<void> {
  const existing = await getRecentVaults();
  // Move-to-front semantics: drop any prior entry with the same root, then
  // push the new one to the head. Keep the list bounded.
  const next = [v, ...existing.filter((x) => x.root !== v.root)].slice(0, MAX_RECENT);
  const fp = filePath();
  await fsp.mkdir(path.dirname(fp), { recursive: true });
  await fsp.writeFile(fp, JSON.stringify(next, null, 2), 'utf8');
}

// ---- Semantic-search settings (per-app, not per-vault) ------------------
//
// Provider config (enabled / baseUrl / model) is a machine-level choice —
// the same Ollama daemon serves every vault — so it lives in userData
// alongside recent-vaults. The embeddings themselves are per-vault in
// `<vault>/.ziba/index.db`.

function coerceSemanticSettings(raw: unknown): SemanticSettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SEMANTIC_SETTINGS };
  const r = raw as Partial<SemanticSettings>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_SEMANTIC_SETTINGS.enabled,
    baseUrl:
      typeof r.baseUrl === 'string' && r.baseUrl.trim() !== ''
        ? r.baseUrl.trim()
        : DEFAULT_SEMANTIC_SETTINGS.baseUrl,
    model:
      typeof r.model === 'string' && r.model.trim() !== ''
        ? r.model.trim()
        : DEFAULT_SEMANTIC_SETTINGS.model,
  };
}

export async function getSemanticSettings(): Promise<SemanticSettings> {
  try {
    const raw = await fsp.readFile(semanticFilePath(), 'utf8');
    return coerceSemanticSettings(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...DEFAULT_SEMANTIC_SETTINGS };
    }
    // Corrupt / unreadable: log and fall back to defaults (feature OFF) so
    // the app never breaks over a bad settings file.
    console.error('[settings] semantic-settings.json unreadable, using defaults:', err);
    return { ...DEFAULT_SEMANTIC_SETTINGS };
  }
}

export async function setSemanticSettings(
  patch: Partial<SemanticSettings>,
): Promise<SemanticSettings> {
  const current = await getSemanticSettings();
  const next = coerceSemanticSettings({ ...current, ...patch });
  const fp = semanticFilePath();
  await fsp.mkdir(path.dirname(fp), { recursive: true });
  await fsp.writeFile(fp, JSON.stringify(next, null, 2), 'utf8');
  return next;
}
