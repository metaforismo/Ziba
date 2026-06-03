import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor as TiptapEditor } from '@tiptap/core';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import type { Frontmatter } from '@ziba/core';
import { Check, CheckCircle, NotePencil } from '@phosphor-icons/react';
import { useEditorStore } from '../../stores/editor';
import { useUiStore } from '../../stores/ui';
import { useVaultStore } from '../../stores/vault';
import { ipc } from '../../lib/ipc';
import { ipcErrorMessage } from '../../lib/ipc-error';
import { createStarterVault } from '../../lib/starter-vault';
import { debounce } from '../../lib/debounce';
import { AUTOSAVE_DEBOUNCE_MS, PROPERTY_AUTOSAVE_DEBOUNCE_MS } from '../../lib/timings';
import { setRelationInFrontmatter } from '../../lib/relations-frontmatter';
import { useTagsStore } from '../../stores/tags';
import { toast } from '../../stores/toast';
import { PropertyEditor } from '../PropertyEditor';
import { buildEditorExtensions, type BuildExtensionsOptions } from './EditorExtensions';
import { type SlashCommandRenderer, type SlashMenuItem } from './extensions/SlashCommand';
import {
  type WikilinkSuggestionItem,
  type WikilinkSuggestionRenderer,
} from './extensions/WikilinkSuggestion';
import { RelationPickerPopup } from './RelationPickerPopup';
import { SlashMenuPopup } from './SlashMenuPopup';
import { useResolvedWikilinks } from './useResolvedWikilinks';
import { useWikilinkTypes } from './useWikilinkTypes';
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

type SlashState = {
  open: boolean;
  items: SlashMenuItem[];
  position: { top: number; left: number; bottom: number };
  selectedIndex: number;
};

const INITIAL_SLASH_STATE: SlashState = {
  open: false,
  items: [],
  position: { top: 0, left: 0, bottom: 0 },
  selectedIndex: 0,
};

type RelationPickerState = {
  open: boolean;
  position: { top: number; left: number; bottom: number };
  suggestedKinds: string[];
};

const INITIAL_RELATION_PICKER_STATE: RelationPickerState = {
  open: false,
  position: { top: 0, left: 0, bottom: 0 },
  suggestedKinds: [],
};

function basenameTitle(path: string): string {
  const last = path.split('/').pop() ?? path;
  return last.replace(/\.md$/i, '');
}

function titleToFilename(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+$/, '');
  return `${cleaned.length === 0 ? 'Senza titolo' : cleaned}.md`;
}

