import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { DatabaseBlockExtension } from './DatabaseBlock';

function makeEditor(content = ''): Editor {
  return new Editor({
    extensions: [
      StarterKit,
      DatabaseBlockExtension,
      Markdown.configure({
        html: false,
        tightLists: true,
        linkify: false,
        breaks: true,
      }),
    ],
    content,
  });
}

describe('DatabaseBlockExtension', () => {
  it('parses a saved database view block from markdown html syntax', () => {
    const editor = makeEditor('<div data-ziba-db="projects"></div>');

    const node = editor.state.doc.firstChild;
    expect(node?.type.name).toBe('databaseBlock');
    expect(node?.attrs.viewId).toBe('projects');

    editor.destroy();
  });

  it('serializes inserted database blocks back to the compact html marker', () => {
    const editor = makeEditor();

    editor.commands.insertDatabaseBlock({ viewId: 'projects' });

    const markdown =
      (editor.storage.markdown as { getMarkdown?: () => string } | undefined)?.getMarkdown?.() ??
      '';
    expect(markdown.trim()).toBe('<div data-ziba-db="projects"></div>');

    editor.destroy();
  });
});
