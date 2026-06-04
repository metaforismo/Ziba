import {
  Database,
  FileText,
  Gear,
  Graph,
  MagnifyingGlass,
  PaintBrush,
  SlidersHorizontal,
} from '@phosphor-icons/react';
import { useSearchStore } from '../stores/search';
import { THEME_IDS } from '../lib/theme';
import { useUiStore } from '../stores/ui';

function nextThemeId(current: (typeof THEME_IDS)[number]): (typeof THEME_IDS)[number] {
  const idx = THEME_IDS.indexOf(current);
  return THEME_IDS[(idx + 1) % THEME_IDS.length] ?? THEME_IDS[0];
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
        title="Organizza è disponibile dalla sezione Strumenti nella sidebar"
        icon={<SlidersHorizontal size={20} aria-hidden="true" />}
      />

      <div className="mt-auto flex flex-col items-center gap-1">
        <RibbonButton
          label="Tema"
          title={`Tema: ${themeId}`}
          onClick={(): void => setThemeId(nextThemeId(themeId))}
          icon={<PaintBrush size={20} aria-hidden="true" />}
        />
        <RibbonButton
          label="Impostazioni"
          disabled
          title="Impostazioni in arrivo nel pannello dedicato"
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
  title,
  onClick,
}: {
  label: string;
  icon: JSX.Element;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      title={title ?? label}
      onClick={onClick}
      className={
        'mb-1 inline-flex size-9 items-center justify-center rounded-lg transition ' +
        (active
          ? 'bg-bg-muted text-fg shadow-sm'
          : disabled
            ? 'cursor-not-allowed text-fg-muted/45'
            : 'text-fg-muted hover:bg-bg-muted hover:text-fg')
      }
    >
      {icon}
    </button>
  );
}
