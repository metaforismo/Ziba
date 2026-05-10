import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { extractType, type NotePath } from '@ziba/core';
import type { ObjectTypeRow, RelationRow } from '../../../shared/ipc';
import { ipc } from '../../lib/ipc';
import { ipcErrorMessage } from '../../lib/ipc-error';
import { useEditorStore } from '../../stores/editor';
import { useTagsStore } from '../../stores/tags';
import { navigateToNote } from '../../lib/navigate';

/**
 * Right-pane content for **typed** notes (notes with `type:` in
 * frontmatter). Replaces `<BacklinksList>` for those notes; untyped
 * notes still see the legacy backlinks list (see `<BacklinksPanel>`
 * for the swap).
 *
 * Sections:
 *   - **TYPE** badge (icon + colored pill, falls back to id when no
 *     schema is loaded for this type).
 *   - **PROPERTIES** — frontmatter fields declared in the schema's
 *     `properties` map, rendered in declaration order. Properties not
 *     in the schema are listed below in a less prominent group so
 *     drift is visible without being noisy.
 *   - **RELATIONS** — outgoing typed relations grouped by `kind`,
 *     each entry click-navigates to the target.
 *   - **INVERSE** — relations declared via the schema's `inverse:`
 *     map (auto-derived from notes that point at this one with the
 *     matching `reverse_of`). Plus a fallback "Citato da" group
 *     showing every reverse relation whose kind isn't covered by an
 *     explicit inverse spec.
 */
export function ObjectPanel(): JSX.Element {
  const currentNote = useEditorStore((s) => s.currentNote);
  const types = useTagsStore((s) => s.types);
  const objectTypeSchemas = useTagsStore((s) => s.objectTypeSchemas);

  // Note can be null briefly during load. Render the empty state
  // rather than a flash of "no type" — the parent decides which
  // panel to mount.
  if (currentNote === null) return <EmptyState />;

  const typeId = extractType(currentNote.frontmatter);
  if (typeId === null) return <EmptyState />;

  return (
    <ObjectPanelInner
      typeId={typeId}
      sourcePath={currentNote.path}
      // mtimeMs as a dep on the inner effect so saving the note
      // (which re-extracts relations on the indexer side) triggers a
      // refetch — without it the panel would show stale relations
      // until the user reopens the note.
      mtimeMs={currentNote.mtimeMs}
      frontmatter={currentNote.frontmatter}
      typeMeta={types.find((t) => t.id === typeId) ?? null}
      cachedSchema={objectTypeSchemas.find((s) => s.id === typeId) ?? null}
    />
  );
}

