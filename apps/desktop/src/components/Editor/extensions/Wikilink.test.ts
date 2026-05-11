import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Wikilink } from './Wikilink';

// StarterKit provides the required Document, Paragraph, and Text nodes so
// the ProseMirror schema is complete when testing the Wikilink node in
// isolation.
function makeEditor(): Editor {
  return new Editor({
    extensions: [StarterKit, Wikilink],
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  });
}

describe('Wikilink renderHTML', () => {
  it('prefixes the display text with the type icon when the target resolves to a typed note', () => {
    const editor = makeEditor();
    const resolved = editor.storage.wikilink.resolved as Map<string, string | false>;
    const typeIconByPath = editor.storage.wikilink.typeIconByPath as Map<string, string>;
    resolved.set('Tolkien', 'people/tolkien.md');
    typeIconByPath.set('people/tolkien.md', '👤');
    editor.commands.insertWikilink({ target: 'Tolkien' });
    expect(editor.view.dom.textContent).toContain('👤 Tolkien');
    editor.destroy();
  });

  it('omits the icon when the target is broken', () => {
    const editor = makeEditor();
    const resolved = editor.storage.wikilink.resolved as Map<string, string | false>;
    resolved.set('UnknownPlace', false);
    editor.commands.insertWikilink({ target: 'UnknownPlace' });
    expect(editor.view.dom.textContent).toBe('UnknownPlace');
    editor.destroy();
  });

  it('omits the icon when the target resolves to an untyped note', () => {
    const editor = makeEditor();
    const resolved = editor.storage.wikilink.resolved as Map<string, string | false>;
    resolved.set('Plain', 'plain.md');
    // typeIconByPath has no entry for plain.md
    editor.commands.insertWikilink({ target: 'Plain' });
    expect(editor.view.dom.textContent).toBe('Plain');
    editor.destroy();
  });

  it('uses the alias as the display text and still prefixes the icon', () => {
    const editor = makeEditor();
    const resolved = editor.storage.wikilink.resolved as Map<string, string | false>;
    const typeIconByPath = editor.storage.wikilink.typeIconByPath as Map<string, string>;
    resolved.set('John Ronald Reuel Tolkien', 'people/tolkien.md');
    typeIconByPath.set('people/tolkien.md', '👤');
    editor.commands.insertWikilink({ target: 'John Ronald Reuel Tolkien', alias: 'JRR' });
    expect(editor.view.dom.textContent).toContain('👤 JRR');
    editor.destroy();
  });
});
