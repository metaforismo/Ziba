import { Extension } from '@tiptap/core';
import type { Editor, Range } from '@tiptap/core';
import { PluginKey, type EditorState } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import type { CalloutKind } from './Callout';

/**
 * A single entry in the slash menu. The Tiptap extension passes this
 * through `command(props)` when the user picks an item, so the React
 * popup never has to know which Tiptap command to run — it just renders
 * the metadata and delegates selection back to the suggestion plugin.
 */
export type SlashMenuItem = {
  id: string;
  title: string;
  description: string;
  /** Tokens used for case-insensitive substring matching against the query. */
  keywords: string[];
  /** Short visual marker — emoji, glyph, or 2-char string. */
  icon: string;
};

export type SlashCommandRenderer = {
  onStart(props: SuggestionProps<SlashMenuItem>): void;
  onUpdate(props: SuggestionProps<SlashMenuItem>): void;
  onKeyDown(props: SuggestionKeyDownProps): boolean;
  onExit(props: SuggestionProps<SlashMenuItem>): void;
};

export type SlashCommandOptions = {
  /**
   * Factory for the React-backed popup. Decoupling the extension from
   * React keeps this file Tiptap-only — same pattern as
   * `WikilinkSuggestion`.
   *
   * If the caller passes `undefined` (or the default no-op), the
   * suggestion plugin still runs but the popup never shows. This makes
   * the extension a no-op until the Editor wires up a real renderer.
   */
  createRenderer(): SlashCommandRenderer;
  /**
   * Callback invoked when the user picks the `relation` slash entry.
   * The renderer is expected to surface a relation-picker popover
   * anchored at `position`, then write into `frontmatter.relations`
   * on commit. Omitted → the entry is a no-op (safe for headless /
   * test usage).
   */
  onRelationRequested?: (args: {
    editor: Editor;
    range: Range;
    position: { top: number; left: number; bottom: number };
  }) => void;
  /**
   * Callback invoked when the user picks `/database`. The React editor
   * opens a saved-view picker and inserts `databaseBlock` after the user
   * selects or creates a view.
   */
  onDatabaseRequested?: (args: {
    editor: Editor;
    range: Range;
    position: { top: number; left: number; bottom: number };
  }) => void;
  /**
   * The latest trigger-anchor rect, mutated by the renderer on every
   * suggestion `onStart` / `onUpdate`. We use it inside `command` to
   * anchor the relation popover at the slash position. A ref-like
   * object is mutated in place by the renderer; cheaper than
   * round-tripping through React state.
   */
  latestRect?: { current: { top: number; left: number; bottom: number } | null };
};

export const SlashCommandPluginKey = new PluginKey('slashCommand');

/**
 * The static slash menu catalog. Italian copy throughout — we don't
 * localize at runtime in v0.2.
 *
 * Order here is the order the user sees in an empty popup; filtering
 * preserves it. Keywords are matched case-insensitively as a substring
 * of either the title or any keyword token.
 */
