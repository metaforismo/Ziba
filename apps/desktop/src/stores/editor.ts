import type { Frontmatter, Note, NotePath } from '@ziba/core';
import { create } from 'zustand';
import { ipc } from '../lib/ipc';
import { ipcErrorMessage } from '../lib/ipc-error';

type EditorState = {
  currentPath: NotePath | null;
  currentNote: Note | null;
  /** True when the in-memory body diverges from the last saved version. */
  dirty: boolean;
  lastSaveError: string | null;

  openNote(path: NotePath): Promise<void>;
  closeNote(): void;
  setBody(body: string): void;
  /**
   * Replace the in-memory frontmatter with `fm` and mark the buffer dirty.
   * The existing `save()` flow already serializes `currentNote.frontmatter`
   * back through `ipc.saveNote`, so callers only need to debounce-and-save
   * after invoking this setter — no separate IPC plumbing required.
   */
  setFrontmatter(fm: Frontmatter): void;
  save(): Promise<void>;
  /**
   * Called by the vault store when a watcher event reports that the
   * currently-open note changed on disk and the change was NOT initiated
   * by us (mtime newer than our last save). Wave 3 will decide on the UX
   * (auto-reload vs prompt). For now we just expose the hook.
   */
  _internalApplyExternalChange(path: NotePath, mtimeMs: number): void;
};

export const useEditorStore = create<EditorState>((set, get) => ({
  currentPath: null,
  currentNote: null,
  dirty: false,
  lastSaveError: null,

  async openNote(path) {
    const note = await ipc.loadNote({ path });
    set({
      currentPath: path,
      currentNote: note,
      dirty: false,
      lastSaveError: null,
    });
  },

  closeNote() {
    set({
      currentPath: null,
      currentNote: null,
      dirty: false,
      lastSaveError: null,
    });
  },

  setBody(body) {
    const note = get().currentNote;
    if (note === null) return;
    // Only flip `dirty` when the body actually differs — repeated identity
    // sets (e.g. controlled-component echoes) shouldn't mark the buffer.
    if (note.content === body) return;
    set({
      currentNote: { ...note, content: body },
      dirty: true,
    });
  },

  setFrontmatter(fm) {
    const note = get().currentNote;
    if (note === null) return;
    // The PropertyEditor always hands us a fresh object, so reference
    // identity won't help us short-circuit. We always mark dirty here —
    // the editor debounces upstream so spurious calls aren't a concern.
    set({
      currentNote: { ...note, frontmatter: fm },
      dirty: true,
    });
  },

  async save() {
    const { currentPath, currentNote } = get();
    if (currentPath === null || currentNote === null) return;
    try {
      const { mtimeMs } = await ipc.saveNote({
        path: currentPath,
        body: currentNote.content,
        frontmatter: currentNote.frontmatter,
      });
      set({
        currentNote: { ...currentNote, mtimeMs },
        dirty: false,
        lastSaveError: null,
      });
    } catch (err: unknown) {
      const message = ipcErrorMessage(err);
      set({ lastSaveError: message });
    }
  },

  _internalApplyExternalChange(path, mtimeMs) {
    const { currentPath, currentNote } = get();
    if (currentPath === null || currentNote === null) return;
    if (currentPath !== path) return;
    // If the disk mtime is older or equal to what we already have, the
    // event is the echo of our own save — ignore it.
    if (mtimeMs <= currentNote.mtimeMs) return;
    // Wave 3 will decide UX. For now: if buffer is clean, transparently
    // reload; if dirty, leave a flag and let UI surface a conflict.
    if (!get().dirty) {
      void get().openNote(path);
    } else {
      set({
        lastSaveError: 'Il file è stato modificato esternamente. Salva o ricarica per risolvere.',
      });
    }
  },
}));
