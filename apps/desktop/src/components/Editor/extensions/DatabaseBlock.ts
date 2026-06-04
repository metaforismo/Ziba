import { mergeAttributes, Node } from '@tiptap/core';
import type { MarkdownSerializerState } from '@tiptap/pm/markdown';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { DatabaseBlockNodeView } from './DatabaseBlockNodeView';

const DATABASE_BLOCK_RE = /^<div\s+data-ziba-db=(?:"([^"]+)"|'([^']+)')\s*><\/div>$/i;

type DatabaseBlockAttributes = {
  viewId: string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    databaseBlock: {
      /** Insert a saved database view as an inline block inside the note body. */
      insertDatabaseBlock: (attrs: { viewId: string }) => ReturnType;
    };
  }
}

function markerViewId(content: string): string | null {
  const match = DATABASE_BLOCK_RE.exec(content.trim());
  if (match === null) return null;
  const viewId = (match[1] ?? match[2] ?? '').trim();
  return viewId.length === 0 ? null : viewId;
}

export const DatabaseBlockExtension = Node.create({
  name: 'databaseBlock',
  group: 'block',
  atom: true,
  selectable: true,
  defining: true,
  content: '',
  draggable: false,

  addAttributes() {
    return {
      viewId: {
        default: '',
        parseHTML: (el): string => el.getAttribute('data-ziba-db') ?? '',
        renderHTML: (attrs): Record<string, string> => ({
          'data-ziba-db': String((attrs as DatabaseBlockAttributes).viewId ?? ''),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-ziba-db]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const viewId = String((node.attrs as DatabaseBlockAttributes).viewId ?? '');
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-ziba-db': viewId,
        class: 'ziba-database-block',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DatabaseBlockNodeView);
  },

  addCommands() {
    return {
      insertDatabaseBlock:
        ({ viewId }) =>
        ({ chain }): boolean => {
          const normalized = viewId.trim();
          if (normalized.length === 0) return false;
          return chain()
            .focus()
            .insertContent({ type: this.name, attrs: { viewId: normalized } })
            .run();
        },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode): void {
          const viewId = String((node.attrs as DatabaseBlockAttributes).viewId ?? '');
          state.write(`<div data-ziba-db="${escapeAttr(viewId)}"></div>\n`);
          state.closeBlock(node);
        },
        parse: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setup(md: any): void {
            if (md.zibaDatabaseBlockRegistered === true) return;
            md.zibaDatabaseBlockRegistered = true;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            md.core.ruler.after('block', 'ziba_database_block', (state: any): boolean => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const tokens: any[] = state.tokens;

              for (let i = tokens.length - 1; i >= 0; i--) {
                const token = tokens[i];
                if (token?.type === 'html_block') {
                  const viewId = markerViewId(String(token.content ?? ''));
                  if (viewId === null) continue;
                  token.content = `<div data-ziba-db="${escapeAttr(viewId)}"></div>\n`;
                  token.block = true;
                  continue;
                }

                if (i > tokens.length - 3) continue;
                const open = tokens[i];
                const inline = tokens[i + 1];
                const close = tokens[i + 2];

                if (open?.type !== 'paragraph_open') continue;
                if (inline?.type !== 'inline') continue;
                if (close?.type !== 'paragraph_close') continue;

                const viewId = markerViewId(String(inline.content ?? ''));
                if (viewId === null) continue;

                const Token = open.constructor;
                const htmlToken = new Token('html_block', '', 0);
                htmlToken.content = `<div data-ziba-db="${escapeAttr(viewId)}"></div>\n`;
                htmlToken.block = true;
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

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
