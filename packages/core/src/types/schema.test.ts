import { describe, it, expect } from 'vitest';
import { parseSchemaYaml } from './schema';

describe('parseSchemaYaml — happy path', () => {
  it('parses a minimal valid schema', () => {
    const yaml = `
id: book
label: Libro
properties:
  title:
    type: text
    required: true
relations:
  author:
    target: person
`;
    const result = parseSchemaYaml(yaml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schema.id).toBe('book');
    expect(result.schema.label).toBe('Libro');
    expect(result.schema.properties.title).toEqual({ type: 'text', required: true });
    expect(result.schema.relations.author).toEqual({ target: 'person' });
    expect(result.schema.inverse).toEqual({});
  });

  it('keeps icon and color when provided', () => {
    const result = parseSchemaYaml(`
id: book
label: Libro
icon: 📖
color: "#6366f1"
properties: {}
relations: {}
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schema.icon).toBe('📖');
    expect(result.schema.color).toBe('#6366f1');
  });
});

describe('parseSchemaYaml — validation', () => {
  it('rejects malformed YAML', () => {
    const result = parseSchemaYaml('id: book\n  label: bad-indent: extra');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/yaml/i);
  });

  it('rejects missing `id`', () => {
    const result = parseSchemaYaml(`label: Libro\nproperties: {}\nrelations: {}`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain('id is required');
  });

  it('rejects an `id` that does not match the slug regex', () => {
    const result = parseSchemaYaml(`
id: Book Title!
label: x
properties: {}
relations: {}
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('slug'))).toBe(true);
  });

  it('rejects missing `label`', () => {
    const result = parseSchemaYaml(`id: book\nproperties: {}\nrelations: {}`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain('label is required');
  });

  it('rejects an unknown property type', () => {
    const result = parseSchemaYaml(`
id: book
label: Libro
properties:
  weird:
    type: not-a-type
relations: {}
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('property type'))).toBe(true);
  });

  it('returns ALL errors at once, not just the first', () => {
    const result = parseSchemaYaml(`
properties: {}
relations: {}
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain('id is required');
    expect(result.errors).toContain('label is required');
  });

  it('rejects color that is not a #RRGGBB hex', () => {
    const result = parseSchemaYaml(`
id: book
label: Libro
color: red
properties: {}
relations: {}
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('#RRGGBB'))).toBe(true);
  });
});
