import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor as TiptapEditor } from '@tiptap/core';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { useEditorStore } from '../../stores/editor';
import { ipc } from '../../lib/ipc';
import { debounce } from '../../lib/debounce';
import { buildEditorExtensions } from './EditorExtensions';
import {
  type WikilinkSuggestionItem,
  type WikilinkSuggestionRenderer,
} from './extensions/WikilinkSuggestion';
import { useResolvedWikilinks } from './useResolvedWikilinks';
import { WikilinkPopup } from './WikilinkPopup';

export type EditorProps = {
  /**
   * Wave 3 keeps `onSave` as an optional override so callers can
   * intercept saves (e.g. a future "save as" flow). When omitted, the
   * editor calls `useEditorStore.save()` directly on the debounced
   * autosave path.
   */
  onSave?: () => void | Promise<void>;
};

type SuggestionState = {
  open: boolean;
  items: WikilinkSuggestionItem[];
  query: string;
  position: { top: number; left: number; bottom: number };
  selectedIndex: number;
};

const INITIAL_SUGGESTION_STATE: SuggestionState = {
  open: false,
  items: [],
  query: '',
  position: { top: 0, left: 0, bottom: 0 },
  selectedIndex: 0,
};

/**
 * Tiptap-backed markdown editor. Replaces the Wave 2 textarea stub.
 *
 * Lifecycle:
 *   - One editor instance lives for the component's lifetime. When the
 *     user opens a different note we call `editor.commands.setContent`
 *     with the new markdown — recreating the editor instance is
 *     expensive (full extension graph teardown + re-mount).
 *   - Autosave fires 500ms after the last keystroke. The debounced
 *     callback reads markdown via `editor.storage.markdown.getMarkdown`,
 *     pushes it into the store via `setBody`, then calls `save()`.
 *   - External-change conflicts are surfaced through `lastSaveError`
 *     (already wired in the editor store). When the user is dirty we
 *     show a banner with reload/discard actions.
 */