function renamedPath(path: string, title: string): string {
  const parts = path.split('/');
  parts[parts.length - 1] = titleToFilename(title);
  return parts.join('/');
}

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
  const setFrontmatter = useEditorStore((s) => s.setFrontmatter);
  const save = useEditorStore((s) => s.save);
  const openNote = useEditorStore((s) => s.openNote);
  const createUntitledNote = useEditorStore((s) => s.createUntitledNote);
  const setMainView = useUiStore((s) => s.setMainView);
  const notes = useVaultStore((s) => s.notes);
  const [starterCreating, setStarterCreating] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // Refs let the editor extensions call into the latest store handlers
  // without re-binding extensions every render.
  const setBodyRef = useRef(setBody);
  const setFrontmatterRef = useRef(setFrontmatter);
  const saveRef = useRef(save);
  const onSaveRef = useRef(onSave);
  const openNoteRef = useRef(openNote);
  useEffect(() => {
    setBodyRef.current = setBody;
    setFrontmatterRef.current = setFrontmatter;
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

  // Parallel slash-menu state. We deliberately keep it side-by-side
  // with the wikilink state instead of unifying them — the items shape
  // and key handling are different enough that abstraction would cost
  // more than it saves at v0.2 scope.
  const [slash, setSlash] = useState<SlashState>(INITIAL_SLASH_STATE);
  const slashRef = useRef<SlashState>(INITIAL_SLASH_STATE);
  useEffect(() => {
    slashRef.current = slash;
  }, [slash]);

  const [relationPicker, setRelationPicker] = useState<RelationPickerState>(
    INITIAL_RELATION_PICKER_STATE,
  );

  // Mutable ref shared with the SlashCommand extension so the relation
  // popover is anchored at the latest slash anchor (rather than where
  // the cursor was when the command closure was created).
  const slashLatestRect = useRef<{ top: number; left: number; bottom: number } | null>(null);

  // The `command` callback baked into the suggestion plugin captures the
  // initial reference. We keep the latest one in a ref so item-selection
  // always uses the freshest editor / range.
  const suggestionCommandRef = useRef<((item: WikilinkSuggestionItem) => void) | null>(null);
  const slashCommandRef = useRef<((item: SlashMenuItem) => void) | null>(null);

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

  const createSlashRenderer = useCallback((): SlashCommandRenderer => {
    return {
      onStart: (props: SuggestionProps<SlashMenuItem>): void => {
        slashCommandRef.current = (item): void => {
          props.command(item);
        };
        const rect = props.clientRect?.();
        if (rect) slashLatestRect.current = { top: rect.top, left: rect.left, bottom: rect.bottom };
        setSlash({
          open: true,
          items: props.items,
          position: rect
            ? { top: rect.top, left: rect.left, bottom: rect.bottom }
            : { top: 0, left: 0, bottom: 0 },
          selectedIndex: 0,
        });
      },
      onUpdate: (props: SuggestionProps<SlashMenuItem>): void => {
        slashCommandRef.current = (item): void => {
          props.command(item);
        };
        const rect = props.clientRect?.();
        if (rect) slashLatestRect.current = { top: rect.top, left: rect.left, bottom: rect.bottom };
        setSlash((prev) => ({
          open: true,
          items: props.items,
          position: rect ? { top: rect.top, left: rect.left, bottom: rect.bottom } : prev.position,
          // Clamp the selected index to the new list length so a
          // shrinking filter doesn't leave us out of range.
          selectedIndex:
            props.items.length === 0 ? 0 : Math.min(prev.selectedIndex, props.items.length - 1),
        }));
      },
      onKeyDown: (props: SuggestionKeyDownProps): boolean => {
        const state = slashRef.current;
        if (!state.open) return false;
        if (props.event.key === 'Escape') {
          setSlash(INITIAL_SLASH_STATE);
          return true;
        }
        if (props.event.key === 'ArrowDown') {
          setSlash((prev) => ({
            ...prev,
            selectedIndex:
              prev.items.length === 0 ? 0 : (prev.selectedIndex + 1) % prev.items.length,
          }));
          return true;
        }
        if (props.event.key === 'ArrowUp') {
          setSlash((prev) => ({
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
          const cmd = slashCommandRef.current;
          if (cmd !== null) cmd(item);
          return true;
        }
        return false;
      },
      onExit: (): void => {
        setSlash(INITIAL_SLASH_STATE);
        slashCommandRef.current = null;
      },
    };
  }, []);

  const objectTypeSchemas = useTagsStore((s) => s.objectTypeSchemas);
  const suggestedRelationKinds = useMemo<string[]>(() => {
    if (currentNote === null) return [];
    const t = currentNote.frontmatter.type;
    if (typeof t !== 'string') return [];
    const schema = objectTypeSchemas.find((s) => s.id === t);
    if (schema === undefined) return [];
    return Object.keys(schema.schema.relations);
  }, [currentNote, objectTypeSchemas]);

  const handleRelationRequested = useCallback<
    NonNullable<BuildExtensionsOptions['onSlashRelationRequested']>
  >(
    ({ position }) => {
      setRelationPicker({
        open: true,
        position,
        suggestedKinds: suggestedRelationKinds,
      });
    },
    [suggestedRelationKinds],
  );

  const handleRelationRequestedRef = useRef(handleRelationRequested);
  useEffect(() => {
    handleRelationRequestedRef.current = handleRelationRequested;
  });

  // Build extensions once. The closure captures `createSuggestionRenderer`
  // which is stable across renders (it's wrapped in useCallback with no
  // deps). Recomputing extensions would force a full editor remount.
  const extensions = useMemo(
    () =>
      buildEditorExtensions({
        createSuggestionRenderer,
        createSlashRenderer,
        onSlashRelationRequested: (args) => handleRelationRequestedRef.current(args),
        slashLatestRect,
      }),
    [createSuggestionRenderer, createSlashRenderer],
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
    }, AUTOSAVE_DEBOUNCE_MS);
  }, []);

  // Cancel pending autosaves when the component unmounts so we don't
  // race a stale write against the store after teardown.
  useEffect(() => {
    return (): void => {
      debouncedAutosave.flush();
    };
  }, [debouncedAutosave]);

  // Property edits get their own debounce because they're discrete
  // (toggle a checkbox, add a chip) rather than continuous typing —
  // 300ms is short enough to feel like the change "stuck" before the
  // user moves on, long enough to coalesce e.g. a date being typed
  // digit-by-digit into one disk write.
  const debouncedPropertySave = useMemo(() => {
    return debounce(() => {
      Promise.resolve().then(() => {
        const handler = onSaveRef.current;
        if (handler !== undefined) {
          void handler();
        } else {
          void saveRef.current();
        }
      });
    }, PROPERTY_AUTOSAVE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return (): void => {
      debouncedPropertySave.flush();
    };
  }, [debouncedPropertySave]);

  const handleFrontmatterChange = useCallback(
    (next: Frontmatter): void => {
      setFrontmatterRef.current(next);
      debouncedPropertySave();
    },
    [debouncedPropertySave],
  );

  const editor = useEditor({
    extensions,
    content: '',
    editorProps: {
      attributes: {
        class: 'ziba-prose prose prose-sm max-w-none focus:outline-none py-6',
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
  useWikilinkTypes(editor);

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
      const message = ipcErrorMessage(err);
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

  useEffect(() => {
    setTitleDraft(currentNote === null ? '' : basenameTitle(currentNote.path));
  }, [currentNote]);

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

  const handleTitleCommit = async (): Promise<void> => {
    if (currentNote === null) return;
    const nextPath = renamedPath(currentNote.path, titleDraft);
    if (nextPath === currentNote.path) {
      setTitleDraft(basenameTitle(currentNote.path));
      return;
    }
    try {
      const result = await ipc.renameNote({ from: currentNote.path, to: nextPath });
      await useVaultStore.getState().refreshNotes();
      await openNoteRef.current(result.newPath, { reuseExisting: false });
    } catch (err: unknown) {
      setTitleDraft(basenameTitle(currentNote.path));
      toast.error(ipcErrorMessage(err), 'Impossibile rinominare la nota');
    }
  };

  const handleCreateBlankNote = async (): Promise<void> => {
    try {
      await createUntitledNote();
      setMainView('editor');
    } catch (err: unknown) {
      toast.error(ipcErrorMessage(err), 'Impossibile creare la nota');
    }
  };

  const handleCreateStarter = async (): Promise<void> => {
    setStarterCreating(true);
    try {
      await createStarterVault();
    } catch (err: unknown) {
      toast.error(ipcErrorMessage(err), 'Impossibile creare la struttura iniziale');
    } finally {
      setStarterCreating(false);
    }
  };

  if (currentNote === null) {
    const showStarterAction = notes.length === 0;

    return (
      <section className="flex h-full bg-bg">
        <div className="mx-auto flex w-full max-w-[760px] flex-col px-8 py-10">
          <div className="mb-10 flex items-center justify-between gap-4 text-sm">
            <div className="truncate text-fg-muted">
              <span>Projects</span>
              <span className="mx-3 text-border">/</span>
              <span>Ziba.md</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {showStarterAction && (
                <button
                  type="button"
                  onClick={(): void => {
                    void handleCreateStarter();
                  }}
                  disabled={starterCreating}
                  className="inline-flex min-h-8 items-center rounded-md bg-accent px-3 text-xs font-semibold text-accent-fg transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {starterCreating ? 'Creo la base...' : 'Crea struttura iniziale'}
                </button>
              )}
              <button
                type="button"
                onClick={(): void => {
                  void handleCreateBlankNote();
                }}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 text-xs font-medium text-fg-subtle transition hover:bg-bg-muted hover:text-fg"
              >
                <NotePencil size={15} aria-hidden="true" />
                Crea nota
              </button>
            </div>
          </div>

          <article className="max-w-[620px]">
            <h1 className="text-5xl font-semibold leading-none text-fg">Ziba</h1>

            <div className="mt-6 flex items-center gap-2 text-sm text-fg-muted">
              <CheckCircle size={16} aria-hidden="true" className="text-accent" />
              <span>Salvata</span>
            </div>

            <button
              type="button"
              disabled
              className="mt-8 flex min-h-12 w-full items-center justify-between rounded-lg border border-border bg-bg-subtle px-4 text-left text-sm text-fg-subtle shadow-sm"
            >
              <span>Proprietà</span>
              <span aria-hidden="true">›</span>
            </button>

            <div className="mt-8 border-t border-border pt-8">
              <h2 className="text-2xl font-semibold text-fg">
                Costruire un secondo cervello semplice
              </h2>
              <p className="mt-5 max-w-[58ch] text-base leading-8 text-fg-subtle">
                Ziba è il mio spazio per catturare idee, collegare concetti e costruire conoscenza
                che resta nel tempo.
              </p>

              <div className="mt-6 space-y-3 text-base text-fg-subtle">
                <StarterTask checked label="Raccogliere idee ogni giorno" />
                <StarterTask label="Collegare le note tra loro" />
                <StarterTask label="Ritrovare e usare le conoscenze" />
              </div>
            </div>

            <div className="mt-8 border-t border-border pt-7">
              <h3 className="text-xl font-semibold text-fg">Collegamenti utili</h3>
              <p className="mt-5 text-base leading-8 text-fg-subtle">
                Approfondimento su{' '}
                <span className="rounded-md bg-bg-muted px-2 py-1 text-accent">
                  [[Ricerca semantica]]
                </span>{' '}
                e costruzione di reti di conoscenza.
              </p>
              <div className="mt-6 inline-flex rounded-full border border-border bg-bg-subtle px-3 py-1 text-sm text-accent">
                #prodotto
              </div>
            </div>
          </article>

          {notes.length > 0 && (
            <div className="mt-10 max-w-[620px] rounded-md border border-border bg-bg-subtle px-4 py-3 text-sm text-fg-muted">
              Seleziona una nota dalla barra laterale per aprirla.
            </div>
          )}
        </div>
      </section>
    );
  }

  const pathParts = currentNote.path.split('/');
  pathParts.pop();
  const breadcrumb = pathParts.length > 0 ? pathParts.join(' / ') : 'Note';
  const saveStatus =
    lastSaveError !== null ? 'Errore salvataggio' : dirty ? 'Modifiche non salvate' : 'Salvato';

  return (
    <section className="relative flex h-full flex-col bg-bg">
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
        className="ziba-editor-scroll flex-1 overflow-y-auto"
        // The wikilink chip styles are inlined here (small surface area)
        // so we don't need a new CSS file. Tailwind utilities cover the
        // rest of the typography via `ziba-prose`.
      >
        <div className="mx-auto flex w-full max-w-[760px] flex-col px-8 py-10">
          <div className="mb-8 flex items-center justify-between gap-4 text-sm">
            <div className="min-w-0 truncate text-fg-muted">
              <span>{breadcrumb}</span>
              <span className="mx-3 text-border">/</span>
              <span>{basenameTitle(currentNote.path)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={
                  'text-xs ' +
                  (lastSaveError !== null || dirty ? 'text-fg-subtle' : 'text-fg-muted')
                }
              >
                {saveStatus}
              </span>
              <button
                type="button"
                onClick={handleManualSave}
                disabled={!dirty}
                className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-fg disabled:opacity-50"
              >
                Salva
              </button>
            </div>
          </div>

          <input
            type="text"
            value={titleDraft}
            aria-label="Titolo nota"
            onChange={(e): void => setTitleDraft(e.target.value)}
            onBlur={(): void => {
              void handleTitleCommit();
            }}
            onKeyDown={(e): void => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setTitleDraft(basenameTitle(currentNote.path));
                e.currentTarget.blur();
              }
            }}
            className="w-full border-0 bg-transparent px-0 py-1 text-5xl font-semibold leading-none text-fg outline-none placeholder:text-fg-muted"
            placeholder="Senza titolo"
            spellCheck={false}
          />

          <div className="mt-6 overflow-hidden rounded-lg border border-border bg-bg-subtle/60">
            <PropertyEditor
              frontmatter={currentNote.frontmatter}
              onChange={handleFrontmatterChange}
              suggestedRelationKinds={suggestedRelationKinds}
            />
          </div>

          <div className="mt-4">
            <EditorContent editor={editor} />
          </div>
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

      {slash.open && editor !== null && (
        <SlashMenuPopup
          items={slash.items}
          selectedIndex={slash.selectedIndex}
          position={slash.position}
          onSelect={(item): void => {
            const cmd = slashCommandRef.current;
            if (cmd !== null) cmd(item);
          }}
          onHover={(idx): void => {
            setSlash((prev) => ({ ...prev, selectedIndex: idx }));
          }}
        />
      )}

      {relationPicker.open && (
        <RelationPickerPopup
          position={relationPicker.position}
          suggestedKinds={relationPicker.suggestedKinds}
          onCommit={({ kind, target }): void => {
            if (currentNote === null) {
              setRelationPicker(INITIAL_RELATION_PICKER_STATE);
              return;
            }
            const next = setRelationInFrontmatter(currentNote.frontmatter, kind, target);
            setFrontmatterRef.current(next);
            debouncedPropertySave();
            setRelationPicker(INITIAL_RELATION_PICKER_STATE);
          }}
          onCancel={(): void => setRelationPicker(INITIAL_RELATION_PICKER_STATE)}
        />
      )}
    </section>
  );
}

// Re-export the editor type so callers can pass refs around without
// importing from `@tiptap/core` directly.
export type { TiptapEditor };

function StarterTask({
  label,
  checked = false,
}: {
  label: string;
  checked?: boolean;
}): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={
          'inline-flex size-5 shrink-0 items-center justify-center rounded border ' +
          (checked
            ? 'border-accent bg-accent text-accent-fg'
            : 'border-border bg-bg text-transparent')
        }
      >
        {checked && <Check size={13} weight="bold" />}
      </span>
      <span>{label}</span>
    </div>
  );
}
