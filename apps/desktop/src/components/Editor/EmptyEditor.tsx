import { useMemo } from 'react';
import {
  ArrowRight,
  ClockCounterClockwise,
  MagnifyingGlass,
  NotePencil,
  Sparkle,
  Stack,
} from '@phosphor-icons/react';
import type { NoteSummary } from '@ziba/core';

/**
 * Number of recent notes surfaced on the empty editor. Kept small so the
 * list reads as "jump back in" rather than a second file tree — the
 * sidebar already owns full navigation.
 */
const RECENT_NOTES_LIMIT = 5;

/**
 * Platform-aware modifier label. We can't read the live OS here without
 * pulling another dependency, so we sniff the userAgent once: macOS shows
 * the Command symbol, everything else shows "Ctrl" to match the actual
 * Cmd/Ctrl handlers wired in App.tsx.
 */
function modifierKeyLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl';
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';
}

function noteTitle(note: NoteSummary): string {
  const title = note.title.trim();
  if (title.length > 0) return title;
  const last = note.path.split('/').pop() ?? note.path;
  return last.replace(/\.md$/i, '');
}

type EmptyEditorProps = {
  /** Every note in the open vault — drives recent list + empty-vault state. */
  notes: NoteSummary[];
  /** True while the starter-vault scaffold is being written to disk. */
  starterCreating: boolean;
  onCreateBlankNote: () => void;
  onCreateStarter: () => void;
  onOpenSearch: () => void;
  onOpenNote: (path: NoteSummary['path']) => void;
};

/**
 * Branded "no note open" state for the editor pane. Replaces the previous
 * fake placeholder page with real, wired quick actions and (when the vault
 * has notes) a recent-notes shortcut list.
 */
export function EmptyEditor({
  notes,
  starterCreating,
  onCreateBlankNote,
  onCreateStarter,
  onOpenSearch,
  onOpenNote,
}: EmptyEditorProps): JSX.Element {
  const isEmptyVault = notes.length === 0;
  const mod = useMemo(modifierKeyLabel, []);

  // Most-recently-modified notes stand in for "recently opened" — the
  // vault store doesn't track an open-history, but mtime is a reliable,
  // non-fabricated proxy for "what you were last working on".
  const recentNotes = useMemo(
    () => [...notes].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, RECENT_NOTES_LIMIT),
    [notes],
  );

  return (
    <section
      aria-labelledby="empty-editor-heading"
      className="ziba-empty-editor flex h-full w-full min-w-0 items-center justify-center overflow-auto bg-bg px-6 py-10 text-fg"
    >
      <div className="ziba-empty-editor-stagger flex w-full max-w-[460px] flex-col items-center text-center motion-reduce:[&_*]:animate-none">
        <span
          aria-hidden="true"
          className="flex size-16 items-center justify-center rounded-2xl border border-border bg-bg-subtle text-accent shadow-sm"
        >
          <Sparkle size={30} weight="duotone" />
        </span>

        <h1
          id="empty-editor-heading"
          className="mt-6 text-3xl font-semibold tracking-tight text-fg"
        >
          ziba
        </h1>
        <p className="mt-3 max-w-[34ch] text-sm leading-6 text-fg-subtle">
          {isEmptyVault
            ? 'Il tuo vault è vuoto. Crea la struttura iniziale o la tua prima nota per iniziare a costruire il tuo secondo cervello.'
            : 'Nessuna nota aperta. Riprendi da dove eri rimasto o crea qualcosa di nuovo.'}
        </p>

        <div className="mt-7 flex w-full flex-col gap-2.5">
          {isEmptyVault && (
            <button
              type="button"
              onClick={onCreateStarter}
              disabled={starterCreating}
              className="group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-fg shadow-sm transition hover:-translate-y-0.5 hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <Stack size={18} aria-hidden="true" weight="bold" />
              {starterCreating ? 'Creo la base...' : 'Crea struttura iniziale'}
            </button>
          )}

          <button
            type="button"
            onClick={onCreateBlankNote}
            className={
              'group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ' +
              (isEmptyVault
                ? 'border border-border bg-bg-subtle text-fg hover:bg-bg-muted'
                : 'bg-accent text-accent-fg hover:opacity-95')
            }
          >
            <NotePencil size={18} aria-hidden="true" weight="bold" />
            Crea nota
          </button>

          <button
            type="button"
            onClick={onOpenSearch}
            className="group inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-bg-subtle px-4 text-sm font-medium text-fg-subtle shadow-sm transition hover:-translate-y-0.5 hover:bg-bg-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <span className="inline-flex items-center gap-2">
              <MagnifyingGlass size={18} aria-hidden="true" weight="bold" />
              Cerca
            </span>
            <kbd className="inline-flex items-center gap-1 rounded border border-border bg-bg px-1.5 py-0.5 font-sans text-xs font-medium tabular-nums text-fg-muted">
              {mod}K
            </kbd>
          </button>
        </div>

        {!isEmptyVault && recentNotes.length > 0 && (
          <div className="mt-9 w-full text-left">
            <div className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              <ClockCounterClockwise size={14} aria-hidden="true" />
              Note recenti
            </div>
            <ul className="flex flex-col gap-1">
              {recentNotes.map((note) => (
                <li key={note.path} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      onOpenNote(note.path);
                    }}
                    className="group flex min-h-10 w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-fg-subtle transition hover:bg-bg-subtle hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <NotePencil
                      size={16}
                      aria-hidden="true"
                      className="shrink-0 text-fg-muted group-hover:text-accent"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{noteTitle(note)}</span>
                    <ArrowRight
                      size={14}
                      aria-hidden="true"
                      className="shrink-0 text-transparent transition group-hover:translate-x-0.5 group-hover:text-fg-muted motion-reduce:transition-none"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-9 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-bg-subtle px-1.5 py-0.5 font-sans tabular-nums">
              {mod}K
            </kbd>
            cerca
          </span>
          <span className="inline-flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-bg-subtle px-1.5 py-0.5 font-sans tabular-nums">
              {mod}N
            </kbd>
            nuova nota
          </span>
        </div>
      </div>
    </section>
  );
}
