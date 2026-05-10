// Loads `<vault>/.ziba/schema/*.yml` into the SQLite `object_types`
// cache, and writes the seven first-party seed schemas if the schema
// directory is empty.
//
// Called once on `openVault` after the index store is initialized but
// before the renderer is told the vault is ready.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import {
  INDEX_DIR_NAME,
  SEED_SCHEMAS,
  SEED_SCHEMA_IDS,
  parseSchemaYaml,
  type IndexStoreAdapter,
  type ObjectTypeRow,
} from '@ziba/core';

const SCHEMA_DIR_NAME = 'schema';

/**
 * Ensure `<vault>/.ziba/schema/` exists. If it's empty (no `.yml`
 * files), copy the seed schemas in. Existing files are NEVER
 * overwritten — the user owns this directory.
 */
async function ensureSeedSchemas(vaultRoot: string): Promise<void> {
  const dir = path.join(vaultRoot, INDEX_DIR_NAME, SCHEMA_DIR_NAME);
  await fsp.mkdir(dir, { recursive: true });
  const existing = await fsp.readdir(dir);
  const yamls = existing.filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  if (yamls.length > 0) return;

  for (const id of SEED_SCHEMA_IDS) {
    const target = path.join(dir, `${id}.yml`);
    await fsp.writeFile(target, SEED_SCHEMAS[id], 'utf8');
  }
}

/**
 * Read every `.yml` in the schema dir, parse it, and upsert into the
 * `object_types` cache. Schemas that fail to parse are LOGGED and
 * skipped — one broken file shouldn't prevent the rest from loading.
 *
 * Returns the count of types successfully loaded; the caller can
 * surface a one-line summary on the renderer side if it wants.
 */
async function loadSchemasIntoStore(vaultRoot: string, store: IndexStoreAdapter): Promise<number> {
  const dir = path.join(vaultRoot, INDEX_DIR_NAME, SCHEMA_DIR_NAME);
  let entries: string[];
  try {
    entries = await fsp.readdir(dir);
  } catch {
    return 0;
  }

  let loaded = 0;
  for (const file of entries) {
    if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
    const full = path.join(dir, file);
    let content: string;
    let mtimeMs: number;
    try {
      content = await fsp.readFile(full, 'utf8');
      const stat = await fsp.stat(full);
      mtimeMs = stat.mtimeMs;
    } catch (err) {
      console.error(`[schema-loader] failed to read ${full}:`, err);
      continue;
    }

    const result = parseSchemaYaml(content);
    if (!result.ok) {
      console.error(`[schema-loader] schema "${file}" has errors:`, result.errors);
      continue;
    }

    const row: ObjectTypeRow = {
      id: result.schema.id,
      label: result.schema.label,
      icon: result.schema.icon ?? null,
      color: result.schema.color ?? null,
      schema: result.schema,
      mtimeMs,
    };
    await store.upsertObjectType(row);
    loaded += 1;
  }
  return loaded;
}

/**
 * One-shot bootstrap: ensure seeds, then load every schema into the
 * cache. Idempotent — safe to call on every vault open.
 */
export async function bootstrapSchemas(
  vaultRoot: string,
  store: IndexStoreAdapter,
): Promise<{ loaded: number }> {
  await ensureSeedSchemas(vaultRoot);
  const loaded = await loadSchemasIntoStore(vaultRoot, store);
  return { loaded };
}

/**
 * Process a single schema file event. Re-reads + parses + upserts into
 * the store; on parse failure or read error, logs and leaves the prior
 * cache row in place (so a transient editor mid-save doesn't blow away
 * a working schema).
 *
 * `unlink` is special: we delete the type from the cache immediately —
 * a removed yaml is the user's explicit "drop this type" gesture.
 */
async function applySchemaFileEvent(
  full: string,
  event: 'add' | 'change' | 'unlink',
  store: IndexStoreAdapter,
): Promise<void> {
  if (event === 'unlink') {
    // Derive the type id from the filename: `<id>.yml` or `<id>.yaml`.
    // We don't have access to the schema content (the file is gone),
    // so the filename is the only available key.
    const base = path.basename(full).replace(/\.(yml|yaml)$/i, '');
    if (base.length > 0) {
      try {
        await store.deleteObjectType(base);
      } catch (err) {
        console.error(`[schema-loader] failed to drop type "${base}":`, err);
      }
    }
    return;
  }

  let content: string;
  let mtimeMs: number;
  try {
    content = await fsp.readFile(full, 'utf8');
    const stat = await fsp.stat(full);
    mtimeMs = stat.mtimeMs;
  } catch (err) {
    console.error(`[schema-loader] failed to read ${full}:`, err);
    return;
  }

  const result = parseSchemaYaml(content);
  if (!result.ok) {
    console.error(`[schema-loader] schema "${full}" has errors:`, result.errors);
    return;
  }

  const row: ObjectTypeRow = {
    id: result.schema.id,
    label: result.schema.label,
    icon: result.schema.icon ?? null,
    color: result.schema.color ?? null,
    schema: result.schema,
    mtimeMs,
  };
  await store.upsertObjectType(row);
}

/**
 * Watch `<vault>/.ziba/schema/` for `.yml` / `.yaml` changes and
 * sync them into the `object_types` cache. Each event additionally
 * fires `onChanged()` so the caller can push a `schemasChanged`
 * event to the renderer (which refreshes the sidebar TypesSection
 * and the ObjectPanel labels in place — no vault re-open required).
 *
 * Returned `stop()` unwatches and releases handles. Call it on
 * vault close so a subsequent `openVault` can install a fresh
 * watcher against the new vault.
 *
 * The watcher is independent from the main vault watcher because the
 * latter explicitly skips `.ziba/` to avoid recursing into our own
 * cache directory.
 */
export function watchSchemas(
  vaultRoot: string,
  store: IndexStoreAdapter,
  onChanged: () => void,
): { stop: () => Promise<void> } {
  const dir = path.join(vaultRoot, INDEX_DIR_NAME, SCHEMA_DIR_NAME);
  const watcher: FSWatcher = chokidar.watch(dir, {
    ignored: (p) => {
      // Only watch yaml files. chokidar may emit events for the dir
      // itself or for non-yaml siblings; we filter them out cheaply.
      if (p === dir) return false;
      return !/\.(yml|yaml)$/i.test(p);
    },
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });

  const handle =
    (event: 'add' | 'change' | 'unlink') =>
    async (full: string): Promise<void> => {
      await applySchemaFileEvent(full, event, store);
      onChanged();
    };
  watcher.on('add', (p: string): void => {
    void handle('add')(p);
  });
  watcher.on('change', (p: string): void => {
    void handle('change')(p);
  });
  watcher.on('unlink', (p: string): void => {
    void handle('unlink')(p);
  });

  return {
    stop: async (): Promise<void> => {
      await watcher.close();
    },
  };
}
