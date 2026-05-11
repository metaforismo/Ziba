import type { Frontmatter } from '@ziba/core';

/**
 * Flat representation of one relation entry — the kind from the
 * frontmatter map's key and the canonical target title parsed from
 * the wikilink scalar/list value.
 */
export type FrontmatterRelation = { kind: string; target: string };

const WIKILINK_VALUE_RE = /^\[\[([^\]]+)\]\]$/;

function parseWikilinkValue(raw: string): string | null {
  const trimmed = raw.trim();
  const m = trimmed.match(WIKILINK_VALUE_RE);
  if (m === null) return null;
  const inner = m[1] ?? '';
  // Strip piped alias ([[target|alias]] → "target") then heading anchor
  // ([[target#section]] → "target") so the stored target is the bare title.
  const pipe = inner.indexOf('|');
  const beforePipe = pipe === -1 ? inner : inner.slice(0, pipe);
  const hash = beforePipe.indexOf('#');
  const target = (hash === -1 ? beforePipe : beforePipe.slice(0, hash)).trim();
  return target.length === 0 ? null : target;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function relationsFromFrontmatter(fm: Frontmatter): FrontmatterRelation[] {
  const rels = fm.relations;
  if (!isPlainObject(rels)) return [];
  const out: FrontmatterRelation[] = [];
  for (const [kind, value] of Object.entries(rels)) {
    if (typeof value === 'string') {
      const target = parseWikilinkValue(value);
      if (target !== null) out.push({ kind, target });
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item !== 'string') continue;
        const target = parseWikilinkValue(item);
        if (target !== null) out.push({ kind, target });
      }
    }
  }
  return out;
}

export function setRelationInFrontmatter(
  fm: Frontmatter,
  kind: string,
  target: string,
  options?: { alias?: string | null; heading?: string | null },
): Frontmatter {
  // Build the wikilink inner text: [[target#heading|alias]] when provided.
  // Callers that omit `options` get plain [[target]] — backward compatible.
  const alias = options?.alias ?? null;
  const heading = options?.heading ?? null;
  const inner = (() => {
    let base = target;
    if (heading !== null && heading !== '') base = `${target}#${heading}`;
    if (alias !== null && alias !== '') return `${base}|${alias}`;
    return base;
  })();
  const link = `[[${inner}]]`;
  const relsSource = isPlainObject(fm.relations) ? fm.relations : {};
  const existing = relsSource[kind];

  const collectExisting = (): string[] => {
    if (typeof existing === 'string') return [existing];
    if (Array.isArray(existing)) {
      return existing.filter((v): v is string => typeof v === 'string');
    }
    return [];
  };

  const current = collectExisting();
  const currentTargets = new Set(
    current.map((s) => parseWikilinkValue(s)).filter((t): t is string => t !== null),
  );
  // Already present — return a stable new object without duplicating the entry.
  if (currentTargets.has(target)) {
    return { ...fm, relations: { ...relsSource } };
  }
  const nextList = [...current, link];
  // Keep a scalar when there is only one target; promote to list otherwise.
  const nextValue: string | string[] = nextList.length === 1 ? nextList[0]! : nextList;
  return {
    ...fm,
    relations: { ...relsSource, [kind]: nextValue },
  };
}

export function removeRelationFromFrontmatter(
  fm: Frontmatter,
  kind: string,
  target: string,
): Frontmatter {
  if (!isPlainObject(fm.relations)) return fm;
  const rels = { ...fm.relations };
  const existing = rels[kind];

  if (typeof existing === 'string') {
    const parsed = parseWikilinkValue(existing);
    if (parsed === target) delete rels[kind];
  } else if (Array.isArray(existing)) {
    const filtered = existing
      .filter((v): v is string => typeof v === 'string')
      .filter((s) => parseWikilinkValue(s) !== target);
    if (filtered.length === 0) delete rels[kind];
    else if (filtered.length === 1) rels[kind] = filtered[0]!;
    else rels[kind] = filtered;
  }

  // When the relations map is empty, remove the field entirely rather than
  // leaving an empty object in the frontmatter.
  if (Object.keys(rels).length === 0) {
    const next = { ...fm };
    delete next['relations'];
    return next;
  }
  return { ...fm, relations: rels };
}
