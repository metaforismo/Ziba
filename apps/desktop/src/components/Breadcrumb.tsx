import { CaretRight, House } from '@phosphor-icons/react';
import type { JSX } from 'react';

export type BreadcrumbSegment = {
  /** Display text for this segment. */
  label: string;
  /** Stable key (full path up to this segment) for React + tooltips. */
  key: string;
};

export type BreadcrumbProps = {
  /** Vault name — the root segment, rendered with a house glyph. */
  vaultName: string;
  /**
   * Folder + note segments derived from the active note path. The last
   * entry is the note itself (rendered emphasised); the rest are folders.
   * Empty when no note is open.
   */
  segments: BreadcrumbSegment[];
};

/**
 * Split a note path into breadcrumb segments. The final segment (the note
 * basename, minus the `.md` extension) is returned alongside its folder
 * ancestors so the caller can emphasise it. Returns an empty list for an
 * empty/whitespace path.
 *
 * Exported for unit testing the path → segments mapping in isolation.
 */
export function notePathToSegments(path: string): BreadcrumbSegment[] {
  const trimmed = path.trim();
  if (trimmed === '') return [];
  const parts = trimmed.split('/').filter((p) => p !== '');
  const out: BreadcrumbSegment[] = [];
  let acc = '';
  for (let i = 0; i < parts.length; i += 1) {
    const raw = parts[i] ?? '';
    acc = acc === '' ? raw : `${acc}/${raw}`;
    const isLast = i === parts.length - 1;
    out.push({
      // Strip the markdown extension only from the note (last) segment.
      label: isLast ? raw.replace(/\.md$/i, '') : raw,
      key: acc,
    });
  }
  return out;
}

/**
 * Persistent location breadcrumb: `vault / folder / … / note`. Lives in the
 * app chrome (always visible, unlike the editor's in-content breadcrumb
 * which scrolls away). All segments are non-interactive text — there is no
 * real "reveal folder in tree" store action to wire them to, so per the UX
 * brief we render plain text rather than inventing navigation. The active
 * note segment is emphasised; long folder/note names truncate.
 */
export function Breadcrumb({ vaultName, segments }: BreadcrumbProps): JSX.Element {
  return (
    <nav
      aria-label="Posizione nota"
      className="flex h-7 shrink-0 items-center gap-1 overflow-hidden border-b border-border/70 bg-bg-subtle/60 px-3 text-xs text-fg-muted"
    >
      <span className="flex min-w-0 shrink items-center gap-1">
        <House size={13} aria-hidden="true" className="shrink-0 text-fg-muted" />
        <span className="max-w-[12rem] truncate font-medium text-fg-subtle" title={vaultName}>
          {vaultName}
        </span>
      </span>
      {segments.length === 0 ? (
        <>
          <Separator />
          <span className="truncate text-fg-muted">Nessuna nota aperta</span>
        </>
      ) : (
        segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          return (
            <span key={segment.key} className="flex min-w-0 shrink items-center gap-1">
              <Separator />
              <span
                className={
                  'max-w-[16rem] truncate ' + (isLast ? 'font-medium text-fg' : 'text-fg-muted')
                }
                title={segment.label}
                {...(isLast ? { 'aria-current': 'page' } : {})}
              >
                {segment.label}
              </span>
            </span>
          );
        })
      )}
    </nav>
  );
}

function Separator(): JSX.Element {
  return <CaretRight size={11} aria-hidden="true" className="shrink-0 text-border" />;
}
