import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { runSlashCommand, slashMenuItems } from './SlashCommand';

describe('SlashCommand database item', () => {
  it('exposes a database slash entry searchable by saved view terms', () => {
    expect(slashMenuItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'database',
          title: 'Database',
          keywords: expect.arrayContaining(['database', 'vista', 'view']),
        }),
      ]),
    );
  });

  it('delegates the database slash entry to the database picker callback', () => {
    const editor = new Editor({
      extensions: [StarterKit],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    const onDatabaseRequested = vi.fn();
    const range = { from: 1, to: 1 };
    const position = { top: 12, left: 24, bottom: 36 };

    runSlashCommand(editor, 'database', {
      range,
      position,
      onDatabaseRequested,
    });

    expect(onDatabaseRequested).toHaveBeenCalledWith({ editor, range, position });
    editor.destroy();
  });
});
