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
    <aside className="absolute right-4 top-4 z-10 flex max-h-[calc(100%-2rem)] w-80 max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-xl border border-border/80 bg-bg-subtle/95 text-xs text-fg shadow-xl shadow-black/10 backdrop-blur">
      <div className="border-b border-border/70 px-3.5 py-3">
        <h2 className="text-[13px] font-semibold text-fg">Controlli grafo</h2>
        <p className="mt-0.5 text-[11px] leading-4 text-fg-muted">
          Filtri, gruppi e fisica salvati per questo vault.
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        <PanelSection title="Filtri">
          <label className={fieldClass}>
            <span>Cerca</span>
            <input
              aria-label="Cerca nel grafo"
              type="text"
              value={settings.query.search}
              onChange={(e): void => onQueryChange({ search: e.target.value })}
              className={inputClass}
              placeholder="type:person path:projects"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Check
              label="Nodi irrisolti"
              checked={settings.query.includeUnresolved}
              onChange={(checked): void => onQueryChange({ includeUnresolved: checked })}
              disabledReason="Il motore del grafo non espone ancora i nodi non risolti."
            />
            <Check
              label="Orfani"
              checked={settings.query.includeOrphans}
              onChange={(checked): void => onQueryChange({ includeOrphans: checked })}
            />
            <Check
              label="Solo esistenti"
              checked={settings.query.existingOnly}
              onChange={(checked): void => onQueryChange({ existingOnly: checked })}
              disabledReason="Disponibile quando il grafo distinguerà file reali e riferimenti mancanti."
            />
            <Check
              label="Focus"
              checked={settings.query.focusMode}
              onChange={(checked): void => onQueryChange({ focusMode: checked })}
            />
          </div>
          <label className={fieldClass}>
            <span>Profondità</span>
            <input
              aria-label="Profondità locale"
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
          title="Gruppi colore"
          action={
            <button
              type="button"
              onClick={(): void =>
                onAddGroup({ name: 'Nuovo gruppo', query: '', color: nextGroupColor })
              }
              className="rounded-md border border-border/80 px-2 py-0.5 text-[11px] text-fg-subtle transition hover:bg-bg-muted hover:text-fg"
            >
              Nuovo gruppo
            </button>
          }
        >
          {settings.groups.length === 0 && (
            <p className="text-[11px] leading-4 text-fg-muted">Nessuna regola colore.</p>
          )}
          {settings.groups.map((group) => (
            <div
              key={group.id}
              className="space-y-2 rounded-lg border border-border/60 bg-bg/60 p-2"
            >
              <div className="flex items-center gap-2">
                <input
                  aria-label={`Abilita ${group.name}`}
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
                  placeholder="type:person OR path:team"
                />
                <button
                  type="button"
                  aria-label={`Rimuovi ${group.name}`}
                  onClick={(): void => onRemoveGroup(group.id)}
                  className="h-7 w-7 rounded-md border border-border/80 text-fg-muted transition hover:bg-bg-muted hover:text-fg"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </PanelSection>

        <PanelSection title="Aspetto">
          <div className="grid grid-cols-2 gap-2">
            <Check
              label="Frecce"
              checked={settings.display.showArrows}
              onChange={(checked): void => onDisplayChange({ showArrows: checked })}
            />
            <Check
              label="Etichette"
              checked={settings.display.showText}
              onChange={(checked): void => onDisplayChange({ showText: checked })}
            />
            <Check
              label="Nodi"
              checked={settings.display.showNodes}
              onChange={(checked): void => onDisplayChange({ showNodes: checked })}
            />
            <Check
              label="Collegamenti"
              checked={settings.display.showLinks}
              onChange={(checked): void => onDisplayChange({ showLinks: checked })}
            />
          </div>
        </PanelSection>

        <PanelSection title="Fisica">
          <NumberControl
            label="Centro"
            value={settings.forces.center}
            min={0}
            max={1}
            step={0.01}
            onChange={(center): void => onForcesChange({ center })}
          />
          <NumberControl
            label="Repulsione"
            value={settings.forces.repel}
            min={0}
            max={1200}
            step={10}
            onChange={(repel): void => onForcesChange({ repel })}
          />
          <NumberControl
            label="Tensione link"
            value={settings.forces.link}
            min={0}
            max={1}
            step={0.01}
            onChange={(link): void => onForcesChange({ link })}
          />
          <NumberControl
            label="Distanza link"
            value={settings.forces.linkDistance}
            min={10}
            max={320}
            step={1}
            onChange={(linkDistance): void => onForcesChange({ linkDistance })}
          />
          <NumberControl
            label="Distanza nodi"
            value={settings.forces.nodeDistance}
            min={0}
            max={180}
            step={1}
            onChange={(nodeDistance): void => onForcesChange({ nodeDistance })}
          />
          <NumberControl
            label="Opacità link"
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
  disabledReason,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
  disabledReason?: string;
}): JSX.Element {
  const isDisabled = disabledReason !== undefined;
  return (
    <label
      className={[
        'flex items-center gap-1.5 rounded-md border border-border/60 bg-bg px-2 py-1.5 text-[11px] transition',
        isDisabled
          ? 'cursor-not-allowed text-fg-muted/60'
          : 'text-fg-subtle hover:border-fg-muted/40 hover:text-fg',
      ].join(' ')}
      title={disabledReason}
    >
      <input
        aria-label={label}
        type="checkbox"
        checked={checked}
        disabled={isDisabled}
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
  'grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2 text-[11px] text-fg-muted';
const inputClass =
  'h-7 rounded-md border border-border/80 bg-bg px-2 text-xs text-fg outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15';
