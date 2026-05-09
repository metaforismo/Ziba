import { mergeAttributes, Node } from '@tiptap/core';
import type { MarkdownSerializerState } from '@tiptap/pm/markdown';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { EmbedNodeView } from './EmbedNodeView';

/**
 * Regex matching a stand-alone embed marker on its own line, e.g.
 * `![[Note Title]]` or `![[Note Title#section]]`.
 *
 * For v0.4 we accept the optional `#heading` suffix on the source side
 * but DROP it during parse - the embed always renders the whole note.
 * Keeping the heading in the source means a roundtrip preserves the
 * original character sequence: serialize emits `![[target]]` (without
 * heading), so users who hand-edit a heading ref will lose it on first
 * roundtrip. Documented limitation; tracked for v0.5.
 */
const EMBED_LINE_RE = /^!\[\[([^[\]\n]+?)\]\]$/;

interface EmbedAttributes {
  target: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embed: {
      /**
       * Insert an embed block at the current selection. The `target`
       * is the wikilink-style identifier - typically a note title, but
       * may also be a relative path. Resolution happens lazily inside
       * the React node view via `ipc.resolveTitle`.
       */
      insertEmbed: (attrs: { target: string }) => ReturnType;
    };
  }
}

/**
 * Block-level atom node modeling an Obsidian-style transclusion
 * (`![[Note Title]]`). Renders the target note's content inline as a
 * read-only preview pane.
 *
 * Schema notes:
 *   - `atom: true` - no inner ProseMirror content. The preview body is
 *     produced entirely by the React node view from the loaded
 *     markdown; ProseMirror sees an opaque block.
 *   - `content: ''` - explicit empty content expression to make the
 *     atom intent unambiguous to the schema validator.
 *   - `selectable: true` - clicking the embed selects the node (so
 *     Backspace removes it as a unit).
 *   - `defining: true` - the node is its own paste/copy unit; the
 *     embed never silently merges with surrounding paragraphs on
 *     paste.
 *
 * Markdown roundtrip:
 *   - Serialize: `![[target]]\n` followed by `closeBlock` so the next
 *     markdown construct starts on its own line.
 *   - Parse: a markdown-it `core` post-pass that detects a
 *     `paragraph_open / inline / paragraph_close` triplet whose inline
 *     content is exactly `![[Target]]` (trimmed) and rewrites it into
 *     a single `<div data-embed data-target="...">` html_block. Tiptap's
 *     `parseHTML` then reconstructs the node.
 */
