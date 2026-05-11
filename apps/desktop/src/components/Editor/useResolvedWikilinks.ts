import { useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import { ipc } from '../../lib/ipc';
import type { WikilinkResolution, WikilinkResolutionMap } from './extensions/Wikilink';

/**
 * Walk the editor doc, collect every wikilink target, and resolve each
 * one against the index. Updates `editor.storage.wikilink.resolved` and
 * forces a re-render so `renderHTML` picks up the new `resolved/broken`
 * styling.
 *
 * Re-runs on every editor `update` (cheap: a doc traversal + a Set
 * comparison), but only triggers IPC for targets that haven't been
 * resolved yet in this lifecycle. The cache is invalidated when the
 * note changes (`noteKey` triggers a full reset).
 *
 * v0.1 trade-off: one IPC call per unique target. The handler is
 * already an indexed lookup (O(1) on the SQLite index), so a doc with
 * 50 wikilinks costs 50 IPC round-trips on first load — acceptable for
 * v0.1, optimize to a batch RPC later.
 */
export function useResolvedWikilinks(editor: Editor | null, noteKey: string | null): void {
  useEffect(() => {
    if (editor === null) return;
    if (editor.isDestroyed) return;

    let cancelled = false;
    const seen = new Set<string>();

    const resolve = async (): Promise<void> => {
      if (editor.isDestroyed) return;
      const resolvedMap = editor.storage.wikilink?.resolved as WikilinkResolutionMap | undefined;
      if (resolvedMap === undefined) return;

      const targets = new Set<string>();
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'wikilink') {
          const t = String(node.attrs.target ?? '').trim();
          if (t.length > 0) targets.add(t);
        }
        return true;
      });

      const toResolve: string[] = [];
      for (const t of targets) {
        if (!seen.has(t)) {
          seen.add(t);
          toResolve.push(t);
        }
      }
      if (toResolve.length === 0) return;

      // Resolve in parallel; Promise.allSettled so a single bad title
      // doesn't poison the rest. The IPC client is thin enough that we
      // don't worry about 8+ concurrent calls here.
      const results = await Promise.allSettled(
        toResolve.map(async (title) => ({
          title,
          path: await ipc.resolveTitle({ title }),
        })),
      );
      if (cancelled || editor.isDestroyed) return;

      let changed = false;
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const next: WikilinkResolution = r.value.path ?? false;
        if (resolvedMap.get(r.value.title) !== next) {
          resolvedMap.set(r.value.title, next);
          changed = true;
        }
      }
      // Re-render so our `renderHTML` picks up the new resolution state.
      // `editor.view.updateState(state)` would also work, but
      // `editor.view.dispatch(state.tr)` with no changes is the cheapest
      // way to force a decoration recompute. Tiptap's `forceUpdate` is
      // not a public API, so we use a no-op transaction.
      if (changed) {
        const tr = editor.state.tr;
        // Mark the transaction as not modifying the doc; Tiptap still
        // re-runs the view's `updateState`, which re-renders nodes.
        tr.setMeta('zibaWikilinkResolved', true);
        editor.view.dispatch(tr);
      }
    };

    // Reset the cache when the note changes. The Map lives in
    // `editor.storage.wikilink.resolved` and is otherwise long-lived.
    const map = editor.storage.wikilink?.resolved as WikilinkResolutionMap | undefined;
    map?.clear();

    const onUpdate = (): void => {
      void resolve();
    };

    void resolve();
    editor.on('update', onUpdate);
    return (): void => {
      cancelled = true;
      editor.off('update', onUpdate);
    };
  }, [editor, noteKey]);
}
