import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Wikilink } from './extensions/Wikilink';
import { useWikilinkTypes } from './useWikilinkTypes';
import { useVaultStore } from '../../stores/vault';
import { useTagsStore } from '../../stores/tags';

function makeEditor(): Editor {
  return new Editor({
    extensions: [StarterKit, Wikilink],
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  });
}

describe('useWikilinkTypes', () => {
  beforeEach(() => {
    useVaultStore.setState({ typedPaths: new Map() });
    useTagsStore.setState({ objectTypeSchemas: [] });
  });

  it('writes path → icon into editor.storage.wikilink.typeIconByPath', () => {
    const editor = makeEditor();
    useVaultStore.setState({ typedPaths: new Map([['people/tolkien.md', 'person']]) });
    useTagsStore.setState({
      objectTypeSchemas: [
        {
          id: 'person',
          label: 'Person',
          icon: '👤',
          color: null,
          schema: { id: 'person', label: 'Person', properties: {}, relations: {}, inverse: {} },
          mtimeMs: 0,
        },
      ],
    });
    renderHook(() => useWikilinkTypes(editor));
    const iconMap = editor.storage.wikilink.typeIconByPath as Map<string, string>;
    expect(iconMap.get('people/tolkien.md')).toBe('👤');
    editor.destroy();
  });

  it('removes entries whose path lost its type', () => {
    const editor = makeEditor();
    const iconMap = editor.storage.wikilink.typeIconByPath as Map<string, string>;
    iconMap.set('people/tolkien.md', '👤');
    useVaultStore.setState({ typedPaths: new Map() });
    useTagsStore.setState({ objectTypeSchemas: [] });
    renderHook(() => useWikilinkTypes(editor));
    expect(iconMap.has('people/tolkien.md')).toBe(false);
    editor.destroy();
  });
});
