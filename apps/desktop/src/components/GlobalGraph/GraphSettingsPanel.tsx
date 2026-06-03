import { ArrowCounterClockwise, CaretDown, CaretRight, Plus, X } from '@phosphor-icons/react';
import { useState, type JSX, type ReactNode } from 'react';
import type {
  GraphDisplaySettings,
  GraphForceSettings,
  GraphGroupRule,
  GraphQueryFilters,
  GraphSettings,
} from '../../lib/graph-settings';

type Props = {
  open: boolean;
  settings: GraphSettings;
  onClose(): void;
  onReset(): void;
  onApplyPreset(preset: GraphPreset): void;
  onQueryChange(patch: Partial<GraphQueryFilters>): void;
  onDisplayChange(patch: Partial<GraphDisplaySettings>): void;
  onForcesChange(patch: Partial<GraphForceSettings>): void;
  onAddGroup(group: Omit<GraphGroupRule, 'id' | 'enabled'>): void;
  onUpdateGroup(id: string, patch: Partial<Omit<GraphGroupRule, 'id'>>): void;
  onRemoveGroup(id: string): void;
};

export type GraphPreset = {
  id: 'overview' | 'siyuan' | 'focus';
  label: string;
  description: string;
  query: Partial<GraphQueryFilters>;
  display: Partial<GraphDisplaySettings>;
  forces: Partial<GraphForceSettings>;
};

const GROUP_COLORS = ['#64748b', '#5a6c50', '#0f766e', '#b45309', '#be123c', '#475569'];
const OPEN_SECTIONS = ['Filtri', 'Gruppi', 'Aspetto', 'Forze'] as const;

const GRAPH_PRESETS: readonly GraphPreset[] = [
  {
    id: 'overview',
    label: 'Panoramica',
    description: 'Tutto il vault, linee leggere, nessuna soglia.',
    query: { includeOrphans: true, focusMode: false, minDegree: 0 },
    display: {
      showArrows: false,
      showGrid: false,
      labelFade: 0.48,
      nodeScale: 1,
      linkWidth: 0.7,
    },
    forces: {
      center: 0.08,
      repel: 420,
      link: 0.08,
      linkDistance: 96,
      nodeDistance: 32,
      linkOpacity: 0.18,
    },
  },
  {
    id: 'siyuan',
    label: 'SiYuan',
    description: 'Mappa orientata ai blocchi collegati, con frecce e soglia.',
    query: { includeOrphans: false, focusMode: false, minDegree: 1 },
    display: {
      showArrows: true,
      showGrid: false,
      labelFade: 0.32,
      nodeScale: 1.2,
      linkWidth: 1.1,
    },
    forces: {
      center: 0.04,
      repel: 620,
      link: 0.12,
      linkDistance: 132,
      nodeDistance: 48,
      linkOpacity: 0.34,
    },
  },
  {
    id: 'focus',
    label: 'Focus',
    description: 'Riduce il rumore e rende più leggibile il vicinato selezionato.',
    query: { includeOrphans: false, focusMode: true, minDegree: 0 },
    display: {
      showArrows: true,
      showGrid: true,
      labelFade: 0.18,
      nodeScale: 1.35,
      linkWidth: 1.2,
    },
    forces: {
      center: 0.12,
      repel: 760,
      link: 0.18,
      linkDistance: 118,
      nodeDistance: 64,
      linkOpacity: 0.46,
    },
  },
];

