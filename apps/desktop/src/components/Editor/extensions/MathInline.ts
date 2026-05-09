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
        class: 'synapsium-math-inline',
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
            if (md.synapsiumMathInlineRegistered === true) return;
            md.synapsiumMathInlineRegistered = true;

            // Insert before `escape` so a literal `\$` later in the
            // string still defers to the escape rule, but a normal `$`
            // delimiter is recognised first.
            md.inline.ruler.before(
              'escape',
              'synapsium_math_inline',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (state: any, silent: boolean): boolean => {
                const start = state.pos;
                const src: string = state.src;
                if (src.charCodeAt(start) !== 0x24 /* $ */) return false;

                // A literal `\$` is an escape, not a delimiter. We rely
                // on markdown-it's `escape` rule to handle that case
                // because we run *before* escape — a backslash-prefixed
                // `$` reaches us only when there's no preceding char,
                // which we guard below by reading `prev`.
                const prev = start > 0 ? src.charCodeAt(start - 1) : -1;
                if (prev === 0x5c /* backslash */) return false;

                // Refuse a `$$` opening — that's the block-math fence,
                // handled by MathBlock. Falling through here lets the
                // block parser take precedence.
                if (src.charCodeAt(start + 1) === 0x24 /* $ */) return false;

                // Look for the closing `$`. The Pandoc heuristic to
                // avoid currency false positives:
                //   - the char immediately after the opening `$` must
                //     not be whitespace,
                //   - the char immediately before the closing `$` must
                //     not be whitespace,
                //   - the closing `$` must not be followed by a digit
                //     (so "$5 + 10$" doesn't match — it'd need the
                //     opener to fail the "non-whitespace after" check
                //     anyway, but this is belt-and-suspenders),
                //   - newlines are not allowed inside.
                const afterOpen = src.charCodeAt(start + 1);
                if (afterOpen === undefined) return false;
                if (isWhitespace(afterOpen)) return false;

                let pos = start + 1;
                let closePos = -1;
                while (pos < src.length) {
                  const c = src.charCodeAt(pos);
                  if (c === 0x0a /* \n */) return false;
                  if (c === 0x5c /* backslash */) {
                    // Skip the escaped char (handles `\$` and `\\`).
                    pos += 2;
                    continue;
                  }
                  if (c === 0x24 /* $ */) {
                    // Reject `$$` mid-formula (Pandoc behaviour: it
                    // closes the inline math then re-opens — we treat
                    // that as a fail to keep things simple).
                    if (src.charCodeAt(pos + 1) === 0x24) return false;
                    // Closing-delimiter eligibility: previous char must
                    // be non-whitespace.
                    const beforeClose = src.charCodeAt(pos - 1);
                    if (!isWhitespace(beforeClose)) {
                      // Final guard: don't close if the next char is a
                      // digit (currency-like context: `$5 + $10$`).
                      const afterClose = src.charCodeAt(pos + 1);
                      if (!isAsciiDigit(afterClose)) {
                        closePos = pos;
                        break;
                      }
                    }
                  }
                  pos += 1;
                }
                if (closePos === -1) return false;

                const formula = src.slice(start + 1, closePos);
                if (formula.length === 0) return false;

                if (!silent) {
                  const token = state.push('synapsium_math_inline', 'span', 0);
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
            md.renderer.rules.synapsium_math_inline = (tokens: any[], idx: number): string => {
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