const SLASH_MENU_ITEMS: ReadonlyArray<SlashMenuItem> = [
  {
    id: 'heading-1',
    title: 'Heading 1',
    description: 'Titolo di sezione grande',
    keywords: ['h1', 'title', 'titolo'],
    icon: 'H1',
  },
  {
    id: 'heading-2',
    title: 'Heading 2',
    description: 'Titolo di sottosezione',
    keywords: ['h2'],
    icon: 'H2',
  },
  {
    id: 'heading-3',
    title: 'Heading 3',
    description: 'Titolo più piccolo',
    keywords: ['h3'],
    icon: 'H3',
  },
  {
    id: 'bullet-list',
    title: 'Lista puntata',
    description: 'Lista non ordinata',
    keywords: ['bullet', 'list', 'ul', 'lista'],
    icon: '•',
  },
  {
    id: 'ordered-list',
    title: 'Lista numerata',
    description: 'Lista ordinata',
    keywords: ['ordered', 'numbered', 'ol', 'lista'],
    icon: '1.',
  },
  {
    id: 'blockquote',
    title: 'Citazione',
    description: 'Blocco di citazione',
    keywords: ['quote', 'citazione', 'blockquote'],
    icon: '❝',
  },
  {
    id: 'code-block',
    title: 'Blocco codice',
    description: 'Codice multiriga con sintassi',
    keywords: ['code', 'fence', 'codice'],
    icon: '</>',
  },
  {
    id: 'horizontal-rule',
    title: 'Linea divisoria',
    description: 'Separatore orizzontale',
    keywords: ['hr', 'line', 'separator', 'divisore'],
    icon: '—',
  },
  // Callout kinds. Each kind gets its own slash entry so the user picks
  // the variant directly without a follow-up click. The shared keyword
  // `callout` keeps the whole group reachable by typing `/callout`.
  {
    id: 'callout-note',
    title: 'Callout: nota',
    description: 'Blocco di nota generica',
    keywords: ['callout', 'note', 'nota'],
    icon: '🗒️',
  },
  {
    id: 'callout-info',
    title: 'Callout: info',
    description: 'Blocco informativo',
    keywords: ['callout', 'info', 'informazione'],
    icon: 'ℹ️',
  },
  {
    id: 'callout-tip',
    title: 'Callout: suggerimento',
    description: 'Suggerimento o consiglio',
    keywords: ['callout', 'tip', 'suggerimento', 'consiglio'],
    icon: '💡',
  },
  {
    id: 'callout-warning',
    title: 'Callout: avvertimento',
    description: 'Avviso da leggere con attenzione',
    keywords: ['callout', 'warning', 'avvertimento', 'avviso'],
    icon: '⚠️',
  },
  {
    id: 'callout-danger',
    title: 'Callout: pericolo',
    description: 'Avviso critico o errore',
    keywords: ['callout', 'danger', 'pericolo', 'errore'],
    icon: '🚨',
  },
  {
    id: 'callout-success',
    title: 'Callout: successo',
    description: 'Conferma di un esito positivo',
    keywords: ['callout', 'success', 'successo', 'ok'],
    icon: '✅',
  },
  {
    id: 'callout-quote',
    title: 'Callout: citazione',
    description: 'Citazione formattata con stile distintivo',
    keywords: ['callout', 'quote', 'citazione', 'cita'],
    icon: '❝',
  },
  {
    id: 'embed',
    title: 'Embed nota',
    description: "Mostra un'altra nota inline",
    keywords: ['embed', 'transclusion', 'inline'],
    icon: '↪',
  },
  {
    id: 'relation',
    title: 'Aggiungi relazione',
    description: 'Crea una relazione tipizzata nel frontmatter',
    keywords: ['relation', 'relazione', 'rel', 'link'],
    icon: '↗',
  },
  {
    id: 'database',
    title: 'Database',
    description: 'Inserisci una vista database salvata',
    keywords: ['database', 'db', 'vista', 'view', 'tabella', 'board'],
    icon: 'DB',
  },
  {
    id: 'math-block',
    title: 'Formula matematica',
    description: 'Blocco LaTeX `$$..$$` con rendering KaTeX',
    keywords: ['math', 'matematica', 'latex', 'katex', 'formula', 'equation'],
    icon: '∑',
  },
  {
    id: 'math-inline',
    title: 'Formula inline',
    description: 'Formula LaTeX inline `$..$`',
    keywords: ['math', 'matematica', 'latex', 'katex', 'inline'],
    icon: '𝑥',
  },
];

/**
 * Map slash menu ids of the form `callout-<kind>` to the corresponding
 * `CalloutKind`. Centralized so `runSlashCommand` stays readable and so
 * a typo in the id is a TS-level mismatch (the union enforces it).
 */
const CALLOUT_KIND_BY_ID: Record<string, CalloutKind> = {
  'callout-note': 'note',
  'callout-info': 'info',
  'callout-tip': 'tip',
  'callout-warning': 'warning',
  'callout-danger': 'danger',
  'callout-success': 'success',
  'callout-quote': 'quote',
};

/**
 * Returns true if the cursor is inside a code block or has the inline
 * code mark active. We use this to suppress the slash menu in contexts
 * where `/` is real syntax (e.g. paths in a code block: `path/to/file`).
 *
 * Without this guard, `startOfLine: true` would still trigger the popup
 * on the first column of any code-block line, which is jarring.
 */
function isInCodeContext(state: EditorState, fromPos: number): boolean {
  const $from = state.doc.resolve(fromPos);
  for (let depth = $from.depth; depth >= 0; depth--) {
    const nodeName = $from.node(depth).type.name;
    if (nodeName === 'codeBlock') return true;
  }
  const codeMark = state.schema.marks['code'];
  if (codeMark === undefined) return false;
  const $pos = state.doc.resolve(fromPos);
  return codeMark.isInSet($pos.marks()) !== undefined;
}

/**
 * Returns items whose title or any keyword contains `query` (case
 * insensitive). An empty/whitespace-only query returns everything in
 * declaration order so the user sees the full menu the moment they
 * type `/`.
 */
function filterItems(query: string): SlashMenuItem[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return [...SLASH_MENU_ITEMS];
  return SLASH_MENU_ITEMS.filter((item) => {
    if (item.title.toLowerCase().includes(normalized)) return true;
    return item.keywords.some((kw) => kw.toLowerCase().includes(normalized));
  });
}

/**
 * Translates a `SlashMenuItem.id` into a Tiptap command chain. The
 * suggestion plugin has already deleted the slash + query range by the
 * time we run; we just have to insert the new block at the now-empty
 * position.
 *
 * Ids that don't match a known command are silently ignored — the menu
 * is closed-set, so an unknown id is a programming error rather than a
 * user-facing failure.
 */
