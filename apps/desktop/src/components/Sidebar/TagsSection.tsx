import type { NotePath } from '@ziba/core';
import { CaretDown, CaretRight, FileText } from '@phosphor-icons/react';
import { navigateToNote } from '../../lib/navigate';
import { useEditorStore } from '../../stores/editor';
import { useTagsStore } from '../../stores/tags';
import { useUiStore } from '../../stores/ui';

/**
 * Sidebar section listing every tag in the vault. Click a tag to filter the
 * file tree to notes that contain it; click again (or "Mostra tutti i file")
 * to clear the filter.
 *
 * The section is collapsible and its open/closed state persists via
 * `useUiStore.tagsExpanded`. The note list under a selected tag is rendered
 * inline below the tag list — same visual treatment as a folder expansion,
 * scoped to the current selection.
 */
export function TagsSection(): JSX.Element {
  const tags = useTagsStore((s) => s.tags);
  const selectedTag = useTagsStore((s) => s.selectedTag);
  const notesForSelectedTag = useTagsStore((s) => s.notesForSelectedTag);
  const selectTag = useTagsStore((s) => s.selectTag);
  const expanded = useUiStore((s) => s.tagsExpanded);
  const toggleExpanded = useUiStore((s) => s.toggleTags);
  const currentPath = useEditorStore((s) => s.currentPath);

  const handleTagClick = (canonical: string): void => {
    // Clicking the already-selected tag clears the filter — gives the user
    // a quick toggle without having to find the "Mostra tutti" button.
    if (selectedTag === canonical) {
      void selectTag(null);
      return;
    }
    void selectTag(canonical);
  };

  const handleNoteClick = (path: NotePath): void => {
    void navigateToNote(path);
  };

  const totalCount = tags.length;

  return (
    <section className="shrink-0 border-b border-border" aria-label="Tag">
      <button
        type="button"
        onClick={toggleExpanded}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-fg-muted hover:text-fg"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-3 text-center">
            {expanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
          </span>
          <span>Tag</span>
        </span>
        <span
          className="rounded bg-bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-fg-muted"
          aria-label={`${totalCount} tag totali`}
        >
          {totalCount}
        </span>
      </button>

      {expanded && (
        <div className="px-1 pb-2">
          {tags.length === 0 ? (
            <p className="px-2 py-2 text-xs text-fg-muted">
              Aggiungi <code className="font-mono">#tag</code> nel testo o{' '}
              <code className="font-mono">tags: []</code> nel frontmatter di una nota.
            </p>
          ) : (
            <ul role="list" className="space-y-px">
              {tags.map((t) => {
                const active = selectedTag === t.tag;
                return (
                  <li key={t.tag}>
                    <button
                      type="button"
                      onClick={(): void => handleTagClick(t.tag)}
                      title={`#${t.display}`}
                      aria-pressed={active}
                      className={
                        'flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm ' +
                        (active
                          ? 'bg-accent/10 text-fg'
                          : 'text-fg-subtle hover:bg-bg-muted hover:text-fg')
                      }
                    >
                      <span className="truncate font-mono text-fg-muted">#{t.display}</span>
                      <span className="shrink-0 text-xs tabular-nums text-fg-muted">{t.count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selectedTag !== null && (
            <div className="mt-2 border-t border-border pt-2">
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
                  Note con{' '}
                  <span className="font-mono normal-case tracking-normal text-fg-subtle">
                    #{displayForCanonical(tags, selectedTag)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={(): void => {
                    void selectTag(null);
                  }}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-fg-muted hover:bg-bg-muted hover:text-fg"
                >
                  Mostra tutti
                </button>
              </div>

              {notesForSelectedTag.length === 0 ? (
                <p className="px-2 py-1 text-xs text-fg-muted">Nessuna nota con questo tag.</p>
              ) : (
                <ul role="list" className="space-y-px">
                  {notesForSelectedTag.map((n) => {
                    const active = currentPath === n.path;
                    return (
                      <li key={n.path}>
                        <button
                          type="button"
                          onClick={(): void => handleNoteClick(n.path)}
                          title={n.path}
                          className={
                            'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm ' +
                            (active
                              ? 'bg-accent/10 text-fg'
                              : 'text-fg-subtle hover:bg-bg-muted hover:text-fg')
                          }
                        >
                          <span aria-hidden="true" className="shrink-0 text-fg-muted">
                            <FileText size={15} />
                          </span>
                          <span className="truncate">{n.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Look up the display-case form for a canonical tag. Falls back to the
 * canonical when the tag was just removed from the listing (race between
 * a refresh and the in-flight `notesForSelectedTag` request).
 */
function displayForCanonical(tags: { tag: string; display: string }[], canonical: string): string {
  const found = tags.find((t) => t.tag === canonical);
  return found?.display ?? canonical;
}
