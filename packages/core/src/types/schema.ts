// Object-type schemas. The vault carries one YAML file per type in
// `<vault>/.ziba/schema/<id>.yml`; this module defines the parsed
// shape both the indexer (main process) and the editor (renderer)
// agree on.
//
// Schemas are *soft* — they describe the user's intent for a type
// (which properties to surface, which relation kinds make sense) but
// the indexer never refuses a save that diverges. Drift is recoverable
// by deleting + regenerating the schema file.

import { load as yamlLoad, YAMLException } from 'js-yaml';
import type { PropertyType } from './frontmatter';

/**
 * Spec for one property of an object type. Mirrors `PropertyType` from
 * `frontmatter.ts` so the editor / database view can use the same
 * value-rendering machinery they already use for ad-hoc properties.
 */
export type PropertySpec = {
  /** Typed value used for editor input + database column rendering. */
  type: PropertyType;
  /** When true, the editor warns (but does not block) on missing values. */
  required?: boolean;
  /** Human-readable label used in the object panel and database header. */
  label?: string;
};

/**
 * Spec for one outgoing relation kind from this object type.
 *
 * `multiple: true` means the frontmatter `relations:<kind>` accepts a
 * list of wikilinks; `multiple: false` (default) accepts a scalar.
 *
 * `target` is the *expected* type of the relation's target. Soft —
 * a target whose actual `type:` differs is rendered, just flagged in
 * the object panel as "unexpected target type".
 */
export type RelationSpec = {
  target: string;
  multiple?: boolean;
  label?: string;
};

/**
 * An "inverse relation" is rendered in the object panel even though it
 * isn't declared in this note's frontmatter — it's auto-derived from
 * other notes that point at this one with `reverse_of` matching.
 *
 * Example: a `book` schema declares `inverse: { cited_by: { reverse_of: 'cites' } }`,
 * meaning the book's panel should show "Cited by ..." for every note
 * that has `relations: { cites: [[ThisBook]] }`.
 */
export type InverseRelationSpec = {
  reverse_of: string;
  label?: string;
};

/**
 * Top-level shape of one schema yaml. Loaded by `parseSchemaYaml`.
 */
export type ObjectTypeSchema = {
  /** Slug. Lowercase, kebab-case, must match `^[a-z][a-z0-9-]*$`. */
  id: string;
  /** Display name for the type (sidebar, dropdowns). */
  label: string;
  /** Optional emoji or short icon string used in pills + graph nodes. */
  icon?: string;
  /** Optional CSS hex color (#RRGGBB) for sidebar pills + graph hulls. */
  color?: string;
  /** Map from property key → spec. */
  properties: Record<string, PropertySpec>;
  /** Map from relation kind → spec (outgoing). */
  relations: Record<string, RelationSpec>;
  /** Map from inverse-relation kind → spec (auto-derived). */
  inverse: Record<string, InverseRelationSpec>;
};

/**
 * Result of `parseSchemaYaml`: either a successfully-parsed schema or
 * a list of validation issues. We return errors instead of throwing so
 * the schema loader can surface every broken file in one pass on
 * vault open instead of crashing on the first one.
 */
export type SchemaParseResult =
  | { ok: true; schema: ObjectTypeSchema }
  | { ok: false; errors: string[] };

/** Slug regex used by both the parser and the indexer. */
export const TYPE_SLUG_RE = /^[a-z][a-z0-9-]*$/;

const ALLOWED_PROPERTY_TYPES: ReadonlySet<PropertyType> = new Set<PropertyType>([
  'text',
  'number',
  'boolean',
  'date',
  'url',
  'string-array',
]);

/**
 * Parse one schema YAML file's content into an `ObjectTypeSchema`.
 *
 * Returns the full list of validation issues on failure rather than
 * throwing, so the loader on vault open can report every broken
 * schema in one pass instead of stopping on the first.
 */
