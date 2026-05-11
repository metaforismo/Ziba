import { useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import { useTagsStore } from '../../stores/tags';
import { useVaultStore } from '../../stores/vault';

/**
 * Sync `editor.storage.wikilink.typeIconByPath` with the vault store's
 * typed-paths slice + the cached object-type schemas. Keeps the map
 * authoritative for whichever notes currently have a `type:` and
 * whose schema declares an icon. Dispatches a no-op transaction when
 * the map changes so the Wikilink renderHTML repaints without a full
 * doc recompute.
 *
 * No internal IPC: both inputs are renderer-side caches already kept
 * fresh by their stores. Cost is one Map diff per dependency change.
 */
export function useWikilinkTypes(editor: Editor | null): void {
  const typedPaths = useVaultStore((s) => s.typedPaths);
  const schemas = useTagsStore((s) => s.objectTypeSchemas);

  useEffect(() => {
    if (editor === null || editor.isDestroyed) return;
    const iconMap = editor.storage.wikilink?.typeIconByPath as Map<string, string> | undefined;
    if (iconMap === undefined) return;

    const schemaIconById = new Map<string, string>();
    for (const s of schemas) {
      if (s.icon !== null && s.icon !== '') schemaIconById.set(s.id, s.icon);
    }

    let changed = false;
    const nextKeys = new Set<string>();
    for (const [path, type] of typedPaths) {
      const icon = schemaIconById.get(type);
      if (icon === undefined) continue;
      nextKeys.add(path);
      if (iconMap.get(path) !== icon) {
        iconMap.set(path, icon);
        changed = true;
      }
    }
    for (const k of Array.from(iconMap.keys())) {
      if (!nextKeys.has(k)) {
        iconMap.delete(k);
        changed = true;
      }
    }

    if (changed) {
      const tr = editor.state.tr.setMeta('zibaWikilinkTypes', true);
      editor.view.dispatch(tr);
    }
  }, [editor, typedPaths, schemas]);
}
