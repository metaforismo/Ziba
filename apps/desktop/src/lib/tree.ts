import type { NotePath, NoteSummary } from '@ziba/core';

/**
 * Hierarchical view of a flat NoteSummary list plus real folders from disk.
 * Empty folders are first-class tree entries even when no note belongs to
 * them, while note paths still create any missing parent folders.
 */
export type TreeNode =
  | {
      kind: 'folder';
      /** Vault-relative path of the folder, e.g. "projects/ziba". */
      path: string;
      /** Last segment of the path, used as display name. */
      name: string;
      children: TreeNode[];
    }
  | {
      kind: 'file';
      path: NotePath;
      title: string;
    };

type FolderShell = {
  kind: 'folder';
  path: string;
  name: string;
  children: TreeNode[];
};

function getOrCreateFolder(parent: FolderShell, segments: string[], startIdx: number): FolderShell {
  let cursor = parent;
  for (let i = startIdx; i < segments.length; i++) {
    const seg = segments[i] as string;
    const folderPath = cursor.path === '' ? seg : `${cursor.path}/${seg}`;
    let next = cursor.children.find((c): c is FolderShell => c.kind === 'folder' && c.name === seg);
    if (next === undefined) {
      next = { kind: 'folder', path: folderPath, name: seg, children: [] };
      cursor.children.push(next);
    }
    cursor = next;
  }
  return cursor;
}

function normalizeFolderPath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (normalized === '') return null;
  return normalized;
}

function sortChildren(node: FolderShell): void {
  // Folders first (alphabetical by name), then files (alphabetical by title).
  node.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    if (a.kind === 'folder' && b.kind === 'folder') {
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    }
    if (a.kind === 'file' && b.kind === 'file') {
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    }
    return 0;
  });
  for (const child of node.children) {
    if (child.kind === 'folder') sortChildren(child);
  }
}

/**
 * Build a folder/file tree from a flat NoteSummary[] list. Pure function:
 * no React, no side effects. Sorted with folders before files.
 */
export function buildTree(notes: NoteSummary[], folders: string[] = []): TreeNode[] {
  const root: FolderShell = { kind: 'folder', path: '', name: '', children: [] };
  for (const folder of folders) {
    const normalized = normalizeFolderPath(folder);
    if (normalized === null) continue;
    getOrCreateFolder(root, normalized.split('/'), 0);
  }
  for (const note of notes) {
    const segments = note.path.split('/');
    const fileSeg = segments.pop();
    if (fileSeg === undefined || fileSeg === '') continue;
    const parent = getOrCreateFolder(root, segments, 0);
    parent.children.push({ kind: 'file', path: note.path, title: note.title });
  }
  sortChildren(root);
  return root.children;
}
