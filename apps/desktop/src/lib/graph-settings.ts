export type GraphQueryFilters = {
  search: string;
  tags: string[];
  folders: string[];
  paths: string[];
  types: string[];
  relationKinds: string[];
  includeUnresolved: boolean;
  includeOrphans: boolean;
  existingOnly: boolean;
  focusMode: boolean;
  localDepth: number;
};

export type GraphDisplaySettings = {
  showArrows: boolean;
  showText: boolean;
  showNodes: boolean;
  showLinks: boolean;
  labelFade: number;
  nodeScale: number;
  linkWidth: number;
  showGrid: boolean;
};

export type GraphForceSettings = {
  center: number;
  repel: number;
  link: number;
  linkDistance: number;
  nodeDistance: number;
  linkOpacity: number;
};

export type GraphGroupRule = {
  id: string;
  name: string;
  query: string;
  color: string;
  enabled: boolean;
};

export type GraphSettings = {
  query: GraphQueryFilters;
  display: GraphDisplaySettings;
  forces: GraphForceSettings;
  groups: GraphGroupRule[];
  groupsSeeded: boolean;
};

export const GRAPH_SETTINGS_STORAGE_KEY = 'ziba.graph-settings.v1';

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  query: {
    search: '',
    tags: [],
    folders: [],
    paths: [],
    types: [],
    relationKinds: [],
    includeUnresolved: true,
    includeOrphans: true,
    existingOnly: false,
    focusMode: false,
    localDepth: 1,
  },
  display: {
    showArrows: false,
    showText: true,
    showNodes: true,
    showLinks: true,
    labelFade: 0.48,
    nodeScale: 1,
    linkWidth: 0.7,
    showGrid: false,
  },
  forces: {
    center: 0.08,
    repel: 420,
    link: 0.08,
    linkDistance: 96,
    nodeDistance: 32,
    linkOpacity: 0.18,
  },
  groups: [],
  groupsSeeded: false,
};

const DISPLAY_LIMITS = {
  labelFade: [0, 1],
  nodeScale: [0.2, 3],
  linkWidth: [0.1, 4],
} as const;

const FORCE_LIMITS = {
  center: [0, 1],
  repel: [0, 1200],
  link: [0, 1],
  linkDistance: [10, 320],
  nodeDistance: [0, 180],
  linkOpacity: [0, 1],
} as const;