export function GraphSettingsPanel({
  open,
  settings,
  onClose,
  onReset,
  onApplyPreset,
  onQueryChange,
  onDisplayChange,
  onForcesChange,
  onAddGroup,
  onUpdateGroup,
  onRemoveGroup,
}: Props): JSX.Element | null {
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(
    () => new Set(OPEN_SECTIONS),
  );
  const nextGroupColor = GROUP_COLORS[settings.groups.length % GROUP_COLORS.length] ?? '#64748b';

  if (!open) return null;

  const toggleSection = (section: string): void => {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  return (
    <aside className="absolute bottom-3 right-3 top-3 z-20 flex w-[22rem] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-lg border border-[#3a3a3f] bg-[#242426]/95 text-[12px] text-[#e4e4e7] shadow-2xl shadow-black/35 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-[#36363a] px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-[14px] font-semibold text-[#f2f2f3]">Controlli grafo</h2>
          <p className="mt-0.5 truncate text-[11px] text-[#9d9da4]">Filtri, gruppi e fisica.</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onReset}
            className={iconButtonClass}
            title="Ripristina impostazioni grafo"
            aria-label="Ripristina impostazioni grafo"
          >
            <ArrowCounterClockwise size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className={iconButtonClass}
            title="Chiudi controlli grafo"
            aria-label="Chiudi controlli grafo"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="border-b border-[#36363a] px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold text-[#a7a7ad]">Preset</span>
          <span className="font-mono text-[10px] tabular-nums text-[#77777f]">
            grado &gt;= {settings.query.minDegree}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {GRAPH_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={(): void => onApplyPreset(preset)}
              title={preset.description}
              aria-label={`Applica preset ${preset.label}`}
              className="min-w-0 rounded-md border border-[#38383d] bg-[#1f1f22] px-2 py-1.5 text-[11px] font-medium text-[#d7d7da] transition hover:border-[#52525a] hover:bg-[#2a2a2e] hover:text-[#f2f2f3] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/25"
            >
              <span className="block truncate">{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <AccordionSection
          title="Filtri"
          open={openSections.has('Filtri')}
          onToggle={(): void => toggleSection('Filtri')}
        >
          <label className={fieldClass}>
            <span>Cerca</span>
            <input
              aria-label="Cerca nel grafo"
              type="text"
              value={settings.query.search}
              onChange={(e): void => onQueryChange({ search: e.target.value })}
              className={inputClass}
              placeholder='path:"Projects" OR type:person'
              spellCheck={false}
            />
          </label>
          <Check
            label="Orfani"
            checked={settings.query.includeOrphans}
            onChange={(includeOrphans): void => onQueryChange({ includeOrphans })}
          />
          <Check
            label="Focus"
            checked={settings.query.focusMode}
            onChange={(focusMode): void => onQueryChange({ focusMode })}
          />
          <Slider
            label="Connessioni minime"
            value={settings.query.minDegree}
            min={0}
            max={16}
            step={1}
            onChange={(minDegree): void => onQueryChange({ minDegree })}
          />
        </AccordionSection>

        <AccordionSection
          title="Gruppi"
          open={openSections.has('Gruppi')}
          onToggle={(): void => toggleSection('Gruppi')}
          action={
            <button
              type="button"
              onClick={(e): void => {
                e.stopPropagation();
                onAddGroup({ name: 'Nuovo gruppo', query: '', color: nextGroupColor });
              }}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-[#45454a] px-2 text-[11px] text-[#d7d7da] transition hover:border-[#595960] hover:bg-[#303034]"
            >
              <Plus size={12} aria-hidden="true" />
              Nuovo
            </button>
          }
        >
          {settings.groups.length === 0 && (
            <p className="text-[11px] leading-4 text-[#9d9da4]">Nessuna regola colore.</p>
          )}
          {settings.groups.map((group) => (
            <div key={group.id} className="rounded-md border border-[#38383d] bg-[#1f1f22] p-2">
              <div className="flex items-center gap-2">
                <input
                  aria-label={`Abilita ${group.name}`}
                  type="checkbox"
                  checked={group.enabled}
                  onChange={(e): void => onUpdateGroup(group.id, { enabled: e.target.checked })}
                  className={checkboxClass}
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
                  className="h-7 w-8 shrink-0 rounded border border-[#45454a] bg-[#1b1b1d]"
                />
                <button
                  type="button"
                  aria-label={`Rimuovi ${group.name}`}
                  onClick={(): void => onRemoveGroup(group.id)}
                  className={iconButtonClass}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
              <input
                aria-label={`${group.name} query`}
                value={group.query}
                onChange={(e): void => onUpdateGroup(group.id, { query: e.target.value })}
                className={`${inputClass} mt-2 w-full`}
                placeholder='path:"3. Resources" OR type:book'
                spellCheck={false}
              />
            </div>
          ))}
        </AccordionSection>

        <AccordionSection
          title="Aspetto"
          open={openSections.has('Aspetto')}
          onToggle={(): void => toggleSection('Aspetto')}
        >
          <div className="grid grid-cols-2 gap-2">
            <Check
              label="Frecce"
              checked={settings.display.showArrows}
              onChange={(showArrows): void => onDisplayChange({ showArrows })}
            />
            <Check
              label="Etichette"
              checked={settings.display.showText}
              onChange={(showText): void => onDisplayChange({ showText })}
            />
            <Check
              label="Nodi"
              checked={settings.display.showNodes}
              onChange={(showNodes): void => onDisplayChange({ showNodes })}
            />
            <Check
              label="Collegamenti"
              checked={settings.display.showLinks}
              onChange={(showLinks): void => onDisplayChange({ showLinks })}
            />
            <Check
              label="Griglia"
              checked={settings.display.showGrid}
              onChange={(showGrid): void => onDisplayChange({ showGrid })}
            />
          </div>
          <Slider
            label="Soglia testo"
            value={settings.display.labelFade}
            min={0}
            max={1}
            step={0.01}
            onChange={(labelFade): void => onDisplayChange({ labelFade })}
          />
          <Slider
            label="Dimensione nodo"
            value={settings.display.nodeScale}
            min={0.2}
            max={3}
            step={0.05}
            onChange={(nodeScale): void => onDisplayChange({ nodeScale })}
          />
          <Slider
            label="Spessore linea"
            value={settings.display.linkWidth}
            min={0.1}
            max={4}
            step={0.05}
            onChange={(linkWidth): void => onDisplayChange({ linkWidth })}
          />
        </AccordionSection>

        <AccordionSection
          title="Forze"
          open={openSections.has('Forze')}
          onToggle={(): void => toggleSection('Forze')}
        >
          <Slider
            label="Forza di centratura"
            value={settings.forces.center}
            min={0}
            max={1}
            step={0.01}
            onChange={(center): void => onForcesChange({ center })}
          />
          <Slider
            label="Forza di repulsione"
            value={settings.forces.repel}
            min={0}
            max={1200}
            step={10}
            onChange={(repel): void => onForcesChange({ repel })}
          />
          <Slider
            label="Forza collegamenti"
            value={settings.forces.link}
            min={0}
            max={1}
            step={0.01}
            onChange={(link): void => onForcesChange({ link })}
          />
          <Slider
            label="Distanza collegamenti"
            value={settings.forces.linkDistance}
            min={10}
            max={320}
            step={1}
            onChange={(linkDistance): void => onForcesChange({ linkDistance })}
          />
          <Slider
            label="Distanza nodi"
            value={settings.forces.nodeDistance}
            min={0}
            max={180}
            step={1}
            onChange={(nodeDistance): void => onForcesChange({ nodeDistance })}
          />
          <Slider
            label="Opacita collegamenti"
            value={settings.forces.linkOpacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(linkOpacity): void => onForcesChange({ linkOpacity })}
          />
        </AccordionSection>
      </div>
    </aside>
  );
}

function AccordionSection({
  title,
  open,
  action,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  action?: ReactNode;
  onToggle(): void;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="border-b border-[#36363a]">
      <div className="flex h-10 items-center gap-2 px-3 transition hover:bg-[#2a2a2e]">
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex min-w-0 flex-1 items-center gap-2 text-left text-[13px] font-semibold text-[#e7e7ea] outline-none focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/25"
          aria-expanded={open}
        >
          {open ? (
            <CaretDown size={14} aria-hidden="true" className="shrink-0 text-[#a7a7ad]" />
          ) : (
            <CaretRight size={14} aria-hidden="true" className="shrink-0 text-[#a7a7ad]" />
          )}
          <span className="truncate">{title}</span>
        </button>
        {action}
      </div>
      {open && <div className="space-y-3 px-3 pb-3">{children}</div>}
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
    <label className="flex h-8 items-center gap-2 rounded-md border border-[#38383d] bg-[#1f1f22] px-2 text-[12px] text-[#d7d7da] transition hover:border-[#47474d] hover:bg-[#252529]">
      <input
        aria-label={label}
        type="checkbox"
        checked={checked}
        onChange={(e): void => onChange(e.target.checked)}
        className={checkboxClass}
      />
      <span className="min-w-0 truncate">{label}</span>
    </label>
  );
}

function Slider({
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
    <label className="block space-y-1.5 text-[12px] text-[#d7d7da]">
      <span className="flex items-center justify-between gap-3">
        <span className="truncate">{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-[#a7a7ad]">
          {formatNumber(value)}
        </span>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e): void => onChange(Number(e.target.value))}
        className="ziba-graph-slider h-5 w-full accent-[#d7d7da]"
      />
    </label>
  );
}

function formatNumber(value: number): string {
  if (Math.abs(value) >= 10) return Math.round(value).toString();
  return value.toLocaleString('it-IT', { maximumFractionDigits: 2 });
}

const fieldClass = 'grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-[#a7a7ad]';
const inputClass =
  'h-8 rounded-md border border-[#3d3d42] bg-[#19191b] px-2 text-[12px] text-[#eeeeef] outline-none transition placeholder:text-[#77777f] hover:border-[#4b4b52] focus:border-[#77777f] focus:ring-2 focus:ring-white/10';
const iconButtonClass =
  'grid size-7 place-items-center rounded-md text-[#a7a7ad] transition hover:bg-[#303034] hover:text-[#f2f2f3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/25';
const checkboxClass = 'size-3.5 rounded border-[#57575e] bg-[#171719] accent-[#d7d7da]';