export function runSlashCommand(
  editor: Editor,
  id: string,
  context: {
    range: Range;
    position: { top: number; left: number; bottom: number };
    onRelationRequested?: SlashCommandOptions['onRelationRequested'];
    onDatabaseRequested?: SlashCommandOptions['onDatabaseRequested'];
  },
): void {
  switch (id) {
    case 'heading-1':
      editor.chain().focus().setNode('heading', { level: 1 }).run();
      return;
    case 'heading-2':
      editor.chain().focus().setNode('heading', { level: 2 }).run();
      return;
    case 'heading-3':
      editor.chain().focus().setNode('heading', { level: 3 }).run();
      return;
    case 'bullet-list':
      editor.chain().focus().toggleBulletList().run();
      return;
    case 'ordered-list':
      editor.chain().focus().toggleOrderedList().run();
      return;
    case 'blockquote':
      editor.chain().focus().setBlockquote().run();
      return;
    case 'code-block':
      editor.chain().focus().setCodeBlock().run();
      return;
    case 'horizontal-rule':
      editor.chain().focus().setHorizontalRule().run();
      return;
    case 'embed':
      // Insert an embed targeting a placeholder title. The user
      // typically follows up by clicking "Crea nota" inside the embed
      // body or by editing the source markdown directly. We don't
      // open a picker here for v0.4 - keeps the slash flow uniform
      // with the other no-op-payload entries.
      editor
        .chain()
        .focus()
        .insertContent({ type: 'embed', attrs: { target: 'Nuova nota' } })
        .run();
      return;
    case 'math-block':
      // Insert an empty math block. The node-view's empty-state
      // ("↪ tap to add formula") prompts the user to click and edit.
      editor
        .chain()
        .focus()
        .insertContent({ type: 'mathBlock', attrs: { formula: '' } })
        .run();
      return;
    case 'math-inline':
      editor
        .chain()
        .focus()
        .insertContent({ type: 'mathInline', attrs: { formula: '' } })
        .run();
      return;
    case 'relation':
      // Renderer handles the popover; the suggestion plugin already
      // deleted the slash + query above us, so we just delegate.
      context.onRelationRequested?.({
        editor,
        range: context.range,
        position: context.position,
      });
      return;
    case 'database':
      context.onDatabaseRequested?.({
        editor,
        range: context.range,
        position: context.position,
      });
      return;
    default: {
      // Callout entries share the `callout-<kind>` id pattern. We map
      // them through `CALLOUT_KIND_BY_ID` instead of enumerating each
      // case so adding a new kind only touches the catalog + the map.
      const kind = CALLOUT_KIND_BY_ID[id];
      if (kind !== undefined) {
        editor.commands.insertCallout({ kind });
        return;
      }
      // Unknown id — no-op. We could throw in dev, but a silent skip
      // keeps the editor from crashing on a stale build.
      return;
    }
  }
}

/**
 * Tiptap extension that opens a slash menu when the user types `/` at
 * the start of an empty paragraph (or after whitespace at line start —
 * `startOfLine` covers both). Selection inserts the corresponding block
 * and closes the popup.
 *
 * Architecture mirrors `WikilinkSuggestion`: the extension is
 * framework-agnostic and the actual popup is provided by
 * `createRenderer`. The Editor component supplies a React-backed
 * renderer that mounts a portal.
 */
export const SlashCommandExtension = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      // Default no-op renderer — the popup never appears unless the
      // Editor overrides this. Mirrors WikilinkSuggestion's defaults so
      // the extension is safe to register without a renderer (e.g. in
      // tests or headless mode).
      createRenderer(): SlashCommandRenderer {
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
      Suggestion<SlashMenuItem>({
        editor: this.editor,
        pluginKey: SlashCommandPluginKey,
        char: '/',
        // Slash queries are single-token filters; allowing spaces would
        // keep the popup open across paragraph-style content and lead
        // to surprises.
        allowSpaces: false,
        // Only fire at the start of an empty line / after whitespace at
        // line start. This is what prevents the popup from triggering
        // inside prose like `path/to/file`.
        startOfLine: true,

        // Suppress the popup inside code blocks and inline code spans.
        // `startOfLine` alone would still trigger inside a code block
        // because the suggestion plugin's positional check is
        // node-type-agnostic.
        allow: ({ state, range }) => !isInCodeContext(state, range.from),

        items: ({ query }: { query: string; editor: Editor }): SlashMenuItem[] => {
          return filterItems(query);
        },

        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: SlashMenuItem;
        }): void => {
          // Step 1: delete the slash + query so the new block replaces
          // them. We do this in a separate chain so the subsequent
          // node-mutating commands operate on a clean selection.
          editor.chain().focus().deleteRange(range).run();
          // Step 2: insert the chosen block (or delegate to the renderer
          // for entries like `relation` that open a popover instead).
          runSlashCommand(editor, props.id, {
            range,
            position: options.latestRect?.current ?? { top: 0, left: 0, bottom: 0 },
            onRelationRequested: options.onRelationRequested,
            onDatabaseRequested: options.onDatabaseRequested,
          });
        },

        render: () => options.createRenderer(),
      }),
    ];
  },
});

// Re-exported for tests / consumers that want to render the same list
// outside the editor (e.g. a docs page). Not used inside this file.
export const slashMenuItems: ReadonlyArray<SlashMenuItem> = SLASH_MENU_ITEMS;
