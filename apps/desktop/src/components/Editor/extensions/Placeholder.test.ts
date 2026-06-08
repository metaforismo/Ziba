import { afterEach, describe, expect, it } from 'vitest';
import { Editor, type Content } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { PlaceholderExtension } from './Placeholder';

let editor: Editor | null = null;

function makeEditor(content: Content): Editor {
  editor = new Editor({
    extensions: [StarterKit, PlaceholderExtension],
    content,
  });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('PlaceholderExtension', () => {
  it('decorates a pristine empty doc with the default placeholder text', () => {
    const ed = makeEditor({ type: 'doc', content: [{ type: 'paragraph' }] });
    const el = ed.view.dom.querySelector('[data-placeholder]');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('data-placeholder')).toBe('Scrivi, o premi / per i comandi');
    expect(el?.classList.contains('ziba-placeholder')).toBe(true);
  });

  it('does not decorate once the paragraph has text', () => {
    const ed = makeEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ciao' }] }],
    });
    expect(ed.view.dom.querySelector('[data-placeholder]')).toBeNull();
  });

  it('does not decorate a multi-block doc', () => {
    const ed = makeEditor({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Titolo' }] },
        { type: 'paragraph' },
      ],
    });
    expect(ed.view.dom.querySelector('[data-placeholder]')).toBeNull();
  });
});
