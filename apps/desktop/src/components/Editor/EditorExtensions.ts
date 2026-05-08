import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { Wikilink } from './extensions/Wikilink';
import {
  WikilinkSuggestion,
  type WikilinkSuggestionRenderer,
} from './extensions/WikilinkSuggestion';

export type BuildExtensionsOptions = {
  /**
   * Renderer factory for the suggestion popup. The Editor component
   * injects a React-backed implementation so the extensions stay
   * decoupled from the framework.
   */
  createSuggestionRenderer(): WikilinkSuggestionRenderer;
};

/**
 * Returns the array of Tiptap extensions for the synapsium editor.
 *
 * Order matters: StarterKit's input rules can fire before our wikilink
 * input rule, but they don't overlap (`[[` isn't part of any markdown
 * shortcut). The Markdown extension reads from every other extension's
 * `addStorage().markdown` config, so it must come AFTER the wikilink
 * node — otherwise the parser instance won't pick up our markdown-it
 * plugin registration.
 */
export function buildEditorExtensions(options: BuildExtensionsOptions): Extensions {
  return [
    StarterKit.configure({
      // StarterKit's defaults are mostly fine. We disable the codeBlock's
      // own input rule for triple-backtick? No — we want it. Keep
      // defaults; just turn off heading levels we don't want? Keep all
      // six for now. Disable history? No, we want undo/redo.
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      // The default dropcursor / gapcursor are fine.
    }),
    Wikilink,
    WikilinkSuggestion.configure({
      createRenderer: options.createSuggestionRenderer,
    }),
    Markdown.configure({
      html: false,
      tightLists: true,
      linkify: false,
      breaks: true,
      transformPastedText: true,
      transformCopiedText: true,
    }),
  ];
}
