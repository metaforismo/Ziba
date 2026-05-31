import type { JSX } from 'react';
import type {
  GraphDisplaySettings,
  GraphForceSettings,
  GraphGroupRule,
  GraphQueryFilters,
  GraphSettings,
} from '../../lib/graph-settings';

type Props = {
  settings: GraphSettings;
  onQueryChange(patch: Partial<GraphQueryFilters>): void;
  onDisplayChange(patch: Partial<GraphDisplaySettings>): void;
  onForcesChange(patch: Partial<GraphForceSettings>): void;
  onAddGroup(group: Omit<GraphGroupRule, 'id' | 'enabled'>): void;
  onUpdateGroup(id: string, patch: Partial<Omit<GraphGroupRule, 'id'>>): void;
  onRemoveGroup(id: string): void;
};

const GROUP_COLORS = ['#ef4444', '#14b8a6', '#6366f1', '#f59e0b', '#ec4899'];

export function GraphSettingsPanel({
  settings,
  onQueryChange,
  onDisplayChange,
  onForcesChange,
  onAddGroup,
  onUpdateGroup,
  onRemoveGroup,
}: Props): JSX.Element {
  const nextGroupColor = GROUP_COLORS[settings.groups.length % GROUP_COLORS.length] ?? '#6366f1';

  return (
    <aside className="absolute right-3 top-3 z-10 flex max-h-[calc(100%-1.5rem)] w-72 flex-col overflow-hidden rounded-md border border-border/80 bg-bg-subtle/95 text-xs text-fg shadow-lg backdrop-blur">
      <div className="border-b border-border/70 px-3 py-2">
        <h2 className="text-[13px] font-semibold text-fg">Graph settings</h2>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        <PanelSection title="Filters">
          <label className={fieldClass}>
            <span>Search</span>
            <input
              aria-label="Search"
              type="text"
              value={settings.query.search}
              onChange={(e): void => onQueryChange({ search: e.target.value })}
              className={inputClass}
              placeholder="tag:#idea path:notes"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Check
              label="Include unresolved"
              checked={settings.query.includeUnresolved}
              onChange={(checked): void => onQueryChange({ includeUnresolved: checked })}
            />
            <Check
              label="Include orphans"
              checked={settings.query.includeOrphans}
              onChange={(checked): void => onQueryChange({ includeOrphans: checked })}
            />
            <Check
              label="Existing only"
              checked={settings.query.existingOnly}
              onChange={(checked): void => onQueryChange({ existingOnly: checked })}
            />
            <Check
              label="Focus mode"
              checked={settings.query.focusMode}
              onChange={(checked): void => onQueryChange({ focusMode: checked })}
            />
          </div>
          <label className={fieldClass}>
            <span>Local depth</span>
            <input
              aria-label="Local depth"
              type="number"
              min={0}
              max={6}
              value={settings.query.localDepth}
              onChange={(e): void => onQueryChange({ localDepth: Number(e.target.value) })}
              className={inputClass}
            />
          </label>
        </PanelSection>

        <PanelSection
          title="Groups"
          action={
            <button
              type="button"
              onClick={(): void =>
                onAddGroup({ name: 'New group', query: '', color: nextGroupColor })
              }
              className="rounded border border-border/80 px-2 py-0.5 text-[11px] text-fg-subtle hover:bg-bg-muted hover:text-fg"
            >
              Add group
            </button>
          }
        >
          {settings.groups.length === 0 && (
            <p className="text-[11px] leading-4 text-fg-muted">No group rules yet.</p>
          )}
          {settings.groups.map((group) => (
            <div key={group.id} className="space-y-2 rounded border border-border/60 p-2">
              <div className="flex items-center gap-2">
                <input
                  aria-label={`Enable ${group.name}`}
                  type="checkbox"
                  checked={group.enabled}
                  onChange={(e): void => onUpdateGroup(group.id, { enabled: e.target.checked })}
                  className="h-3 w-3 accent-[rgb(var(--accent))]"
                />
                <input
                  aria-label={`${group.name} name`}
                  value={group.name}
                  onChange={(e): void => onUpdateGroup(group.id, { name: e.target.value })}
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <input
                  aria-label={`${group.name} color`}
                  type="color"
                  value={group.color}
                  onChange={(e): void => onUpdateGroup(group.id, { color: e.target.value })}
                  className="h-7 w-8 rounded border border-border bg-bg"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  aria-label={`${group.name} query`}
                  value={group.query}
                  onChange={(e): void => onUpdateGroup(group.id, { query: e.target.value })}
                  className={`${inputClass} min-w-0 flex-1`}
                  placeholder="type:person OR tag:#team"
                />
                <button
                  type="button"
                  aria-label={`Remove ${group.name}`}
                  onClick={(): void => onRemoveGroup(group.id)}
                  className="h-7 w-7 rounded border border-border/80 text-fg-muted hover:bg-bg-muted hover:text-fg"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </PanelSection>

        <PanelSection title="Display">
          <div className="grid grid-cols-2 gap-2">
            <Check
              label="Arrows"
              checked={settings.display.showArrows}
              onChange={(checked): void => onDisplayChange({ showArrows: checked })}
            />
            <Check
              label="Text labels"
              checked={settings.display.showText}
              onChange={(checked): void => onDisplayChange({ showText: checked })}
            />
            <Check
              label="Nodes"
              checked={settings.display.showNodes}
              onChange={(checked): void => onDisplayChange({ showNodes: checked })}
            />
            <Check
              label="Links"
              checked={settings.display.showLinks}
              onChange={(checked): void => onDisplayChange({ showLinks: checked })}
            />
          </div>
        </PanelSection>

        <PanelSection title="Forces">
          <NumberControl
            label="Center"
            value={settings.forces.center}
            min={0}
            max={1}
            step={0.01}
            onChange={(center): void => onForcesChange({ center })}
          />
          <NumberControl
            label="Repel"
            value={settings.forces.repel}
            min={0}
            max={1200}
            step={10}
            onChange={(repel): void => onForcesChange({ repel })}
          />
          <NumberControl
            label="Link"
            value={settings.forces.link}
            min={0}
            max={1}
            step={0.01}
            onChange={(link): void => onForcesChange({ link })}
          />
          <NumberControl
            label="Link distance"
            value={settings.forces.linkDistance}
            min={10}
            max={320}
            step={1}
            onChange={(linkDistance): void => onForcesChange({ linkDistance })}
          />
          <NumberControl
            label="Node distance"
            value={settings.forces.nodeDistance}
            min={0}
            max={180}
            step={1}
            onChange={(nodeDistance): void => onForcesChange({ nodeDistance })}
          />
          <NumberControl
            label="Link opacity"
            value={settings.forces.linkOpacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(linkOpacity): void => onForcesChange({ linkOpacity })}
          />
        </PanelSection>
      </div>
    </aside>
  );
}

function PanelSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: JSX.Element;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">{title}</h3>
        {action}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}): JSX.Element {
  return (
    <label className="flex items-center gap-1.5 rounded border border-border/60 bg-bg px-2 py-1.5 text-[11px] text-fg-subtle">
      <input
        aria-label={label}
        type="checkbox"
        checked={checked}
        onChange={(e): void => onChange(e.target.checked)}
        className="h-3 w-3 accent-[rgb(var(--accent))]"
      />
      <span>{label}</span>
    </label>
  );
}

function NumberControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(value: number): void;
}): JSX.Element {
  return (
    <label className={fieldClass}>
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e): void => onChange(Number(e.target.value))}
        className={inputClass}
      />
    </label>
  );
}

const fieldClass =
  'grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2 text-[11px] text-fg-muted';
const inputClass =
  'h-7 rounded border border-border/80 bg-bg px-2 text-xs text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/15';