export function Editor({ onSave }: EditorProps): JSX.Element {
  const currentNote = useEditorStore((s) => s.currentNote);
  const dirty = useEditorStore((s) => s.dirty);
  const lastSaveError = useEditorStore((s) => s.lastSaveError);
  const setBody = useEditorStore((s) => s.setBody);
  const save = useEditorStore((s) => s.save);
  const openNote = useEditorStore((s) => s.openNote);

  // Refs let the editor extensions call into the latest store handlers
  // without re-binding extensions every render.
  const setBodyRef = useRef(setBody);
  const saveRef = useRef(save);
  const onSaveRef = useRef(onSave);
  const openNoteRef = useRef(openNote);
  useEffect(() => {
    setBodyRef.current = setBody;
    saveRef.current = save;
    onSaveRef.current = onSave;
    openNoteRef.current = openNote;
  });

  // Suggestion popup state lives in React so the popup can be a normal
  // component. The extension's render lifecycle calls back into these
  // setters via refs (so the extension closure stays stable).
  const [suggestion, setSuggestion] = useState<SuggestionState>(INITIAL_SUGGESTION_STATE);
  const suggestionRef = useRef<SuggestionState>(INITIAL_SUGGESTION_STATE);
  useEffect(() => {
    suggestionRef.current = suggestion;
  }, [suggestion]);

  // The `command` callback baked into the suggestion plugin captures the
  // initial reference. We keep the latest one in a ref so item-selection
  // always uses the freshest editor / range.
  const suggestionCommandRef = useRef<((item: WikilinkSuggestionItem) => void) | null>(null);

  const createSuggestionRenderer = useCallback((): WikilinkSuggestionRenderer => {
    return {
      onStart: (props: SuggestionProps<WikilinkSuggestionItem>): void => {
        suggestionCommandRef.current = (item): void => {
          props.command(item);
        };
        const rect = props.clientRect?.();
        setSuggestion({
          open: true,
          items: props.items,
          query: props.query,
          position: rect
            ? { top: rect.top, left: rect.left, bottom: rect.bottom }
            : { top: 0, left: 0, bottom: 0 },
          selectedIndex: 0,
        });
      },
      onUpdate: (props: SuggestionProps<WikilinkSuggestionItem>): void => {
        suggestionCommandRef.current = (item): void => {
          props.command(item);
        };
        const rect = props.clientRect?.();
        setSuggestion((prev) => ({
          open: true,
          items: props.items,
          query: props.query,
          position: rect ? { top: rect.top, left: rect.left, bottom: rect.bottom } : prev.position,
          // Clamp the previously-selected index to the new list length
          // so wrap-around doesn't land out of range when items shrink.
          selectedIndex:
            props.items.length === 0 ? 0 : Math.min(prev.selectedIndex, props.items.length - 1),
        }));
      },
      onKeyDown: (props: SuggestionKeyDownProps): boolean => {
        const state = suggestionRef.current;
        if (!state.open) return false;
        if (props.event.key === 'Escape') {
          setSuggestion(INITIAL_SUGGESTION_STATE);
          return true;
        }
        if (props.event.key === 'ArrowDown') {
          setSuggestion((prev) => ({
            ...prev,
            selectedIndex:
              prev.items.length === 0 ? 0 : (prev.selectedIndex + 1) % prev.items.length,
          }));
          return true;
        }
        if (props.event.key === 'ArrowUp') {
          setSuggestion((prev) => ({
            ...prev,
            selectedIndex:
              prev.items.length === 0
                ? 0
                : (prev.selectedIndex - 1 + prev.items.length) % prev.items.length,
          }));
          return true;
        }
        if (props.event.key === 'Enter' || props.event.key === 'Tab') {
          const items = state.items;
          if (items.length === 0) return false;
          const item = items[state.selectedIndex] ?? items[0];
          if (item === undefined) return false;
          const cmd = suggestionCommandRef.current;
          if (cmd !== null) cmd(item);
          return true;
        }
        return false;
      },
      onExit: (): void => {
        setSuggestion(INITIAL_SUGGESTION_STATE);
        suggestionCommandRef.current = null;
      },
    };
  }, []);

  // Build extensions once. The closure captures `createSuggestionRenderer`
  // which is stable across renders (it's wrapped in useCallback with no
  // deps). Recomputing extensions would force a full editor remount.
  const extensions = useMemo(
    () => buildEditorExtensions({ createSuggestionRenderer }),
    [createSuggestionRenderer],
  );

  const debouncedAutosave = useMemo(() => {
    return debounce((markdown: string) => {
      setBodyRef.current(markdown);
      // Defer the actual save to the next microtask so React's setState
      // (inside zustand) commits before we read back.
      Promise.resolve().then(() => {
        const handler = onSaveRef.current;
        if (handler !== undefined) {
          void handler();
        } else {
          void saveRef.current();
        }
      });
    }, 500);
  }, []);

  // Cancel pending autosaves when the component unmounts so we don't
  // race a stale write against the store after teardown.
  useEffect(() => {
    return (): void => {
      debouncedAutosave.flush();
    };
  }, [debouncedAutosave]);

  const editor = useEditor({
    extensions,
    content: '',
    editorProps: {
      attributes: {
        class: 'synapsium-prose prose prose-sm max-w-none focus:outline-none px-8 py-6',
        spellcheck: 'false',
      },
    },
    onUpdate: ({ editor: ed }): void => {
      // tiptap-markdown attaches `getMarkdown` on the storage namespace.
      const md =
        (ed.storage.markdown as { getMarkdown?: () => string } | undefined)?.getMarkdown?.() ?? '';
      debouncedAutosave(md);
    },
  });

  // Track whether the editor has been hydrated with the current note —
  // we use this to skip the initial onUpdate fired by setContent and
  // avoid marking a freshly-loaded note dirty.
  const hydratedPathRef = useRef<string | null>(null);

  // When the note changes, swap the content without recreating the
  // editor. tiptap-markdown's `setContent` command is patched to accept
  // markdown directly (see Markdown.js: addCommands.setContent).
  useEffect(() => {
    if (editor === null) return;
    if (currentNote === null) {
      hydratedPathRef.current = null;
      return;
    }
    if (hydratedPathRef.current === currentNote.path) {
      // Same note; the body might have changed externally (auto-reload
      // path in the store) — refresh the editor only if its current
      // markdown differs. Otherwise we'd clobber the user's selection.
      const current =
        (editor.storage.markdown as { getMarkdown?: () => string } | undefined)?.getMarkdown?.() ??
        '';
      if (current !== currentNote.content) {
        // Cancel any in-flight autosave before overwriting; otherwise the
        // debounced flush fires for the new content and marks the note
        // dirty again.
        debouncedAutosave.cancel();
        editor.commands.setContent(currentNote.content, false);
      }
      return;
    }
    hydratedPathRef.current = currentNote.path;
    debouncedAutosave.cancel();
    editor.commands.setContent(currentNote.content, false);
    // Focus the editor when a new note opens so the user can start typing
    // immediately. `setTimeout` defers past the setContent transaction.
    const timer = setTimeout(() => {
      if (!editor.isDestroyed) editor.commands.focus('end');
    }, 0);
    return (): void => clearTimeout(timer);
  }, [editor, currentNote, debouncedAutosave]);

  // Resolve wikilinks against the index so broken targets get the red
  // styling. Re-keyed on note path so the cache resets on navigation.
  useResolvedWikilinks(editor, currentNote?.path ?? null);

  // Click router: resolve the title; if it exists, open the note; if
  // not, create a `<title>.md` at the vault root and open that. The
  // create-then-open path mirrors Obsidian's "make a stub" behavior.
  // Defined before the click-handler effect so the effect's deps array
  // can reference it without hitting the temporal dead zone.
  const handleWikilinkClick = useCallback(async (title: string): Promise<void> => {
    try {
      const path = await ipc.resolveTitle({ title });
      if (path !== null) {
        await openNoteRef.current(path);
        return;
      }
      // Create a new note at the vault root. The slugging /
      // sanitization of the filename is the responsibility of the
      // backend (it already enforces that the path ends in `.md`).
      const newPath = `${title}.md`;
      const created = await ipc.createNote({ path: newPath });
      await openNoteRef.current(created.path);
    } catch (err) {
      // Surface the failure via the editor store's existing error
      // channel; we don't have a global toast in v0.1.
      const message = err instanceof Error ? err.message : 'Errore wikilink sconosciuto';
      useEditorStore.setState({
        lastSaveError: `Impossibile aprire «${title}»: ${message}`,
      });
    }
  }, []);

  // Click handling: navigate (or create-then-navigate) on wikilink click.
  // We attach to the editor's DOM root and event-delegate on
  // `[data-wikilink]` so we don't have to re-bind on every render of
  // each node.
  useEffect(() => {
    if (editor === null) return;
    const dom = editor.view.dom;
    const handler = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const link = target.closest<HTMLElement>('[data-wikilink]');
      if (link === null) return;
      // Only respond to plain clicks; let modifier-clicks fall through
      // (future: open in split / new tab).
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      const title = link.getAttribute('data-target') ?? '';
      if (title.length === 0) return;
      void handleWikilinkClick(title);
    };
    dom.addEventListener('click', handler);
    return (): void => {
      dom.removeEventListener('click', handler);
    };
  }, [editor, handleWikilinkClick]);

  const isExternalConflict =
    lastSaveError !== null && lastSaveError.includes('modificato esternamente');

  const handleManualSave = (): void => {
    debouncedAutosave.cancel();
    if (editor !== null) {
      const md =
        (editor.storage.markdown as { getMarkdown?: () => string } | undefined)?.getMarkdown?.() ??
        '';
      setBodyRef.current(md);
    }
    if (onSave !== undefined) void onSave();
    else void save();
  };

  const handleReloadFromDisk = async (): Promise<void> => {
    if (currentNote === null) return;
    debouncedAutosave.cancel();
    // Force a fresh load from the IPC layer. `openNote` already resets
    // dirty/lastSaveError so the conflict banner clears on success.
    await openNoteRef.current(currentNote.path);
  };

  if (currentNote === null) {
    return (
      <section className="flex h-full items-center justify-center bg-bg text-sm text-fg-muted">
        Seleziona o crea una nota
      </section>
    );
  }

  return (
    <section className="relative flex h-full flex-col bg-bg">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <h2 className="truncate text-sm font-medium text-fg">
          {currentNote.title}
          {dirty && <span className="ml-2 text-fg-muted">•</span>}
        </h2>
        <button
          type="button"
          onClick={handleManualSave}
          disabled={!dirty}
          className="rounded bg-accent px-3 py-1 text-xs font-medium text-accent-fg disabled:opacity-50"
        >
          Salva
        </button>
      </div>

      {lastSaveError !== null && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-bg-subtle px-4 py-2 text-xs text-fg-subtle">
          <span className="truncate">{lastSaveError}</span>
          {isExternalConflict && (
            <span className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={(): void => {
                  void handleReloadFromDisk();
                }}
                className="rounded bg-accent px-2 py-0.5 text-xs font-medium text-accent-fg"
              >
                Ricarica
              </button>
              <button
                type="button"
                onClick={handleManualSave}
                className="rounded border border-border bg-bg px-2 py-0.5 text-xs font-medium text-fg"
              >
                Sovrascrivi
              </button>
            </span>
          )}
        </div>
      )}

      <div
        className="synapsium-editor-scroll flex-1 overflow-y-auto"
        // The wikilink chip styles are inlined here (small surface area)
        // so we don't need a new CSS file. Tailwind utilities cover the
        // rest of the typography via `synapsium-prose`.
      >
        <div className="mx-auto max-w-[720px]">
          <EditorContent editor={editor} />
        </div>
      </div>

      {suggestion.open && editor !== null && (
        <WikilinkPopup
          items={suggestion.items}
          selectedIndex={suggestion.selectedIndex}
          query={suggestion.query}
          position={suggestion.position}
          onSelect={(item): void => {
            const cmd = suggestionCommandRef.current;
            if (cmd !== null) cmd(item);
          }}
          onHover={(idx): void => {
            setSuggestion((prev) => ({ ...prev, selectedIndex: idx }));
          }}
        />
      )}
    </section>
  );
}

// Re-export the editor type so callers can pass refs around without
// importing from `@tiptap/core` directly.
export type { TiptapEditor };