function ObjectPanelInner({
  typeId,
  sourcePath,
  mtimeMs,
  frontmatter,
  typeMeta,
  cachedSchema,
}: {
  typeId: string;
  sourcePath: NotePath;
  mtimeMs: number;
  frontmatter: Record<string, unknown>;
  typeMeta: { id: string; label: string; icon: string | null; color: string | null } | null;
  cachedSchema: ObjectTypeRow | null;
}): JSX.Element {
  const [outgoing, setOutgoing] = useState<RelationRow[]>([]);
  const [inverse, setInverse] = useState<RelationRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Refetch relations whenever the source path, the type id, or the
  // note's mtime changes. mtime as a dep is what makes the panel
  // reactive to saves: the indexer rewrites `relations` on each
  // upsert, and a watcher event re-loads `currentNote` with a fresh
  // `mtimeMs` — this useEffect catches that and pulls the new state.
  // Schemas are taken from the renderer-side cache (`cachedSchema`),
  // so we no longer round-trip IPC for them on every note swap.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async (): Promise<void> => {
      try {
        const [out, inv] = await Promise.all([
          ipc.getRelationsBySource({ sourcePath }),
          ipc.getRelationsByTarget({ targetPath: sourcePath }),
        ]);
        if (cancelled) return;
        // Filter `kind = ''` out of outgoing — those are body
        // wikilinks, which the legacy backlinks UI handled. Object
        // panel surfaces only the typed relations the user
        // explicitly declared.
        setOutgoing(out.filter((r) => r.kind !== ''));
        setInverse(inv);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(ipcErrorMessage(err));
      }
    })();
    return (): void => {
      cancelled = true;
    };
  }, [sourcePath, typeId, mtimeMs]);

  const schema = cachedSchema;

  const groupedOutgoing = useMemo(() => groupBy(outgoing, (r) => r.kind), [outgoing]);
  const groupedInverse = useMemo(() => groupBy(inverse, (r) => r.kind), [inverse]);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3 text-sm">
      <TypeHeader typeId={typeId} typeMeta={typeMeta} />

      {error !== null && (
        <p role="alert" className="mt-3 rounded border border-red-500 bg-bg p-2 text-xs">
          {error}
        </p>
      )}

      <Section label="Proprietà">
        <PropertiesList schema={schema} frontmatter={frontmatter} />
      </Section>

      <Section label="Relazioni">
        {Object.keys(groupedOutgoing).length === 0 ? (
          <EmptyHint>Nessuna relazione dichiarata.</EmptyHint>
        ) : (
          <div className="space-y-2">
            {Object.entries(groupedOutgoing).map(([kind, rows]) => (
              <RelationGroup
                key={kind}
                label={schema?.schema.relations[kind]?.label ?? kind}
                rows={rows}
                direction="outgoing"
              />
            ))}
          </div>
        )}
      </Section>

      <Section label="Inverse">
        {Object.keys(groupedInverse).length === 0 ? (
          <EmptyHint>Nessuna nota punta a questa.</EmptyHint>
        ) : (
          <div className="space-y-2">
            {Object.entries(groupedInverse).map(([kind, rows]) => {
              // Find an inverse spec that maps `reverse_of: kind` to a
              // pretty label. Falls back to a kind-named group.
              const inverseLabel = findInverseLabel(schema, kind);
              return (
                <RelationGroup
                  key={kind || '__untyped__'}
                  label={inverseLabel}
                  rows={rows}
                  direction="incoming"
                />
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

function TypeHeader({
  typeId,
  typeMeta,
}: {
  typeId: string;
  typeMeta: { label: string; icon: string | null; color: string | null } | null;
}): JSX.Element {
  const label = typeMeta?.label ?? typeId;
  const icon = typeMeta?.icon ?? '◆';
  const stripeStyle =
    typeMeta?.color !== null && typeMeta !== null ? { borderColor: typeMeta.color } : undefined;
  return (
    <div
      className="flex items-center gap-2 rounded border-l-[3px] bg-bg-muted/40 px-3 py-2"
      style={stripeStyle}
      data-type-id={typeId}
    >
      <span aria-hidden="true" className="text-base">
        {icon}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Tipo</span>
      <span className="truncate text-sm font-medium text-fg">{label}</span>
    </div>
  );
}

function PropertiesList({
  schema,
  frontmatter,
}: {
  schema: ObjectTypeRow | null;
  frontmatter: Record<string, unknown>;
}): JSX.Element {
  // We surface schema properties first (in declaration order) so the
  // same fields always show in the same place per type, then any
  // additional frontmatter fields the user added ad-hoc.
  const schemaKeys = schema !== null ? Object.keys(schema.schema.properties) : [];
  const presentSchemaKeys = schemaKeys.filter((k) => k in frontmatter);
  const otherKeys = Object.keys(frontmatter).filter(
    (k) => k !== 'type' && k !== 'relations' && !schemaKeys.includes(k),
  );

  if (presentSchemaKeys.length === 0 && otherKeys.length === 0) {
    return <EmptyHint>Nessuna proprietà nel frontmatter.</EmptyHint>;
  }

  return (
    <div className="space-y-1">
      {presentSchemaKeys.map((k) => (
        <PropertyRow
          key={k}
          label={schema?.schema.properties[k]?.label ?? k}
          value={frontmatter[k]}
        />
      ))}
      {otherKeys.length > 0 && presentSchemaKeys.length > 0 && (
        <div className="my-1 border-t border-border" aria-hidden="true" />
      )}
      {otherKeys.map((k) => (
        <PropertyRow key={k} label={k} value={frontmatter[k]} muted />
      ))}
    </div>
  );
}

function PropertyRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: unknown;
  muted?: boolean;
}): JSX.Element {
  return (
    <div className="flex items-baseline gap-2 px-2 text-xs">
      <span
        className={
          'shrink-0 truncate font-mono uppercase tracking-wide ' +
          (muted ? 'text-fg-muted/70' : 'text-fg-muted')
        }
        style={{ minWidth: '80px' }}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate text-fg">{formatValue(value)}</span>
    </div>
  );
}

function RelationGroup({
  label,
  rows,
  direction,
}: {
  label: string;
  rows: RelationRow[];
  direction: 'outgoing' | 'incoming';
}): JSX.Element {
  return (
    <div>
      <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
        {label}
        <span className="ml-1 tabular-nums text-fg-muted/70">{rows.length}</span>
      </div>
      <ul role="list" className="space-y-px">
        {rows.map((r) => (
          <RelationRow
            key={`${r.sourcePath}|${r.kind}|${r.targetTitle}`}
            row={r}
            direction={direction}
          />
        ))}
      </ul>
    </div>
  );
}

function RelationRow({
  row,
  direction,
}: {
  row: RelationRow;
  direction: 'outgoing' | 'incoming';
}): JSX.Element {
  const path = direction === 'outgoing' ? row.targetPath : row.sourcePath;
  const display = direction === 'outgoing' ? row.targetTitle : row.sourcePath.replace(/\.md$/, '');
  // Broken links (target_path null) render as plain text — there's
  // nothing to navigate to.
  if (path === null) {
    return (
      <li className="px-2 py-1 text-xs text-fg-muted" title="Link rotto">
        <span aria-hidden="true">⚠️</span> {display}
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={(): void => {
          void navigateToNote(path);
        }}
        title={path}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-fg-subtle hover:bg-bg-muted hover:text-fg"
      >
        <span aria-hidden="true" className="shrink-0">
          {direction === 'outgoing' ? '→' : '←'}
        </span>
        <span className="truncate">{display}</span>
      </button>
    </li>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="mt-3">
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
        {label}
      </h3>
      {children}
    </section>
  );
}

function EmptyState(): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-4 text-center text-xs text-fg-muted">
      Apri una nota tipizzata (con <code className="font-mono">type:</code> nel frontmatter) per
      vedere il pannello oggetto.
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }): JSX.Element {
  return <p className="px-2 py-1 text-xs italic text-fg-muted">{children}</p>;
}

// ---- helpers --------------------------------------------------------------

function groupBy<T>(items: ReadonlyArray<T>, keyOf: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyOf(item);
    const bucket = out[key];
    if (bucket === undefined) {
      out[key] = [item];
    } else {
      bucket.push(item);
    }
  }
  return out;
}

/**
 * For an inverse relation kind `kind`, find the schema's `inverse`
 * spec whose `reverse_of` matches. Falls back to a sensible default
 * when no spec exists (e.g. body wikilinks, kind '').
 */
function findInverseLabel(schema: ObjectTypeRow | null, kind: string): string {
  if (kind === '') return 'Citato da (riferimenti generici)';
  if (schema === null) return kind;
  for (const [invKey, invSpec] of Object.entries(schema.schema.inverse)) {
    if (invSpec.reverse_of === kind) {
      return invSpec.label ?? invKey;
    }
  }
  return kind;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return '[oggetto]';
    }
  }
  return String(v);
}
