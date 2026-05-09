import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { MarkdownSerializerState } from '@tiptap/pm/markdown';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { MathInlineView } from './MathRenderer';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathInline: {
      /**
       * Insert an inline-math node at the current selection. Like the
       * block variant, an empty `formula` is fine — the node opens in
       * edit mode immediately.
       */
      insertMathInline: (attrs?: { formula?: string }) => ReturnType;
    };
  }
}

interface MathInlineAttributes {
  formula: string;
}

/**
 * Inline math node. Rendered via KaTeX `displayMode: false` for the
 * standard `$...$` Pandoc/Obsidian/GitHub inline-math syntax.
 *
 * Why a node instead of a mark?
 *   - A mark would carry the LaTeX as text inside the document, which
 *     interferes with normal typing (each keystroke is parsed by the
 *     surrounding inline rules).
 *   - An atomic inline node lets the formula stay opaque to ProseMirror
 *     while still flowing inside paragraphs. Editing happens through
 *     the React node view (`MathRenderer.tsx`).
 *
 * Markdown round-trip:
 *   - Serializer: emits `$<formula>$`. We don't escape `$` inside the
 *     formula because LaTeX itself doesn't use unescaped `$` mid-formula
 *     (and our parser would refuse to recognize it anyway).
 *   - Parser: a markdown-it inline rule scans for `$...$` with the
 *     standard "no whitespace adjacent to delimiter" heuristic borrowed
 *     from Pandoc. This avoids false positives on currency mentions
 *     like "$5 + $10 = $15".
 */
export const MathInlineExtension = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      formula: {
        default: '',
        parseHTML: (el): string => {
          const attr = el.getAttribute('data-formula');
          if (attr !== null) return attr;
          return (el.textContent ?? '').trim();
        },
        renderHTML: (attrs): Record<string, string> => ({
          'data-formula': String((attrs as MathInlineAttributes).formula ?? ''),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-math-inline]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const formula = String((node.attrs as MathInlineAttributes).formula ?? '');
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-math-inline': '',
        'data-formula': formula,
        class: 'ziba-math-inline',
      }),
      formula,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  },

  /**
   * Plain-text fallback for clipboard / external editors. Mirrors the
   * markdown form so a paste into a foreign tool still reads as math.
   */
  renderText({ node }): string {
    const formula = String((node.attrs as MathInlineAttributes).formula ?? '');
    return `$${formula}$`;
  },

  addCommands() {
    return {
      insertMathInline:
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

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode): void {
          const formula = String((node.attrs as MathInlineAttributes).formula ?? '');
          state.write(`$${formula}$`);
        },
        parse: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setup(md: any): void {
            if (md.zibaMathInlineRegistered === true) return;
            md.zibaMathInlineRegistered = true;

            // Insert before `escape` so a literal `\$` later in the
            // string still defers to the escape rule, but a normal `$`
            // delimiter is recognised first.
            md.inline.ruler.before(
              'escape',
              'ziba_math_inline',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (state: any, silent: boolean): boolean => {
                const closePos = scanInlineMath(state.src, state.pos);
                if (closePos === -1) return false;
                const formula = state.src.slice(state.pos + 1, closePos);
                if (!silent) {
                  const token = state.push('ziba_math_inline', 'span', 0);
                  token.markup = '$';
                  token.content = formula;
                  token.meta = { formula };
                }
                state.pos = closePos + 1;
                return true;
              },
            );

            // Renderer for the token we emitted. We mirror the Wikilink
            // pattern: convert to an HTML span with the formula stored
            // both as a `data-formula` attribute (canonical) and as the
            // visible text content (fallback if styling fails to apply).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            md.renderer.rules.ziba_math_inline = (tokens: any[], idx: number): string => {
              const meta: { formula: string } = tokens[idx].meta ?? { formula: '' };
              const formula = meta.formula;
              return (
                `<span data-math-inline data-formula="${escapeAttr(formula)}">` +
                `${escapeHtml(formula)}</span>`
              );
            };
          },
        },
      },
    };
  },
});

/**
 * Scan for an inline-math formula starting at `start` in `src`. Returns
 * the index of the closing `$`, or -1 if no valid formula is recognised
 * at that position.
 *
 * The recognition uses a Pandoc-style heuristic to avoid currency
 * false positives. Two cases motivate the symmetry:
 *   - `Pago $5+$10 totale` — caught by the close-side rule (closer
 *     followed by ` ` + then digit context, etc.).
 *   - `5$x$` — caught only by the open-side prev-digit guard;
 *     without it the closer rule would let this open as math because
 *     the closer in isolation looks fine.
 *
 *   1. opener: char before `$` must not be a backslash (escape) or
 *      ASCII digit (mirror of the close-side guard);
 *   2. opener: char after `$` must exist and must not be whitespace;
 *   3. opener: a second `$` immediately after is the block fence
 *      (`$$`), handled elsewhere — abort here so MathBlock wins;
 *   4. body: newlines abort, `\X` skips both chars (so `\$` and `\\`
 *      stay in the formula), `$$` mid-formula aborts;
 *   5. closer: char before `$` must not be whitespace, and char after
 *      `$` must not be an ASCII digit.
 *
 * Exported for unit testing — the markdown-it rule is a thin wrapper.
 */
export function scanInlineMath(src: string, start: number): number {
  if (src.charCodeAt(start) !== 0x24 /* $ */) return -1;

  const prev = start > 0 ? src.charCodeAt(start - 1) : -1;
  if (prev === 0x5c /* backslash */) return -1;
  if (isAsciiDigit(prev)) return -1;

  if (src.charCodeAt(start + 1) === 0x24 /* $ */) return -1;

  const afterOpen = src.charCodeAt(start + 1);
  if (afterOpen === undefined) return -1;
  if (isWhitespace(afterOpen)) return -1;

  let pos = start + 1;
  while (pos < src.length) {
    const c = src.charCodeAt(pos);
    if (c === 0x0a /* \n */) return -1;
    if (c === 0x5c /* backslash */) {
      pos += 2;
      continue;
    }
    if (c === 0x24 /* $ */) {
      if (src.charCodeAt(pos + 1) === 0x24) return -1;
      const beforeClose = src.charCodeAt(pos - 1);
      if (!isWhitespace(beforeClose)) {
        const afterClose = src.charCodeAt(pos + 1);
        if (!isAsciiDigit(afterClose)) return pos;
      }
    }
    pos += 1;
  }
  return -1;
}

function isWhitespace(charCode: number): boolean {
  // Standard ASCII whitespace plus undefined (end-of-string).
  if (charCode === undefined) return true;
  return (
    charCode === 0x20 || // space
    charCode === 0x09 || // tab
    charCode === 0x0a || // \n
    charCode === 0x0d || // \r
    charCode === 0x0c || // form feed
    charCode === 0x0b // vertical tab
  );
}

function isAsciiDigit(charCode: number | undefined): boolean {
  if (charCode === undefined) return false;
  return charCode >= 0x30 && charCode <= 0x39;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
