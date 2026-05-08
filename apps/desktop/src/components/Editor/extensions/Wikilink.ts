import { mergeAttributes, Node, nodeInputRule } from '@tiptap/core';
import type { MarkdownSerializerState } from '@tiptap/pm/markdown';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/**
 * `WikilinkResolutionMap` lives in `editor.storage.wikilink.resolved` and
 * maps a target string (the inner text between `[[` and `]]`, no alias) to
 * `true` if the title resolves to an existing note, `false` if it's broken.
 *
 * The map is populated by the React layer (`useResolvedWikilinks`) which
 * batch-calls `ipc.resolveTitle` and writes back here. The decoration logic
 * doesn't need it — `renderHTML` reads from storage at render time and the
 * DOM is updated by Tiptap on every `update()` cycle.
 */
export type WikilinkResolutionMap = Map<string, boolean>;

export interface WikilinkOptions {
  /**
   * Extra HTML attributes to merge into the rendered <span>. Useful for
   * tests (e.g. `data-testid`).
   */
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikilink: {
      /**
       * Insert a wikilink node at the current selection. If `range` is
       * provided, the range is replaced (used by suggestion selection).
       */
      insertWikilink: (attrs: {
        target: string;
        alias?: string | null;
        range?: { from: number; to: number };
      }) => ReturnType;
    };
  }
}

/**
 * Inline atom node representing a `[[Target]]` or `[[Target|Alias]]` token.
 *
 * Design notes:
 *   - `atom: true` so the cursor can't enter the node — backspace deletes
 *     the whole thing in one keystroke (Tiptap's default for atoms).
 *   - `selectable: true` so the user gets a clear visual when the cursor
 *     is adjacent and arrow-keys land on it.
 *   - Markdown round-trips via `addStorage().markdown` (read by
 *     `tiptap-markdown`'s serializer) and a markdown-it inline rule on the
 *     parser side — both registered in this extension so the node is the
 *     single source of truth for wikilink syntax.
 */
