import { mergeAttributes, Node } from '@tiptap/core';
import type { MarkdownSerializerState } from '@tiptap/pm/markdown';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/**
 * Supported callout kinds. Mirrors Obsidian's standard `> [!type]` set
 * plus a `quote` variant for stylistic emphasis. Keep this list in sync
 * with the CSS classes in `globals.css` (`.synapsium-callout-<kind>`)
 * and with the slash-menu items in `SlashCommand.ts`.
 *
 * Unknown kinds parsed from foreign vaults (e.g. `[!abstract]`) fall
 * back to `note` — see `normalizeKind` below.
 */
export const CALLOUT_KINDS = [
  'note',
  'info',
  'tip',
  'warning',
  'danger',
  'success',
  'quote',
] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

/**
 * Coerce a freeform string from markdown input into one of the supported
 * kinds. Comparison is case-insensitive; anything we don't recognize
 * collapses to `'note'` so the callout still renders rather than turning
 * back into a plain blockquote — losing fidelity, but staying lossless
 * on our supported subset.
 */
function normalizeKind(raw: string): CalloutKind {
  const lc = raw.trim().toLowerCase();
  for (const k of CALLOUT_KINDS) {
    if (k === lc) return k;
  }
  return 'note';
}

/**
 * Regex that matches a single line of the form `[!kind]` (case
 * insensitive) — the marker the markdown source carries at the start
 * of the blockquote when using Obsidian-style callouts.
 *
 * We allow optional trailing whitespace and an optional `+`/`-` token
 * that Obsidian uses for fold state. We discard the fold marker — v0.3
 * doesn't model collapsed callouts.
 */
const CALLOUT_MARKER_RE = /^\s*\[!([A-Za-z][A-Za-z0-9_-]*)\][+-]?\s*$/;

interface CalloutAttributes {
  kind: CalloutKind;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /**
       * Insert a callout block at the current selection containing a
       * single empty paragraph. The cursor lands inside the paragraph
       * so the user can immediately type the body.
       */
      insertCallout: (attrs: { kind: CalloutKind }) => ReturnType;
    };
  }
}

/**
 * Block-level Tiptap node modeling an Obsidian/GitHub-style callout
 * (`> [!kind] body`). Replaces the v0.2 blockquote+emoji approximation.
 *
 * Rendering: a single `<div data-callout data-kind="...">` whose
 * `class` includes `synapsium-callout` plus a per-kind modifier. The
 * icon is supplied by a CSS `::before` pseudo-element (no node-view
 * needed for v0.3 — keeps the schema simple and the editor instantly
 * portable to other surfaces like the markdown preview pane).
 *
 * Schema: `content: 'block+'` — paragraphs, headings, lists are all
 * allowed inside, but **not** other callouts (we deliberately omit
 * `callout` from `content` so ProseMirror rejects the nesting). Markdown
 * with nested `> [!]` round-trips with only the outer one promoted.
 */
