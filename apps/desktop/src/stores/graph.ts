import { create } from 'zustand';
import {
  DEFAULT_GRAPH_SETTINGS,
  loadGraphSettingsForVault,
  saveGraphSettingsForVault,
  validateGraphSettings,
  type GraphDisplaySettings,
  type GraphForceSettings,
  type GraphGroupRule,
  type GraphQueryFilters,
  type GraphSettings,
} from '../lib/graph-settings';

export { DEFAULT_GRAPH_SETTINGS };
export type {
  GraphDisplaySettings,
  GraphForceSettings,
  GraphGroupRule,
  GraphQueryFilters,
  GraphSettings,
};

type NewGroupRule = Omit<GraphGroupRule, 'id' | 'enabled'> & {
  enabled?: boolean;
};

type GraphSettingsState = {
  vaultRoot: string | null;
  settings: GraphSettings;
  setVaultRoot(vaultRoot: string | null): void;
  updateQuery(patch: Partial<GraphQueryFilters>): void;
  updateDisplay(patch: Partial<GraphDisplaySettings>): void;
  updateForces(patch: Partial<GraphForceSettings>): void;
  addGroup(group: NewGroupRule): string;
  updateGroup(id: string, patch: Partial<Omit<GraphGroupRule, 'id'>>): void;
  removeGroup(id: string): void;
  resetSettings(): void;
};

function cloneSettings(settings: GraphSettings): GraphSettings {
  return {
    query: {
      ...settings.query,
      tags: [...settings.query.tags],
      folders: [...settings.query.folders],
      paths: [...settings.query.paths],
      types: [...settings.query.types],
      relationKinds: [...settings.query.relationKinds],
    },
    display: { ...settings.display },
    forces: { ...settings.forces },
    groups: settings.groups.map((g) => ({ ...g })),
  };
}

function createGroupId(): string {
  return `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useGraphSettingsStore = create<GraphSettingsState>((set, get) => {
  const persist = (settings: GraphSettings): void => {
    saveGraphSettingsForVault(get().vaultRoot, settings);
  };

  const setAndPersist = (settings: GraphSettings): void => {
    const validated = validateGraphSettings(settings);
    set({ settings: validated });
    persist(validated);
  };

  return {
    vaultRoot: null,
    settings: cloneSettings(DEFAULT_GRAPH_SETTINGS),
    setVaultRoot(vaultRoot) {
      if (get().vaultRoot === vaultRoot) return;
      set({ vaultRoot, settings: loadGraphSettingsForVault(vaultRoot) });
    },
    updateQuery(patch) {
      const settings = {
        ...get().settings,
        query: { ...get().settings.query, ...patch },
      };
      setAndPersist(settings);
    },
    updateDisplay(patch) {
      const settings = {
        ...get().settings,
        display: { ...get().settings.display, ...patch },
      };
      setAndPersist(settings);
    },
    updateForces(patch) {
      const settings = {
        ...get().settings,
        forces: { ...get().settings.forces, ...patch },
      };
      setAndPersist(settings);
    },
    addGroup(group) {
      const id = createGroupId();
      const settings = {
        ...get().settings,
        groups: [
          ...get().settings.groups,
          {
            id,
            name: group.name,
            query: group.query,
            color: group.color,
            enabled: group.enabled ?? true,
          },
        ],
      };
      setAndPersist(settings);
      return id;
    },
    updateGroup(id, patch) {
      const settings = {
        ...get().settings,
        groups: get().settings.groups.map((group) =>
          group.id === id ? { ...group, ...patch } : group,
        ),
      };
      setAndPersist(settings);
    },
    removeGroup(id) {
      const settings = {
        ...get().settings,
        groups: get().settings.groups.filter((group) => group.id !== id),
      };
      setAndPersist(settings);
    },
    resetSettings() {
      setAndPersist(cloneSettings(DEFAULT_GRAPH_SETTINGS));
    },
  };
});
