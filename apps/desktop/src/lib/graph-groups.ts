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