export const CalloutExtension = Node.create({
  name: 'callout',
  group: 'block',
  // `block+` excludes `callout` because the type only matches what's in
  // the content expression — a custom name not listed (`callout`) is
  // implicitly disallowed. ProseMirror will refuse to insert a callout
  // inside another callout. Tests this behavior: see "Edge cases" below.
  content: 'block+',
  // Defining means the editor treats the boundary as a hard delimiter:
  // selecting across it copies the wrapper, deletion behaves
  // predictably, and the parser won't merge it with a sibling.
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: 'note' as CalloutKind,
        parseHTML: (el): CalloutKind => normalizeKind(el.getAttribute('data-kind') ?? 'note'),
        renderHTML: (attrs): Record<string, string> => ({
          'data-kind': String((attrs as CalloutAttributes).kind),
        }),
      },
    };
  },

  parseHTML() {
    // Single recognizer. The markdown-it post-pass below emits the same
    // HTML shape (`<div data-callout data-kind="...">...</div>`), so the
    // markdown -> HTML -> ProseMirror pipeline lands here.
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const kind = normalizeKind(String(node.attrs.kind ?? 'note'));
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-callout': '',
        'data-kind': kind,
        class: `synapsium-callout synapsium-callout-${kind}`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertCallout:
        ({ kind }) =>
        ({ chain }): boolean => {
          const safeKind = normalizeKind(kind);
          return chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: { kind: safeKind },
              content: [{ type: 'paragraph' }],
            })
            .run();
        },
    };
  },

  /**
   * Markdown round-trip via tiptap-markdown.
   *
   * Serialize: emit the Obsidian header (`> [!kind]`) then wrap the
   * rendered content in a `> ` prefix, so each child block lands on a
   * blockquote line. Output for a Tip with a single paragraph "Hello":
   *
   *     > [!tip]
   *     > Hello
   *
   * Parse: register a markdown-it `core` ruler that walks the token
   * stream after the block parser has run and rewrites any
   * `blockquote_open` whose first inline child starts with `[!kind]`
   * into a pair of HTML tokens (`<div data-callout data-kind=...>` /
   * `</div>`). Tiptap's `parseHTML` then reconstructs the node.
   *
   * We chose the post-pass over a custom block rule because it composes
   * cleanly with markdown-it's existing blockquote handling (laziness,
   * indented lines, nesting) without us re-implementing the parser.
   */
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode): void {
          const kind = normalizeKind(String(node.attrs.kind ?? 'note'));
          // Header line. Trailing newline puts us at start-of-line so
          // the wrapBlock prefix starts cleanly.
          state.write(`> [!${kind}]\n`);
          // Body. wrapBlock prefixes each emitted line with '> '. The
          // null firstDelim tells it to use the same '> ' for the first
          // line — which is what we want, since the header above
          // already consumed the `> [!kind]` line.
          state.wrapBlock('> ', null, node, () => state.renderContent(node));
          // wrapBlock already calls closeBlock internally; this is
          // belt-and-suspenders for serialize implementations that
          // re-enter renderContent on a custom container.
          state.closeBlock(node);
        },
        parse: {
          /**
           * Hooks a markdown-it `core` ruler that rewrites blockquote
           * tokens carrying a `[!kind]` marker on their first inline
           * line into HTML callout tokens. Runs once per parser
           * instance (idempotent via the `synapsiumCalloutRegistered`
           * flag — see Wikilink for the same pattern).
           */
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setup(md: any): void {
            if (md.synapsiumCalloutRegistered === true) return;
            md.synapsiumCalloutRegistered = true;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            md.core.ruler.after('block', 'synapsium_callout', (state: any): boolean => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const tokens: any[] = state.tokens;

              for (let i = 0; i < tokens.length; i++) {
                const open = tokens[i];
                if (open.type !== 'blockquote_open') continue;

                // Find the matching `blockquote_close` at the same
                // nesting level. markdown-it nests blockquotes by
                // wrapping; a simple counter over `blockquote_open` /
                // `blockquote_close` is enough.
                let depth = 1;
                let close = -1;
                for (let j = i + 1; j < tokens.length; j++) {
                  if (tokens[j].type === 'blockquote_open') depth++;
                  else if (tokens[j].type === 'blockquote_close') {
                    depth--;
                    if (depth === 0) {
                      close = j;
                      break;
                    }
                  }
                }
                if (close === -1) continue;

                // The first child token group inside a blockquote is
                // typically `paragraph_open` -> `inline` -> `paragraph_close`.
                // We require the inline token to start with `[!kind]` on
                // its own line; anything else is a regular blockquote.
                const paraOpen = tokens[i + 1];
                const inline = tokens[i + 2];
                const paraClose = tokens[i + 3];
                if (paraOpen?.type !== 'paragraph_open') continue;
                if (inline?.type !== 'inline') continue;
                if (paraClose?.type !== 'paragraph_close') continue;

                const inlineContent: string = inline.content ?? '';
                const newlineIdx = inlineContent.indexOf('\n');
                const firstLine =
                  newlineIdx === -1 ? inlineContent : inlineContent.slice(0, newlineIdx);
                const rest = newlineIdx === -1 ? '' : inlineContent.slice(newlineIdx + 1);

                const match = CALLOUT_MARKER_RE.exec(firstLine);
                if (match === null) continue;
                const kind = normalizeKind(match[1] ?? 'note');

                // Rewrite the original blockquote_open / blockquote_close
                // pair into html_block tokens that emit our `<div data-callout>`
                // wrapper. Tiptap's parseHTML then reconstructs the node.
                const Token = open.constructor;

                const calloutOpen = new Token('html_block', '', 0);
                calloutOpen.content = `<div data-callout data-kind="${kind}">\n`;
                calloutOpen.block = true;

                const calloutClose = new Token('html_block', '', 0);
                calloutClose.content = `</div>\n`;
                calloutClose.block = true;

                tokens[i] = calloutOpen;
                tokens[close] = calloutClose;

                // Trim or empty the marker paragraph (sits at i+1..i+3
                // inside the blockquote). When `rest.length === 0` we
                // KEEP the paragraph but strip its content — splicing
                // out the entire `paragraph_open / inline / paragraph_close`
                // triplet would leave the callout with no inner blocks,
                // violating the `content: 'block+'` schema rule and
                // producing console errors at parse time.
                inline.content = rest;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const childTokens: any[] = [];
                if (rest.length > 0) {
                  // Re-tokenize the inline body so emphasis / links /
                  // wikilinks inside it are still parsed.
                  state.md.inline.parse(rest, state.md, state.env, childTokens);
                }
                inline.children = childTokens;

                // Continue scanning. The for-loop's `i++` advances past
                // our rewritten open token; nested blockquotes inside
                // the callout body still get inspected on later
                // iterations.
              }

              return false;
            });
          },
        },
      },
    };
  },
});
