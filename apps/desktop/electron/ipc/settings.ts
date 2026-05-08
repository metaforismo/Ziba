// Persistence for the recent-vaults list. Stored as a small JSON file in
// the OS-standard user-data dir (e.g. ~/Library/Application Support/...).
//
// We deliberately don't use electron-store or similar -- the data shape is
// trivial and the dependency would dwarf the value.

import { app } from 'electron';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import type { VaultInfo } from '../../shared/ipc.js';

const FILENAME = 'recent-vaults.json';
const MAX_RECENT = 10;

function filePath(): string {
  return path.join(app.getPath('userData'), FILENAME);
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
    // Missing file is the normal first-run case.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
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
