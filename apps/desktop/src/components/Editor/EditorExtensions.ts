import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { CalloutExtension } from './extensions/Callout';
import { EmbedExtension } from './extensions/Embed';
import { MathBlockExtension } from './extensions/MathBlock';
import { MathInlineExtension } from './extensions/MathInline';
import {
  SlashCommandExtension,
  type SlashCommandRenderer,
  type SlashCommandOptions,
} from './extensions/SlashCommand';
import { TagMarkExtension } from './extensions/TagMark';
import { Wikilink } from './extensions/Wikilink';
import {
  WikilinkSuggestion,
  type WikilinkSuggestionRenderer,
} from './extensions/WikilinkSuggestion';

export type BuildExtensionsOptions = {
  /**
   * Renderer factory for the wikilink suggestion popup. The Editor
   * component injects a React-backed implementation so the extensions
   * stay decoupled from the framework.
   */
  createSuggestionRenderer(): WikilinkSuggestionRenderer;
  /**
   * Renderer factory for the slash-command popup. Optional: when
   * omitted, the slash-command extension still loads but its popup
   * never shows (the default no-op renderer is used). Useful for
   * headless/test setups that don't need slash UI.
   */
  createSlashRenderer?: () => SlashCommandRenderer;
  /** Forwarded to `SlashCommandExtension.configure(...)`. */
  onSlashRelationRequested?: SlashCommandOptions['onRelationRequested'];
  slashLatestRect?: SlashCommandOptions['latestRect'];
};

/**
 * Returns the array of Tiptap extensions for the ziba editor.
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
    // Pure-decoration plugin that paints `#tag` ranges. Sits AFTER Wikilink
    // so ranges inside a wikilink atom node are skipped (atoms don't
    // descend into text). Order vs Markdown is irrelevant — TagMark
    // doesn't touch serialization.
    TagMarkExtension,
    // Block-level callout node. Order matters relative to Markdown
    // (must come before, like every other custom node) so that
    // tiptap-markdown picks up its `addStorage().markdown` hooks. Order
    // vs StarterKit's blockquote is irrelevant: parseHTML for callouts
    // is a `div[data-callout]` selector, which doesn't overlap with
    // blockquote's tag matcher.
    CalloutExtension,
    // Block-level embed (transclusion) node. Order matters relative to
    // Markdown (must come before, like every other custom node) so
    // tiptap-markdown picks up its `addStorage().markdown` hooks. Order
    // vs Wikilink/Callout is irrelevant - the embed parse rule scans
    // paragraph triplets after block parsing, and its `zibaEmbedRegistered`
    // guard keeps it idempotent.
    EmbedExtension,
    // KaTeX math nodes. Both register a markdown-it rule (block: `$$..$$`,
    // inline: `$..$`) and a serialise hook before Markdown picks them up.
    // Inline pos: must come before Markdown so tiptap-markdown's parser
    // sees their inline rule registration.
    MathBlockExtension,
    MathInlineExtension,
    // Slash-command menu. Order doesn't matter relative to the other
    // extensions: the suggestion plugin manages its own decoration set
    // and never collides with the wikilink trigger (`/` vs `[[`).
    SlashCommandExtension.configure({
      createRenderer:
        options.createSlashRenderer ??
        ((): SlashCommandRenderer => ({
          onStart(): void {},
          onUpdate(): void {},
          onKeyDown(): boolean {
            return false;
          },
          onExit(): void {},
        })),
      ...(options.onSlashRelationRequested !== undefined && {
        onRelationRequested: options.onSlashRelationRequested,
      }),
      ...(options.slashLatestRect !== undefined && { latestRect: options.slashLatestRect }),
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
