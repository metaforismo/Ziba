import { ArrowsClockwise, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';
import { useSemanticStore } from '../../stores/semantic';

/**
 * Minimal, token-based settings surface. Milestone 1 ships a single
 * section — AI semantic search (Ricerca semantica) — letting the user
 * enable the feature, point at their Ollama daemon, see status
 * (reachable? indexed/total, indexing progress) and force a reindex.
 *
 * Mounted unconditionally near the App root; renders via portal only when
 * `useSemanticStore.open`. Escape and the backdrop both close it.
 */
export function SettingsPanel(): JSX.Element | null {
  const open = useSemanticStore((s) => s.open);
  const settings = useSemanticStore((s) => s.settings);
  const status = useSemanticStore((s) => s.status);
  const loading = useSemanticStore((s) => s.loading);
  const saving = useSemanticStore((s) => s.saving);
  const error = useSemanticStore((s) => s.error);
  const closePanel = useSemanticStore((s) => s.closePanel);
  const save = useSemanticStore((s) => s.save);
  const reindex = useSemanticStore((s) => s.reindex);

  // Local draft for the text inputs so typing doesn't round-trip to disk on
  // every keystroke; committed on blur / Enter.
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (settings) {
      setBaseUrl(settings.baseUrl);
      setModel(settings.model);
    }
  }, [settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closePanel();
      }
    };
    window.addEventListener('keydown', onKey);
    // Move focus into the dialog for keyboard + screen-reader users.
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closePanel]);

  if (!open) return null;

  const enabled = settings?.enabled ?? false;
  const pct = status.total > 0 ? Math.round((status.indexed / status.total) * 100) : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={closePanel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Impostazioni"
        tabIndex={-1}
        onClick={(e): void => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-2xl outline-none"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-fg">Impostazioni</h2>
          <button
            type="button"
            onClick={closePanel}
            aria-label="Chiudi impostazioni"
            className="grid size-7 place-items-center rounded-md text-fg-muted transition hover:bg-bg-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <section aria-labelledby="semantic-heading" className="space-y-4">
            <div>
              <h3 id="semantic-heading" className="text-[13px] font-semibold text-fg">
                Ricerca semantica
              </h3>
              <p className="mt-1 text-[12px] leading-5 text-fg-muted">
                Trova le note per significato, non solo per parole chiave. Gli embedding sono
                calcolati in locale tramite Ollama: le tue note non lasciano il computer.
              </p>
            </div>

            {error !== null && (
              <p
                role="alert"
                className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-[12px] text-fg"
              >
                {error}
              </p>
            )}

            {/* Enable toggle */}
            <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg-subtle px-3 py-2.5">
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-fg">Attiva</span>
                <span className="block text-[11px] text-fg-muted">
                  Quando disattivata, nessun dato viene inviato a Ollama.
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label="Attiva ricerca semantica"
                checked={enabled}
                disabled={loading || saving}
                onChange={(e): void => void save({ enabled: e.target.checked })}
                className="size-4 shrink-0 accent-accent"
              />
            </label>

            {/* Provider config */}
            <div className="space-y-3" aria-disabled={!enabled}>
              <Field
                id="ollama-base-url"
                label="URL Ollama"
                value={baseUrl}
                placeholder="http://localhost:11434"
                disabled={saving}
                onChange={setBaseUrl}
                onCommit={(): void => {
                  if (settings && baseUrl !== settings.baseUrl) void save({ baseUrl });
                }}
              />
              <Field
                id="ollama-model"
                label="Modello"
                value={model}
                placeholder="nomic-embed-text"
                disabled={saving}
                onChange={setModel}
                onCommit={(): void => {
                  if (settings && model !== settings.model) void save({ model });
                }}
              />
            </div>

            {/* Status */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border bg-bg-subtle px-3 py-3 text-[12px]">
              <Stat label="Provider">
                <StatusDot ok={status.providerOk} />
                <span className="text-fg">
                  {status.providerOk ? 'Raggiungibile' : 'Non raggiungibile'}
                </span>
              </Stat>
              <Stat label="Indicizzate">
                <span className="font-mono tabular-nums text-fg">
                  {status.indexed} / {status.total}
                </span>
              </Stat>
              <Stat label="Modello">
                <span className="truncate font-mono text-[11px] text-fg-muted">
                  {status.modelId || '—'}
                </span>
              </Stat>
              <Stat label="Stato">
                <span className="text-fg">
                  {status.running ? `In corso (${pct}%)` : 'Inattivo'}
                </span>
              </Stat>
            </dl>

            {status.running && (
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-label="Avanzamento indicizzazione"
              >
                <div
                  className="h-full bg-accent transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}

            <button
              type="button"
              onClick={(): void => void reindex()}
              disabled={!enabled || status.running}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-bg-subtle px-3 py-1.5 text-[12px] font-medium text-fg transition hover:bg-bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <ArrowsClockwise size={14} aria-hidden="true" />
              Reindicizza
            </button>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Field({
  id,
  label,
  value,
  placeholder,
  disabled,
  onChange,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange(v: string): void;
  onCommit(): void;
}): JSX.Element {
  return (
    <label htmlFor={id} className="block space-y-1">
      <span className="block text-[12px] font-medium text-fg-muted">{label}</span>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        onChange={(e): void => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e): void => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit();
          }
        }}
        className="h-8 w-full rounded-md border border-border bg-bg px-2.5 text-[12px] text-fg outline-none transition placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-50"
      />
    </label>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] text-fg-subtle">{label}</dt>
      <dd className="flex items-center gap-1.5">{children}</dd>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`size-2 shrink-0 rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`}
    />
  );
}
