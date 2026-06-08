import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const PLUGIN_KEY = new PluginKey('ziba-placeholder');

export type PlaceholderOptions = {
  /** Text shown on the empty first paragraph of an otherwise empty doc. */
  text: string;
};

/**
 * SiYuan-/Notion-style empty-doc placeholder. We render it as a
 * ProseMirror decoration (a `data-placeholder` attribute + a `::before`
 * pseudo in CSS) rather than pulling in `@tiptap/extension-placeholder`,
 * mirroring the decoration-over-dependency choice already made for
 * `TagMark`. The markdown round-trip is untouched — the placeholder is
 * paint-only and never appears in the serialized document.
 *
 * Shown only when the document is a single empty paragraph (i.e. the
 * note has no body yet). Typing anything removes it; it does not show on
 * other empty paragraphs mid-document, which would be noisy.
 */
export const PlaceholderExtension = Extension.create<PlaceholderOptions>({
  name: 'zibaPlaceholder',

  addOptions() {
    return {
      text: 'Scrivi, o premi / per i comandi',
    };
  },

  addProseMirrorPlugins() {
    const { text } = this.options;
    return [
      new Plugin({
        key: PLUGIN_KEY,
        props: {
          decorations(state): DecorationSet | null {
            const { doc } = state;
            // Only decorate a pristine doc: exactly one top-level child,
            // a paragraph, with no content. This is the "blank note"
            // state — not every empty paragraph the user creates later.
            if (doc.childCount !== 1) return null;
            const first = doc.firstChild;
            if (first === null) return null;
            if (first.type.name !== 'paragraph' || first.childCount !== 0) return null;

            const decoration = Decoration.node(0, first.nodeSize, {
              class: 'ziba-placeholder',
              'data-placeholder': text,
            });
            return DecorationSet.create(doc, [decoration]);
          },
        },
      }),
    ];
  },
});
