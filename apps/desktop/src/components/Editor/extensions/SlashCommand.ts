import { Extension } from '@tiptap/core';
import type { Editor, Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';

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
  {
    id: 'callout',
    title: 'Callout',
    description: 'Avviso evidenziato (v0.2 minimale)',
    keywords: ['callout', 'warning', 'info', 'avviso'],
    icon: '💡',
  },
];

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
function runSlashCommand(editor: Editor, id: string): void {
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
    case 'callout':
      // v0.3 will add a proper callout node. For now we approximate it
      // with a blockquote whose first line is `> ⚠️ ` so the user has a
      // visual placeholder to type into.
      editor.chain().focus().setBlockquote().insertContent('⚠️ ').run();
      return;
    default:
      // Unknown id — no-op. We could throw in dev, but a silent skip
      // keeps the editor from crashing on a stale build.
      return;
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
          // Step 2: insert the chosen block.
          runSlashCommand(editor, props.id);
        },

        render: () => options.createRenderer(),
      }),
    ];
  },
});

// Re-exported for tests / consumers that want to render the same list
// outside the editor (e.g. a docs page). Not used inside this file.
export const slashMenuItems: ReadonlyArray<SlashMenuItem> = SLASH_MENU_ITEMS;
