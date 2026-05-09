import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { MarkdownSerializerState } from '@tiptap/pm/markdown';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { MathBlockView } from './MathRenderer';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathBlock: {
      /**
       * Insert a display-math block at the current selection. If
       * `formula` is omitted the block opens in edit mode with an
       * empty formula so the user can type it directly — that's the
       * usual entry point from the slash menu.
       */
      insertMathBlock: (attrs?: { formula?: string }) => ReturnType;
    };
  }
}

interface MathBlockAttributes {
  formula: string;
}

/**
 * Block-level math node. Rendered via KaTeX `displayMode: true` —
 * the standard `$$...$$` Pandoc/Obsidian/GitHub block-math syntax.
 *
 * Schema notes:
 *   - `atom: true` because the formula is a single opaque string;
 *     ProseMirror doesn't need to descend into the LaTeX. Editing
 *     happens out-of-band through a React node view (`MathRenderer.tsx`).
 *   - `selectable: true` so arrow keys can land on the node and
 *     `delete`/`backspace` can remove it cleanly.
 *   - `defining: true` so paste doesn't merge it with an adjacent
 *     paragraph — important when round-tripping `$$..$$` from another
 *     editor.
 *
 * Markdown round-trip:
 *   - Serializer: emits `$$\n<formula>\n$$\n` so the result is valid
 *     CommonMark + Obsidian/GFM math-block syntax. The leading and
 *     trailing newlines guarantee block-level recognition on parse.
 *   - Parser: a markdown-it block rule scans for `$$` at the start of
 *     a line, captures everything up to the next `$$` on its own line,
 *     and emits a single `html_block` token of the shape
 *     `<div data-math-block data-formula="...">…</div>`. Tiptap's
 *     `parseHTML` reconstructs the node from that.
 */