export function parseSchemaYaml(content: string): SchemaParseResult {
  let raw: unknown;
  try {
    raw = yamlLoad(content);
  } catch (err) {
    const message = err instanceof YAMLException ? err.message : 'invalid YAML';
    return { ok: false, errors: [`yaml parse error: ${message}`] };
  }

  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['schema root must be a mapping'] };
  }

  const errors: string[] = [];
  const obj = raw as Record<string, unknown>;

  const id = obj.id;
  if (typeof id !== 'string' || id.length === 0) {
    errors.push('id is required');
  } else if (!TYPE_SLUG_RE.test(id)) {
    errors.push(`id must be a slug matching ${TYPE_SLUG_RE} (got "${id}")`);
  }

  const label = obj.label;
  if (typeof label !== 'string' || label.length === 0) {
    errors.push('label is required');
  }

  const icon = obj.icon;
  if (icon !== undefined && typeof icon !== 'string') {
    errors.push('icon, when present, must be a string');
  }

  const color = obj.color;
  if (color !== undefined && (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color))) {
    errors.push('color, when present, must be a #RRGGBB hex string');
  }

  const properties: Record<string, PropertySpec> = {};
  const rawProps = obj.properties;
  if (rawProps !== undefined && rawProps !== null) {
    if (typeof rawProps !== 'object' || Array.isArray(rawProps)) {
      errors.push('properties must be a mapping');
    } else {
      for (const [key, value] of Object.entries(rawProps as Record<string, unknown>)) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          errors.push(`properties.${key} must be a mapping`);
          continue;
        }
        const v = value as Record<string, unknown>;
        const t = v.type;
        if (typeof t !== 'string' || !ALLOWED_PROPERTY_TYPES.has(t as PropertyType)) {
          errors.push(`properties.${key}.type is not a known property type (got "${String(t)}")`);
          continue;
        }
        const spec: PropertySpec = { type: t as PropertyType };
        if (v.required === true) spec.required = true;
        if (typeof v.label === 'string') spec.label = v.label;
        properties[key] = spec;
      }
    }
  }

  const relations: Record<string, RelationSpec> = {};
  const rawRels = obj.relations;
  if (rawRels !== undefined && rawRels !== null) {
    if (typeof rawRels !== 'object' || Array.isArray(rawRels)) {
      errors.push('relations must be a mapping');
    } else {
      for (const [key, value] of Object.entries(rawRels as Record<string, unknown>)) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          errors.push(`relations.${key} must be a mapping`);
          continue;
        }
        const v = value as Record<string, unknown>;
        const target = v.target;
        if (typeof target !== 'string' || target.length === 0) {
          errors.push(`relations.${key}.target is required`);
          continue;
        }
        const spec: RelationSpec = { target };
        if (v.multiple === true) spec.multiple = true;
        if (typeof v.label === 'string') spec.label = v.label;
        relations[key] = spec;
      }
    }
  }

  const inverse: Record<string, InverseRelationSpec> = {};
  const rawInv = obj.inverse;
  if (rawInv !== undefined && rawInv !== null) {
    if (typeof rawInv !== 'object' || Array.isArray(rawInv)) {
      errors.push('inverse must be a mapping');
    } else {
      for (const [key, value] of Object.entries(rawInv as Record<string, unknown>)) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          errors.push(`inverse.${key} must be a mapping`);
          continue;
        }
        const v = value as Record<string, unknown>;
        const reverse = v.reverse_of;
        if (typeof reverse !== 'string' || reverse.length === 0) {
          errors.push(`inverse.${key}.reverse_of is required`);
          continue;
        }
        const spec: InverseRelationSpec = { reverse_of: reverse };
        if (typeof v.label === 'string') spec.label = v.label;
        inverse[key] = spec;
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const schema: ObjectTypeSchema = {
    id: id as string,
    label: label as string,
    properties,
    relations,
    inverse,
  };
  if (typeof icon === 'string') schema.icon = icon;
  if (typeof color === 'string') schema.color = color;
  return { ok: true, schema };
}
