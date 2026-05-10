// Loads `<vault>/.ziba/schema/*.yml` into the SQLite `object_types`
// cache, and writes the seven first-party seed schemas if the schema
// directory is empty.
//
// Called once on `openVault` after the index store is initialized but
// before the renderer is told the vault is ready.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
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