export const MathBlockExtension = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  defining: true,
  // No `content` — the formula lives entirely in the `formula`
  // attribute. We don't pretend it's editable rich-text inside the
  // ProseMirror tree.

  addAttributes() {
    return {
      formula: {
        default: '',
        parseHTML: (el): string => {
          // Two sources to handle:
          //   1. Round-trip from our markdown parser, which emits
          //      `<div data-math-block data-formula="...">…</div>`.
          //      The `data-formula` attribute is the source of truth.
          //   2. Paste from foreign HTML where the formula sits as
          //      text inside the div. Fall back to `textContent` so
          //      hand-authored markup still works.
          const attr = el.getAttribute('data-formula');
          if (attr !== null) return attr;
          return (el.textContent ?? '').trim();
        },
        renderHTML: (attrs): Record<string, string> => ({
          'data-formula': String((attrs as MathBlockAttributes).formula ?? ''),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-math-block]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    // The static HTML rendering (used by initial parse and headless
    // serialization). The React node view replaces this DOM at runtime;
    // the static form only matters when the editor isn't mounted, e.g.
    // for SSR or copy-paste fallback. We include the formula as text
    // content so a no-JS recipient can still see the LaTeX source.
    const formula = String((node.attrs as MathBlockAttributes).formula ?? '');
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-math-block': '',
        'data-formula': formula,
        class: 'synapsium-math-block',
      }),
      formula,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },

  addCommands() {
    return {
      insertMathBlock:
        (attrs) =>
        ({ chain }): boolean => {
          const formula = attrs?.formula ?? '';
          return chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: { formula },
            })
            .run();
        },
    };
  },

  /**
   * Markdown round-trip via tiptap-markdown.
   *
   * The block-math fence is dollar-delimited, *not* a CommonMark fenced
   * code block, so we register a markdown-it block rule rather than
   * piggy-backing on `fence`/`code_block`. Following the Wikilink/
   * Callout precedent, the rule is idempotent (guarded by a flag on
   * the markdown-it instance).
   */
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode): void {
          const formula = String((node.attrs as MathBlockAttributes).formula ?? '');
          // Trim trailing whitespace so we don't accumulate blank lines
          // on every save. Leading whitespace inside the formula is
          // preserved (could be intentional indentation in matrices).
          const trimmed = formula.replace(/\s+$/, '');
          state.write('$$\n');
          state.write(trimmed);
          // Ensure the closing `$$` lands on its own line.
          if (!trimmed.endsWith('\n')) state.write('\n');
          state.write('$$');
          state.closeBlock(node);
        },
        parse: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setup(md: any): void {
            if (md.synapsiumMathBlockRegistered === true) return;
            md.synapsiumMathBlockRegistered = true;

            // Register before `fence` so a `$$` opening at the very
            // start of a line wins over any other block rule.
            md.block.ruler.before(
              'fence',
              'synapsium_math_block',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (state: any, startLine: number, endLine: number, silent: boolean): boolean => {
                // Guard: bail if the line doesn't start with `$$` (the
                // ruler is run on every block; cheap reject is critical).
                const startPos = state.bMarks[startLine] + state.tShift[startLine];
                const maxPos = state.eMarks[startLine];
                const line = state.src.slice(startPos, maxPos);
                if (!line.startsWith('$$')) return false;

                // Two valid shapes for the opening line:
                //   `$$`            (formula starts on the next line)
                //   `$$<formula>$$` (single-line block) — we accept this
                //                    too because GitHub renders it.
                // Anything else after `$$` on the opening line is not
                // a math block (could be `$$x` with an unmatched `$$`,
                // which we leave for the inline parser to reject).
                const openTail = line.slice(2);

                if (openTail.includes('$$')) {
                  // Single-line form. Find the closing `$$`.
                  const closeIdx = openTail.lastIndexOf('$$');
                  if (closeIdx <= 0) return false;
                  const formula = openTail.slice(0, closeIdx).trim();
                  if (formula.length === 0) return false;
                  if (silent) return true;

                  const token = state.push('html_block', '', 0);
                  token.content =
                    `<div data-math-block data-formula="${escapeAttr(formula)}">` +
                    `${escapeHtml(formula)}</div>\n`;
                  token.block = true;
                  token.map = [startLine, startLine + 1];
                  state.line = startLine + 1;
                  return true;
                }

                if (openTail.trim().length > 0) {
                  // Junk after `$$` on the opening line (e.g. `$$ x`).
                  // Treat as not-a-math-block; the inline `$..$` parser
                  // can decide whether to recognize anything inside.
                  return false;
                }

                // Multi-line form: scan forward for the closing `$$`
                // on its own line. Honor the silent-mode contract.
                let nextLine = startLine + 1;
                let closeLine = -1;
                while (nextLine < endLine) {
                  const lp = state.bMarks[nextLine] + state.tShift[nextLine];
                  const mp = state.eMarks[nextLine];
                  const candidate = state.src.slice(lp, mp);
                  if (candidate.trim() === '$$') {
                    closeLine = nextLine;
                    break;
                  }
                  nextLine += 1;
                }
                if (closeLine === -1) return false;
                if (silent) return true;

                // Slice the formula content out of the source between
                // the opening and closing fences. We use the raw source
                // (not state.getLines) because matrices and aligned
                // environments rely on whitespace being preserved
                // verbatim; getLines normalizes leading whitespace.
                const formulaStart = state.bMarks[startLine + 1] ?? 0;
                const formulaEnd = state.bMarks[closeLine] ?? state.src.length;
                const formula = state.src.slice(formulaStart, formulaEnd).replace(/\n+$/, '');

                const token = state.push('html_block', '', 0);
                token.content =
                  `<div data-math-block data-formula="${escapeAttr(formula)}">` +
                  `${escapeHtml(formula)}</div>\n`;
                token.block = true;
                token.map = [startLine, closeLine + 1];
                state.line = closeLine + 1;
                return true;
              },
            );
          },
        },
      },
    };
  },
});

/**
 * HTML-escape for attribute context (double quotes need encoding;
 * `<` and `&` too). Used for the `data-formula` attribute we emit
 * from the markdown-it rule.
 */
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '&#10;');
}

/** HTML-escape for text-content context. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