export const Wikilink = Node.create<WikilinkOptions>({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      target: {
        default: '',
        parseHTML: (el): string => el.getAttribute('data-target') ?? '',
        renderHTML: (attrs): Record<string, string> => ({
          'data-target': String(attrs.target ?? ''),
        }),
      },
      alias: {
        default: null,
        parseHTML: (el): string | null => el.getAttribute('data-alias'),
        renderHTML: (attrs): Record<string, string> => {
          if (attrs.alias === null || attrs.alias === undefined || attrs.alias === '') {
            return {};
          }
          return { 'data-alias': String(attrs.alias) };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const target = String(node.attrs.target ?? '');
    const alias =
      node.attrs.alias !== null && node.attrs.alias !== undefined ? String(node.attrs.alias) : '';
    const display = alias.length > 0 ? alias : target;

    // Storage may not be populated yet on first render. Treat unknown as
    // "valid" (optimistic) so we don't flash red while resolution is in
    // flight; `useResolvedWikilinks` will repaint shortly after.
    const resolvedMap = this.storage?.resolved as WikilinkResolutionMap | undefined;
    const isResolved = resolvedMap === undefined ? true : resolvedMap.get(target) !== false;

    const baseClass = 'synapsium-wikilink';
    const stateClass = isResolved ? 'synapsium-wikilink--resolved' : 'synapsium-wikilink--broken';

    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-wikilink': '',
        'data-target': target,
        class: `${baseClass} ${stateClass}`,
        // Allow the click handler in <Editor /> to find the node attribute
        // without inspecting the ProseMirror state. Also useful for
        // copy-paste fallback: the inner text round-trips as the alias.
      }),
      display,
    ];
  },

  /**
   * Plain-text representation. Used by ProseMirror when the user copies a
   * selection or when a serializer falls back to text. Mirrors the markdown
   * form so plain-text paste into another editor still looks right.
   */
  renderText({ node }): string {
    const target = String(node.attrs.target ?? '');
    const alias =
      node.attrs.alias !== null && node.attrs.alias !== undefined ? String(node.attrs.alias) : '';
    return alias.length > 0 ? `[[${target}|${alias}]]` : `[[${target}]]`;
  },

  addStorage() {
    const resolved: WikilinkResolutionMap = new Map();
    return {
      resolved,
      // Hook consumed by tiptap-markdown's MarkdownSerializer (see
      // packages/tiptap-markdown/src/util/extensions.js: getMarkdownSpec).
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode): void {
          const target = String(node.attrs.target ?? '');
          const aliasAttr = node.attrs.alias;
          const alias = aliasAttr !== null && aliasAttr !== undefined ? String(aliasAttr) : '';
          state.write(alias.length > 0 ? `[[${target}|${alias}]]` : `[[${target}]]`);
        },
        parse: {
          /**
           * Register a markdown-it inline rule that turns `[[Target]]` and
           * `[[Target|Alias]]` into a `wikilink_open` token rendered as
           * `<span data-wikilink data-target="...">display</span>`. Tiptap's
           * `parseHTML` (above) then reconstructs the node.
           */
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setup(md: any): void {
            // Avoid re-registering on each parse() call.
            if (md.synapsiumWikilinkRegistered === true) return;
            md.synapsiumWikilinkRegistered = true;

            md.inline.ruler.before(
              'emphasis',
              'wikilink',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (state: any, silent: boolean): boolean => {
                const start = state.pos;
                const src: string = state.src;
                if (src.charCodeAt(start) !== 0x5b /* [ */) return false;
                if (src.charCodeAt(start + 1) !== 0x5b /* [ */) return false;

                // Look for the matching `]]`. A wikilink can't span lines or
                // contain `[` / `]`. This keeps the rule local — a stray `[[`
                // without a closing `]]` remains literal text.
                let pos = start + 2;
                let found = -1;
                while (pos < src.length - 1) {
                  const c = src.charCodeAt(pos);
                  if (c === 0x0a /* \n */) return false;
                  if (c === 0x5b /* [ */) return false;
                  if (c === 0x5d /* ] */ && src.charCodeAt(pos + 1) === 0x5d) {
                    found = pos;
                    break;
                  }
                  pos += 1;
                }
                if (found === -1) return false;

                const inner = src.slice(start + 2, found);
                if (inner.length === 0) return false;
                if (inner.includes('\n')) return false;

                // Split target|alias.
                const pipeIdx = inner.indexOf('|');
                const target = pipeIdx === -1 ? inner.trim() : inner.slice(0, pipeIdx).trim();
                const alias = pipeIdx === -1 ? '' : inner.slice(pipeIdx + 1).trim();
                if (target.length === 0) return false;

                if (!silent) {
                  const token = state.push('wikilink', 'span', 0);
                  token.markup = '[[';
                  token.content = inner;
                  token.meta = { target, alias };
                }

                state.pos = found + 2;
                return true;
              },
            );

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            md.renderer.rules.wikilink = (tokens: any[], idx: number): string => {
              const t = tokens[idx];
              const meta: { target: string; alias: string } = t.meta ?? {
                target: '',
                alias: '',
              };
              const target = escapeHtml(meta.target);
              const display = escapeHtml(meta.alias.length > 0 ? meta.alias : meta.target);
              const aliasAttr =
                meta.alias.length > 0 ? ` data-alias="${escapeHtml(meta.alias)}"` : '';
              return `<span data-wikilink data-target="${target}"${aliasAttr}>${display}</span>`;
            };
          },
        },
      },
    };
  },

  addCommands() {
    return {
      insertWikilink:
        ({ target, alias, range }) =>
        ({ chain }): boolean => {
          const attrs: { target: string; alias?: string | null } = { target };
          if (alias !== undefined && alias !== null && alias !== '') {
            attrs.alias = alias;
          }
          if (range !== undefined) {
            return chain()
              .focus()
              .insertContentAt(range, [
                { type: this.name, attrs },
                { type: 'text', text: ' ' },
              ])
              .run();
          }
          return chain()
            .focus()
            .insertContent([{ type: this.name, attrs }])
            .run();
        },
    };
  },

  /**
   * Convert raw `[[Title]]` typed inline into a wikilink node when the
   * second `]]` is closed. The regex requires the closing `]]` so the rule
   * only fires once the user has fully typed the link — this keeps the
   * suggestion popup as the primary entry point and the input rule as a
   * fallback for users who type the syntax directly or paste markdown
   * fragments.
   */
  addInputRules() {
    return [
      nodeInputRule({
        find: /\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]$/,
        type: this.type,
        getAttributes: (match): { target: string; alias: string | null } => {
          const target = (match[1] ?? '').trim();
          const aliasRaw = match[2];
          const alias =
            aliasRaw !== undefined && aliasRaw.trim().length > 0 ? aliasRaw.trim() : null;
          return { target, alias };
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Atoms already absorb backspace at their boundary, but we make the
      // contract explicit: pressing backspace immediately after a wikilink
      // deletes the whole node. Returning `false` lets the default handler
      // run when the cursor isn't adjacent to a wikilink.
      Backspace: (): boolean => {
        const { selection } = this.editor.state;
        if (!selection.empty) return false;
        const { $from } = selection;
        const before = $from.nodeBefore;
        if (before?.type.name === this.name) {
          return this.editor.commands.deleteRange({
            from: $from.pos - before.nodeSize,
            to: $from.pos,
          });
        }
        return false;
      },
    };
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