function cloneDefaults(): GraphSettings {
  return {
    query: {
      ...DEFAULT_GRAPH_SETTINGS.query,
      tags: [],
      folders: [],
      paths: [],
      types: [],
      relationKinds: [],
    },
    display: { ...DEFAULT_GRAPH_SETTINGS.display },
    forces: { ...DEFAULT_GRAPH_SETTINGS.forces },
    groups: [],
    groupsSeeded: DEFAULT_GRAPH_SETTINGS.groupsSeeded,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stringArray(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  if (!v.every((item): item is string => typeof item === 'string')) return fallback;
  return [...v];
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function finiteNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function boundedNumber(v: unknown, fallback: number, lo: number, hi: number): number {
  return clamp(finiteNumber(v, fallback), lo, hi);
}

function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
}

export function validateGraphSettings(raw: unknown): GraphSettings {
  const defaults = cloneDefaults();
  if (!isRecord(raw)) return defaults;

  const query = isRecord(raw.query) ? raw.query : {};
  const display = isRecord(raw.display) ? raw.display : {};
  const forces = isRecord(raw.forces) ? raw.forces : {};

  const groups = Array.isArray(raw.groups)
    ? raw.groups.flatMap((item): GraphGroupRule[] => {
        if (!isRecord(item)) return [];
        const { id, name, query: groupQuery, color, enabled } = item;
        if (
          typeof id !== 'string' ||
          id.trim() === '' ||
          typeof name !== 'string' ||
          typeof groupQuery !== 'string' ||
          !isHexColor(color) ||
          typeof enabled !== 'boolean'
        ) {
          return [];
        }
        return [{ id, name, query: groupQuery, color, enabled }];
      })
    : defaults.groups;

  return {
    query: {
      search: typeof query.search === 'string' ? query.search : defaults.query.search,
      tags: stringArray(query.tags, defaults.query.tags),
      folders: stringArray(query.folders, defaults.query.folders),
      paths: stringArray(query.paths, defaults.query.paths),
      types: stringArray(query.types, defaults.query.types),
      relationKinds: stringArray(query.relationKinds, defaults.query.relationKinds),
      includeUnresolved: bool(query.includeUnresolved, defaults.query.includeUnresolved),
      includeOrphans: bool(query.includeOrphans, defaults.query.includeOrphans),
      existingOnly: bool(query.existingOnly, defaults.query.existingOnly),
      focusMode: bool(query.focusMode, defaults.query.focusMode),
      localDepth: boundedNumber(query.localDepth, defaults.query.localDepth, 0, 6),
    },
    display: {
      showArrows: bool(display.showArrows, defaults.display.showArrows),
      showText: bool(display.showText, defaults.display.showText),
      showNodes: bool(display.showNodes, defaults.display.showNodes),
      showLinks: bool(display.showLinks, defaults.display.showLinks),
      labelFade: boundedNumber(
        display.labelFade,
        defaults.display.labelFade,
        DISPLAY_LIMITS.labelFade[0],
        DISPLAY_LIMITS.labelFade[1],
      ),
      nodeScale: boundedNumber(
        display.nodeScale,
        defaults.display.nodeScale,
        DISPLAY_LIMITS.nodeScale[0],
        DISPLAY_LIMITS.nodeScale[1],
      ),
      linkWidth: boundedNumber(
        display.linkWidth,
        defaults.display.linkWidth,
        DISPLAY_LIMITS.linkWidth[0],
        DISPLAY_LIMITS.linkWidth[1],
      ),
      showGrid: bool(display.showGrid, defaults.display.showGrid),
    },
    forces: {
      center: boundedNumber(
        forces.center,
        defaults.forces.center,
        FORCE_LIMITS.center[0],
        FORCE_LIMITS.center[1],
      ),
      repel: boundedNumber(
        forces.repel,
        defaults.forces.repel,
        FORCE_LIMITS.repel[0],
        FORCE_LIMITS.repel[1],
      ),
      link: boundedNumber(
        forces.link,
        defaults.forces.link,
        FORCE_LIMITS.link[0],
        FORCE_LIMITS.link[1],
      ),
      linkDistance: boundedNumber(
        forces.linkDistance,
        defaults.forces.linkDistance,
        FORCE_LIMITS.linkDistance[0],
        FORCE_LIMITS.linkDistance[1],
      ),
      nodeDistance: boundedNumber(
        forces.nodeDistance,
        defaults.forces.nodeDistance,
        FORCE_LIMITS.nodeDistance[0],
        FORCE_LIMITS.nodeDistance[1],
      ),
      linkOpacity: boundedNumber(
        forces.linkOpacity,
        defaults.forces.linkOpacity,
        FORCE_LIMITS.linkOpacity[0],
        FORCE_LIMITS.linkOpacity[1],
      ),
    },
    groups,
    groupsSeeded: bool(raw.groupsSeeded, defaults.groupsSeeded),
  };
}

function loadAllSettings(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(GRAPH_SETTINGS_STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    window.localStorage.removeItem(GRAPH_SETTINGS_STORAGE_KEY);
    return {};
  }
}

function saveAllSettings(all: Record<string, GraphSettings>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GRAPH_SETTINGS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Graph settings are best-effort UI preferences.
  }
}

export function loadGraphSettingsForVault(vaultRoot: string | null | undefined): GraphSettings {
  if (vaultRoot === null || vaultRoot === undefined || vaultRoot === '') return cloneDefaults();
  const all = loadAllSettings();
  return validateGraphSettings(all[vaultRoot]);
}

export function saveGraphSettingsForVault(
  vaultRoot: string | null | undefined,
  settings: GraphSettings,
): void {
  if (vaultRoot === null || vaultRoot === undefined || vaultRoot === '') return;
  const all = loadAllSettings();
  saveAllSettings({
    ...Object.fromEntries(
      Object.entries(all).map(([root, value]) => [root, validateGraphSettings(value)]),
    ),
    [vaultRoot]: validateGraphSettings(settings),
  });
}
