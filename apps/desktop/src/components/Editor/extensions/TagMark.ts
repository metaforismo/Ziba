import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { useTagsStore } from '../../../stores/tags';

/**
 * `#tag` matcher mirroring the boundary semantics of
 * `packages/core/src/markdown/tags.ts`:
 *   - Tag chars: `[A-Za-z0-9_/-]`
 *   - Boundary: must NOT be preceded by `]`, `)`, `(`, `_`, or a word char.
 *     Anchors (`[link](#anchor)`), CSS hex colors (`#fff`), and `foo#bar`
 *     style references stay plain text.
 *   - Pure-numeric tags (`#1`, `#123`) are rejected.
 *
 * The regex captures the tag name; the boundary is enforced by surrounding
 * code so the same pattern reuses the lastIndex hint.
 */
const TAG_NAME_RE = /[A-Za-z0-9_/-]+/y;

const PLUGIN_KEY = new PluginKey('ziba-tag-decorations');

/** Returns true if the char at `i-1` is a valid left boundary for `#`. */
function isValidLeftBoundary(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text.charCodeAt(i - 1);
  // `]`, `)`, `(`, `_`
  if (prev === 0x5d || prev === 0x29 || prev === 0x28 || prev === 0x5f) return false;
  // word char ([A-Za-z0-9])
  if (
    (prev >= 0x30 && prev <= 0x39) ||
    (prev >= 0x41 && prev <= 0x5a) ||
    (prev >= 0x61 && prev <= 0x7a)
  ) {
    return false;
  }
  return true;
}

/**
 * Walk the doc and emit decoration ranges for every `#tag` token.
 *
 * Skips text that lives inside fenced code blocks or carries the inline
 * `code` mark — same exclusion the markdown tag scanner uses.
 */
function buildTagDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, nodePos) => {
    if (!node.isText) return true;
    // Inline `code` mark — skip the whole text node.
    for (const mark of node.marks) {
      if (mark.type.name === 'code') return false;
    }
    const text = node.text ?? '';
    if (text.length === 0) return false;

    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) !== 0x23 /* # */) continue;
      if (!isValidLeftBoundary(text, i)) continue;
      TAG_NAME_RE.lastIndex = i + 1;
      const m = TAG_NAME_RE.exec(text);
      if (m === null) continue;
      const raw = m[0];
      // Pure-numeric: skip but don't decorate (avoids `#404`, hex colors).
      if (/^[0-9]+$/.test(raw)) {
        i = i + raw.length;
        continue;
      }
      const from = nodePos + i;
      const to = from + 1 + raw.length; // include the `#`
      decorations.push(
        Decoration.inline(from, to, {
          class: 'ziba-tag',
          'data-ziba-tag': raw,
        }),
      );
      i = i + raw.length; // skip past the consumed token
    }

    return false;
  });

  // Drop any decoration whose start position lands inside a `codeBlock`
  // node. Inline `code` marks were filtered above; this catches fenced
  // blocks, where the text child has no marks but the parent is `codeBlock`.
  const filtered = decorations.filter((d) => {
    const $pos = doc.resolve(d.from);
    for (let depth = $pos.depth; depth > 0; depth--) {
      if ($pos.node(depth).type.name === 'codeBlock') return false;
    }
    return true;
  });

  return DecorationSet.create(doc, filtered);
}

/**
 * Tiptap extension that adds a ProseMirror decoration plugin highlighting
 * `#tag` tokens in the doc with the `.ziba-tag` class.
 *
 * Implementation choice (option A): a Decoration plugin rather than a real
 * Mark node, so the markdown round-trip stays untouched. Tags remain plain
 * text in the .md file; we only paint them in the editor. This mirrors the
 * wikilink chip's separation between navigation primitives (real nodes)
 * and visual highlights (decorations).
 *
 * Click handling: a click on a `[data-ziba-tag]` element inside the
 * editor DOM selects the corresponding tag in the sidebar. The handler
 * lives in the plugin's `handleClick` prop so it detaches automatically on
 * editor destroy.
 */
export const TagMarkExtension = Extension.create({
  name: 'tagMark',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: PLUGIN_KEY,
        state: {
          init: (_config, state): DecorationSet => buildTagDecorations(state.doc),
          apply: (tr, oldSet): DecorationSet => {
            if (!tr.docChanged) return oldSet.map(tr.mapping, tr.doc);
            return buildTagDecorations(tr.doc);
          },
        },
        props: {
          decorations(state) {
            return PLUGIN_KEY.getState(state) as DecorationSet | undefined;
          },
          handleClick(_view, _pos, event): boolean {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return false;
            // Modifier-clicks are reserved for future gestures (e.g.
            // open-in-split). Plain click is the only one that filters.
            if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
            const el = target.closest<HTMLElement>('[data-ziba-tag]');
            if (el === null) return false;
            const raw = el.getAttribute('data-ziba-tag') ?? '';
            if (raw.length === 0) return false;
            const canonical = raw.toLowerCase();
            // The click handler runs outside React; `getState()` is the
            // supported zustand escape hatch for non-component callers.
            void useTagsStore.getState().selectTag(canonical);
            return true;
          },
        },
      }),
    ];
  },
});