export const EmbedExtension = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  selectable: true,
  defining: true,
  // Empty content expression. Tiptap's defaults treat `atom: true` as
  // empty already, but being explicit keeps the schema reviewable and
  // prevents a future tweak to `atom` from accidentally allowing inner
  // blocks without a deliberate edit.
  content: '',
  draggable: false,

  addAttributes() {
    return {
      target: {
        default: '',
        parseHTML: (el): string => el.getAttribute('data-target') ?? '',
        renderHTML: (attrs): Record<string, string> => ({
          'data-target': String((attrs as EmbedAttributes).target ?? ''),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-embed]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const target = String(node.attrs.target ?? '');
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-embed': '',
        'data-target': target,
        class: 'ziba-embed',
      }),
    ];
  },

  /**
   * React-backed node view. We use a node view (rather than a pure
   * `renderHTML`) because the body is dynamic: the embed has to call
   * `ipc.resolveTitle` then `ipc.loadNote` to fetch the target's
   * content, and re-render when those promises resolve.
   *
   * The node view is registered as `ReactNodeViewRenderer(...)` so the
   * React tree managing the view shares the host renderer with the
   * outer Editor - Tiptap's `useEditor` hook expects this when the
   * editor uses React node views.
   */
  addNodeView() {
    return ReactNodeViewRenderer(EmbedNodeView);
  },

  addCommands() {
    return {
      insertEmbed:
        ({ target }) =>
        ({ chain }): boolean => {
          return chain().focus().insertContent({ type: this.name, attrs: { target } }).run();
        },
    };
  },

  /**
   * Markdown roundtrip via tiptap-markdown.
   *
   * Serialize: emit `![[target]]` followed by a newline + closeBlock so
   * the embed always sits on its own line. Multiple embeds in a row
   * each get their own line.
   *
   * Parse: a markdown-it `core` post-pass walks the token stream after
   * the block parser has run. For each `paragraph_open / inline /
   * paragraph_close` triplet whose inline content (trimmed) matches
   * `^!\[\[(.+?)\]\]$`, the triplet is rewritten into a single
   * `html_block` token containing `<div data-embed data-target="...">`
   * (no inner content - the node view fills the body at render time).
   * Tiptap's `parseHTML` selector then materializes the node.
   *
   * Why a post-pass rather than a custom block rule:
   *   1) markdown-it has already done the heavy lifting of paragraph
   *      tokenization. We only need to re-classify a specific shape.
   *   2) Composes cleanly with the wikilink/callout post-passes
   *      (`addStorage().markdown.parse.setup`) - they all run in the
   *      same `md.core.ruler` chain after `block`, in registration
   *      order; mutual independence is enforced by their distinct
   *      `ziba*Registered` guards.
   */
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode): void {
          const target = String(node.attrs.target ?? '');
          state.write(`![[${target}]]\n`);
          state.closeBlock(node);
        },
        parse: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setup(md: any): void {
            if (md.zibaEmbedRegistered === true) return;
            md.zibaEmbedRegistered = true;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            md.core.ruler.after('block', 'ziba_embed', (state: any): boolean => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const tokens: any[] = state.tokens;

              // Walk the token stream looking for paragraph triplets.
              // Iterate from the end so splices that change the array
              // length don't invalidate indices we still need to visit.
              for (let i = tokens.length - 3; i >= 0; i--) {
                const open = tokens[i];
                const inline = tokens[i + 1];
                const close = tokens[i + 2];

                if (open?.type !== 'paragraph_open') continue;
                if (inline?.type !== 'inline') continue;
                if (close?.type !== 'paragraph_close') continue;

                const content: string = (inline.content ?? '').trim();
                const match = EMBED_LINE_RE.exec(content);
                if (match === null) continue;

                // Strip optional `#heading` suffix on parse - v0.4
                // ignores headings and embeds the whole note. This
                // keeps the source readable (`![[Note#Foo]]` survives
                // unchanged in the file) but the runtime view always
                // shows the full note.
                const rawTarget = (match[1] ?? '').trim();
                const hashIdx = rawTarget.indexOf('#');
                const target = hashIdx === -1 ? rawTarget : rawTarget.slice(0, hashIdx).trim();
                if (target.length === 0) continue;

                // Build a single html_block token that emits the embed
                // wrapper. Tiptap's `parseHTML` ('div[data-embed]')
                // matches the resulting DOM and the node view takes
                // over for the body.
                const Token = open.constructor;
                const htmlToken = new Token('html_block', '', 0);
                // Quote the target attribute with `&quot;` escaping so
                // titles containing `"` (rare but legal in filesystems
                // that allow it on Linux/macOS) round-trip without
                // breaking the wrapper.
                htmlToken.content = `<div data-embed data-target="${escapeAttr(target)}"></div>\n`;
                htmlToken.block = true;

                // Replace the three-token triplet with the single html
                // token. `splice(i, 3, htmlToken)` keeps surrounding
                // tokens (other paragraphs, lists, etc.) untouched.
                tokens.splice(i, 3, htmlToken);
              }

              return false;
            });
          },
        },
      },
    };
  },
});

/**
 * Minimal HTML attribute escape. We can't reuse the wikilink helper
 * directly - it lives in another file and we want this extension to
 * stay self-contained. Covers the four characters that matter inside
 * a double-quoted attribute value.
 */
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
