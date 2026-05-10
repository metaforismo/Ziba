// IPC handlers for typed object types + typed relations (v1.0 phase 1).
//
// All handlers are thin pass-through to the SQLite adapter — the
// validation that matters (slug, schema shape) happens upstream when
// the YAML is loaded into `object_types` on vault open. These
// handlers exist so the renderer doesn't need to know the adapter
// shape directly.

import type { NotePath, ObjectTypeRow, RelationRow, TypeCountRow } from '@ziba/core';
import { requireIndexStore } from '../state.js';

export async function listObjectTypes(): Promise<ObjectTypeRow[]> {
  return requireIndexStore().listObjectTypes();
}

export async function upsertObjectType(args: { row: ObjectTypeRow }): Promise<void> {
  return requireIndexStore().upsertObjectType(args.row);
}

export async function deleteObjectType(args: { id: string }): Promise<void> {
  return requireIndexStore().deleteObjectType(args.id);
}

export async function getTypeCounts(): Promise<TypeCountRow[]> {
  return requireIndexStore().getTypeCounts();
}

export async function getRelationsBySource(args: {
  sourcePath: NotePath;
  kind?: string;
}): Promise<RelationRow[]> {
  return requireIndexStore().getRelations(args);
}

export async function getRelationsByTarget(args: {
  targetPath: NotePath;
  kind?: string;
}): Promise<RelationRow[]> {
  return requireIndexStore().getReverseRelations(args);
}
