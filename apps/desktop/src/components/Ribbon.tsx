import {
  Database,
  FileText,
  Gear,
  Graph,
  MagnifyingGlass,
  PaintBrush,
  SlidersHorizontal,
} from '@phosphor-icons/react';
import type { JSX } from 'react';
import { useSearchStore } from '../stores/search';
import { THEMES, THEME_IDS, type ThemeId } from '../lib/theme';
import { useUiStore } from '../stores/ui';
import { Tooltip } from './ui/Tooltip';

function nextThemeId(current: ThemeId): ThemeId {
  const idx = THEME_IDS.indexOf(current);
  return THEME_IDS[(idx + 1) % THEME_IDS.length] ?? THEME_IDS[0];
}

function themeLabel(id: ThemeId): string {
  return THEMES.find((t) => t.id === id)?.label ?? id;
}

export function Ribbon(): JSX.Element {
  const openPalette = useSearchStore((s) => s.openPalette);
  const mainView = useUiStore((s) => s.mainView);
  const setMainView = useUiStore((s) => s.setMainView);
  const themeId = useUiStore((s) => s.themeId);
  const setThemeId = useUiStore((s) => s.setThemeId);

  return (
    <nav
      aria-label="Navigazione principale"
      className="flex h-full min-h-0 w-12 shrink-0 flex-col items-center overflow-hidden border-r border-border bg-bg-subtle/95 py-2"
    >
      <RibbonButton
        label="File"
        active={mainView === 'editor'}
        onClick={(): void => setMainView('editor')}
        icon={<FileText size={19} aria-hidden="true" />}
      />
      <RibbonButton
        label="Cerca"
        onClick={openPalette}
        icon={<MagnifyingGlass size={20} aria-hidden="true" />}
      />
      <RibbonButton
        label="Grafo"
        active={mainView === 'graph'}
        onClick={(): void => setMainView('graph')}
        icon={<Graph size={20} aria-hidden="true" />}
      />
      <RibbonButton
        label="Database"
        active={mainView === 'database'}
        onClick={(): void => setMainView('database')}
        icon={<Database size={20} aria-hidden="true" />}
      />
      <RibbonButton
        label="Organizza"
        disabled
        tooltip="Organizza è disponibile dalla sezione Strumenti nella sidebar"
        icon={<SlidersHorizontal size={20} aria-hidden="true" />}
      />

      <div className="mt-auto flex flex-col items-center gap-1">
        <RibbonButton
          label="Cambia tema"
          tooltip={`Tema: ${themeLabel(themeId)}`}
          onClick={(): void => setThemeId(nextThemeId(themeId))}
          icon={<PaintBrush size={20} aria-hidden="true" />}
        />
        <RibbonButton
          label="Impostazioni"
          disabled
          tooltip="Impostazioni in arrivo nel pannello dedicato"
          icon={<Gear size={20} aria-hidden="true" />}
        />
      </div>
    </nav>
  );
}

function RibbonButton({
  label,
  icon,
  active = false,
  disabled = false,
  tooltip,
  onClick,
}: {
  label: string;
  icon: JSX.Element;
  active?: boolean;
  disabled?: boolean;
  /** Optional richer hint shown in the tooltip; defaults to `label`. */
  tooltip?: string;
  onClick?: () => void;
}): JSX.Element {
  const hint = tooltip ?? label;
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Native title only when disabled: disabled buttons don't emit the
      // hover/focus events our <Tooltip> relies on, so we fall back to the
      // browser tooltip to keep the "why is this disabled" hint reachable.
      title={disabled ? hint : undefined}
      onClick={onClick}
      className={
        'mb-1 inline-flex size-9 items-center justify-center rounded-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ' +
        (active
          ? 'bg-bg-muted text-fg shadow-sm'
          : disabled
            ? 'cursor-not-allowed text-fg-muted/45'
            : 'text-fg-muted hover:bg-bg-muted hover:text-fg active:translate-y-px')
      }
    >
      {icon}
    </button>
  );

  if (disabled) return button;
  return (
    <Tooltip label={hint} placement="right">
      {button}
    </Tooltip>
  );
}
