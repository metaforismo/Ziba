import { Extension } from '@tiptap/core';
import type { Editor, Range } from '@tiptap/core';
import type { ResolvedPos } from '@tiptap/pm/model';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import type { NoteSummary } from '@synapsium/core';
import { ipc } from '../../../lib/ipc';

export type WikilinkSuggestionItem = {
  /** Note path (vault-relative). May be `null` for the "create new" hint. */
  path: string | null;
  /** Display title — what becomes the wikilink target on selection. */
  title: string;
  /** True for the synthetic "Crea «query»" entry. */
  isCreate: boolean;
};

export type WikilinkSuggestionRenderer = {
  onStart(props: SuggestionProps<WikilinkSuggestionItem>): void;
  onUpdate(props: SuggestionProps<WikilinkSuggestionItem>): void;
  onKeyDown(props: SuggestionKeyDownProps): boolean;
  onExit(props: SuggestionProps<WikilinkSuggestionItem>): void;
};

export type WikilinkSuggestionOptions = {
  /**
   * Factory for the React-backed popup. The Editor wires this to a
   * function that mounts/unmounts a portal component. Decoupling the
   * extension from React keeps this file Tiptap-only and testable in
   * isolation.
   */
  createRenderer(): WikilinkSuggestionRenderer;
};

export const WikilinkSuggestionPluginKey = new PluginKey('wikilinkSuggestion');

/**
 * Custom suggestion match: opens when the user types `[[` and stays open
 * until they close it (`]]`), press Esc, or the cursor leaves the trigger
 * region.
 *
 * Tiptap's built-in `findSuggestionMatch` only supports a single trigger
 * character, so we re-implement the matching logic to look for `[[` and
 * walk the text-before-cursor to extract the query.
 */
function findWikilinkMatch($position: ResolvedPos): {
  range: Range;
  query: string;
  text: string;
} | null {
  const text = $position.nodeBefore?.isText ? $position.nodeBefore.text : null;
  if (text === null || text === undefined) return null;

  // Look for the last `[[` before the cursor. Must not be already closed
  // by `]]` between the trigger and the cursor — once the user types
  // `]]`, the input rule on the Wikilink node converts the whole thing
  // into a node, and we shouldn't keep the popup open.
  const triggerIdx = text.lastIndexOf('[[');
  if (triggerIdx === -1) return null;

  const between = text.slice(triggerIdx + 2);
  if (between.includes(']]')) return null;
  // Disallow newlines inside the query — the suggestion should close if
  // the user hits Enter without selecting anything.
  if (between.includes('\n')) return null;

  // The absolute document position where `[[` starts.
  const textStart = $position.pos - text.length;
  const from = textStart + triggerIdx;
  const to = $position.pos;

  return {
    range: { from, to },
    query: between,
    text: text.slice(triggerIdx),
  };
}

/**
 * Extension that wires `@tiptap/suggestion` to our IPC-backed search and
 * to the custom `[[` trigger. The selected item is converted into a
 * Wikilink node via the `insertWikilink` command (defined on the Wikilink
 * extension).
 */
export const WikilinkSuggestion = Extension.create<WikilinkSuggestionOptions>({
  name: 'wikilinkSuggestion',

  addOptions() {
    return {
      // Default no-op renderer — must be overridden by the Editor
      // component. We can't import React from this file (extension is
      // framework-agnostic), so the actual popup lives in `WikilinkPopup`.
      createRenderer(): WikilinkSuggestionRenderer {
        return {
          onStart(): void {},
          onUpdate(): void {},
          onKeyDown(): boolean {
            return false;
          },
          onExit(): void {},
        };
      },
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      Suggestion<WikilinkSuggestionItem>({
        editor: this.editor,
        pluginKey: WikilinkSuggestionPluginKey,
        // `char` is required by the type but unused — `findSuggestionMatch`
        // is fully overridden below. We pass a value that's unlikely to
        // trigger anything alone.
        char: '[[',
        allowSpaces: true,
        startOfLine: false,

        findSuggestionMatch: ({ $position }) => findWikilinkMatch($position),

        async items({
          query,
        }: {
          query: string;
          editor: Editor;
        }): Promise<WikilinkSuggestionItem[]> {
          const trimmed = query.trim();
          // Don't fire the IPC on an empty query — show nothing until
          // the user types at least one character. This keeps the popup
          // tight on `[[` and avoids a noisy "everything" list.
          let results: NoteSummary[] = [];
          if (trimmed.length > 0) {
            try {
              results = await ipc.searchByTitle({ prefix: trimmed, limit: 8 });
            } catch {
              results = [];
            }
          }

          const items: WikilinkSuggestionItem[] = results.map((r) => ({
            path: r.path,
            title: r.title,
            isCreate: false,
          }));

          // Offer a "Create new note" entry when there's a non-empty
          // query and no exact title match. The Editor click handler
          // already creates-then-opens broken links, but the
          // suggestion-time creation hint matches Obsidian's UX.
          if (
            trimmed.length > 0 &&
            !items.some((i) => i.title.toLowerCase() === trimmed.toLowerCase())
          ) {
            items.push({ path: null, title: trimmed, isCreate: true });
          }

          return items;
        },

        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: WikilinkSuggestionItem;
        }) => {
          editor.commands.insertWikilink({
            target: props.title,
            range,
          });
        },

        render: () => options.createRenderer(),
      }),
    ];
  },
});
