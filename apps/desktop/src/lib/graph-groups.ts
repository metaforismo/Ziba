import type { GraphGroupRule } from './graph-settings';

export type GraphGroupQueryToken =
  | { kind: 'plain'; value: string }
  | { kind: 'type'; value: string }
  | { kind: 'file'; value: string }
  | { kind: 'path'; value: string }
  | { kind: 'folder'; value: string };

export type ParsedGraphGroupQuery = {
  clauses: GraphGroupQueryToken[][];
};

export type GraphGroupMatchNode = {
  path: string;
  title: string;
  type: string | null;
};

export const AUTO_GRAPH_GROUP_LIMIT = 6;

// Muted defaults for automatic folder groups. Green is intentionally absent so
// semantic/manual green choices keep their visual meaning.
export const AUTO_GRAPH_GROUP_COLORS = [
  '#64748b',
  '#6366f1',
  '#8b5cf6',
  '#d97706',
  '#dc2626',
  '#2563eb',
] as const;

type ScannedToken = {
  raw: string;
  quoted: boolean;
};

function scanQuery(query: string): ScannedToken[] {
  const tokens: ScannedToken[] = [];
  let raw = '';
  let inQuote = false;
  let quoted = false;
  let escaping = false;

  const push = (): void => {
    const trimmed = raw.trim();
    if (trimmed !== '') tokens.push({ raw: trimmed, quoted });
    raw = '';
    quoted = false;
  };

  for (const ch of query) {
    if (escaping) {
      raw += ch;
      escaping = false;
      continue;
    }

    if (inQuote && ch === '\\') {
      escaping = true;
      continue;
    }

    if (ch === '"') {
      inQuote = !inQuote;
      quoted = true;
      continue;
    }

    if (!inQuote && /\s/.test(ch)) {
      push();
      continue;
    }

    raw += ch;
  }

  if (escaping) raw += '\\';
  push();
  return tokens;
}

function parseToken(raw: string): GraphGroupQueryToken | null {
  const colonIndex = raw.indexOf(':');
  if (colonIndex > 0) {
    const field = raw.slice(0, colonIndex).trim().toLowerCase();
    const value = raw.slice(colonIndex + 1).trim();
    if (value === '') return null;
    if (field === 'type' || field === 'file' || field === 'path' || field === 'folder') {
      return { kind: field, value };
    }
  }

  return raw === '' ? null : { kind: 'plain', value: raw };
}

export function parseGraphGroupQuery(query: string): ParsedGraphGroupQuery {
  const clauses: GraphGroupQueryToken[][] = [];
  let current: GraphGroupQueryToken[] = [];

  for (const scanned of scanQuery(query)) {
    if (!scanned.quoted && scanned.raw.toUpperCase() === 'OR') {
      if (current.length > 0) {
        clauses.push(current);
        current = [];
      }
      continue;
    }

    const token = parseToken(scanned.raw);
    if (token !== null) current.push(token);
  }

  if (current.length > 0) clauses.push(current);
  return { clauses };
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePath(value: string): string {
  return normalizeText(value)
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function fileStemFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const basename = normalized.split('/').pop() ?? normalized;
  return basename.replace(/\.[^.]+$/u, '');
}

function tokenMatchesNode(node: GraphGroupMatchNode, token: GraphGroupQueryToken): boolean {
  const value = normalizeText(token.value);
  if (value === '') return false;

  if (token.kind === 'type') {
    return normalizeText(node.type ?? '') === value;
  }

  const path = normalizePath(node.path);
  if (token.kind === 'file') {
    const file = normalizeText(fileStemFromPath(node.path));
    return file.includes(value) || normalizeText(node.title).includes(value);
  }

  if (token.kind === 'path') {
    return path.includes(normalizePath(token.value));
  }

  if (token.kind === 'folder') {
    const folder = normalizePath(token.value);
    return path === folder || path.startsWith(`${folder}/`) || path.includes(`/${folder}/`);
  }

  return normalizeText(node.title).includes(value) || path.includes(normalizePath(token.value));
}

export function graphGroupQueryMatchesNode(
  node: GraphGroupMatchNode,
  query: string | ParsedGraphGroupQuery,
): boolean {
  const parsed = typeof query === 'string' ? parseGraphGroupQuery(query) : query;
  if (parsed.clauses.length === 0) return false;
  return parsed.clauses.some((clause) => clause.every((token) => tokenMatchesNode(node, token)));
}

function topLevelFolder(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (normalized === '') return null;

  const first = normalized.split('/')[0]?.trim() ?? '';
  if (first === '') return null;
  if (!normalized.includes('/') && /\.md$/i.test(first)) return null;
  return first;
}

function slugForFolder(folder: string, index: number): string {
  const slug = folder
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? `folder-${index + 1}` : slug;
}

function quotedQueryValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function buildAutoGraphGroupsFromFolders(folders: readonly string[]): GraphGroupRule[] {
  const topLevelFolders: string[] = [];
  const seenFolders = new Set<string>();

  for (const path of folders) {
    const folder = topLevelFolder(path);
    if (folder === null) continue;

    const key = normalizePath(folder);
    if (seenFolders.has(key)) continue;

    seenFolders.add(key);
    topLevelFolders.push(folder);
    if (topLevelFolders.length >= AUTO_GRAPH_GROUP_LIMIT) break;
  }

  const usedIds = new Set<string>();
  return topLevelFolders.map((folder, index) => {
    const baseId = `auto-folder-${slugForFolder(folder, index)}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);

    return {
      id,
      name: folder,
      query: `path:${quotedQueryValue(folder)}`,
      color:
        AUTO_GRAPH_GROUP_COLORS[index % AUTO_GRAPH_GROUP_COLORS.length] ??
        AUTO_GRAPH_GROUP_COLORS[0],
      enabled: true,
    };
  });
}
