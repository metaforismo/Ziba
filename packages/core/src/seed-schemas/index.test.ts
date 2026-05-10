import { describe, it, expect } from 'vitest';
import { SEED_SCHEMAS, SEED_SCHEMA_IDS } from './index';
import { parseSchemaYaml } from '../types/schema';

describe('seed schemas', () => {
  it('exposes the canonical seven', () => {
    expect(SEED_SCHEMA_IDS).toEqual([
      'note',
      'person',
      'book',
      'project',
      'idea',
      'daily',
      'meeting',
    ]);
  });

  it('every seed parses cleanly', () => {
    for (const id of SEED_SCHEMA_IDS) {
      const yaml = SEED_SCHEMAS[id];
      const result = parseSchemaYaml(yaml);
      if (!result.ok) {
        throw new Error(`seed "${id}" failed to parse: ${result.errors.join(', ')}`);
      }
      expect(result.schema.id).toBe(id);
      expect(result.schema.label.length).toBeGreaterThan(0);
    }
  });

  it('each seed has at least an icon and a color', () => {
    for (const id of SEED_SCHEMA_IDS) {
      const result = parseSchemaYaml(SEED_SCHEMAS[id]);
      if (!result.ok) throw new Error('parse error');
      expect(result.schema.icon).toBeDefined();
      expect(result.schema.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
