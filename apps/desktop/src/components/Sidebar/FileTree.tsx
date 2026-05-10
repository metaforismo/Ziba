import type { NotePath } from '@ziba/core';
import type { TreeNode } from '../../lib/tree';

/**
 * Click target for context-menu / row interactions. The "empty" target
 * communicates a click on a blank area (used by the sidebar to show a
 * "Nuova nota / Nuova cartella" menu).
 */
export type TreeTarget =
  | { kind: 'file'; path: NotePath; title: string }
  | { kind: 'folder'; path: string; name: string }
  | { kind: 'empty' };

export type FileTreeProps = {
  /**
   * Pre-flattened, depth-aware row list. Computed by the parent (so
   * keyboard nav and the rendered list share one walk per tree
   * mutation instead of recomputing on every keystroke). Derive via
   * `flattenTree(tree, expanded)`.
   */
  rows: ReadonlyArray<FlatRow>;
  /** Currently-open note path; used to highlight the active row. */
  currentPath: NotePath | null;
  onToggleFolder(path: string): void;
  onSelectFile(path: NotePath): void;
  onContextMenu(target: TreeTarget, x: number, y: number): void;
  /** Optional row that should appear focused (for keyboard nav). */
  focusedPath: string | null;
  /** Called with the row path when the user clicks/focuses it. */
  onFocusPath(path: string): void;
};

type FlatRow =
  | { kind: 'folder'; path: string; name: string; depth: number; expanded: boolean }
  | {
      kind: 'file';
      path: NotePath;
      title: string;
      depth: number;
    };

/**
 * Walk the tree honoring the expanded set. Folders that aren't expanded
 * don't contribute their children to the flattened list.
 */
function flatten(
  nodes: TreeNode[],
  depth: number,
  expanded: ReadonlySet<string>,
  out: FlatRow[],
): void {
  for (const node of nodes) {
    if (node.kind === 'folder') {
      const isExpanded = expanded.has(node.path);
      out.push({
        kind: 'folder',
        path: node.path,
        name: node.name,
        depth,
        expanded: isExpanded,
      });
      if (isExpanded) {
        flatten(node.children, depth + 1, expanded, out);
      }
    } else {
      out.push({
        kind: 'file',
        path: node.path,
        title: node.title,
        depth,
      });
    }
  }
}

const INDENT_PX = 12;

export function FileTree({
  rows,
  currentPath,
  focusedPath,
  onToggleFolder,
  onSelectFile,
  onContextMenu,
  onFocusPath,
}: FileTreeProps): JSX.Element {
  if (rows.length === 0) {
    return (
      <div
        className="px-3 py-4 text-xs text-fg-muted"
        onContextMenu={(e): void => {
          e.preventDefault();
          onContextMenu({ kind: 'empty' }, e.clientX, e.clientY);
        }}
      >
        Nessuna nota. Crea la prima con &quot;Nuova nota&quot;.
      </div>
    );
  }

  return (
    <ul
      role="tree"
      className="px-1 pb-2"
      onContextMenu={(e): void => {
        // Right-click on the empty area below the rows (delegated handler
        // catches this only when the click didn't hit a row, since rows
        // call stopPropagation on their own contextmenu).
        e.preventDefault();
        onContextMenu({ kind: 'empty' }, e.clientX, e.clientY);
      }}
    >
      {rows.map((row) => {
        if (row.kind === 'folder') {
          const isFocused = focusedPath === row.path;
          return (
            <li key={`folder:${row.path}`} role="treeitem" aria-expanded={row.expanded}>
              <button
                type="button"
                onClick={(): void => {
                  onFocusPath(row.path);
                  onToggleFolder(row.path);
                }}
                onContextMenu={(e): void => {
                  e.preventDefault();
                  e.stopPropagation();
                  onFocusPath(row.path);
                  onContextMenu(
                    { kind: 'folder', path: row.path, name: row.name },
                    e.clientX,
                    e.clientY,
                  );
                }}
                style={{ paddingLeft: `${row.depth * INDENT_PX + 6}px` }}
                className={
                  'flex w-full items-center gap-1 rounded px-1 py-1 text-left text-sm ' +
                  (isFocused
                    ? 'bg-bg-muted text-fg'
                    : 'text-fg-subtle hover:bg-bg-muted hover:text-fg')
                }
                title={row.path}
              >
                <span
                  aria-hidden="true"
                  className="inline-block w-3 shrink-0 text-center text-xs text-fg-muted"
                >
                  {row.expanded ? '▾' : '▸'}
                </span>
                <span aria-hidden="true" className="shrink-0">
                  {row.expanded ? '📂' : '📁'}
                </span>
                <span className="truncate">{row.name}</span>
              </button>
            </li>
          );
        }
        const active = row.path === currentPath;
        const isFocused = focusedPath === row.path;
        return (
          <li key={`file:${row.path}`} role="treeitem">
            <button
              type="button"
              onClick={(): void => {
                onFocusPath(row.path);
                onSelectFile(row.path);
              }}
              onContextMenu={(e): void => {
                e.preventDefault();
                e.stopPropagation();
                onFocusPath(row.path);
                onContextMenu(
                  { kind: 'file', path: row.path, title: row.title },
                  e.clientX,
                  e.clientY,
                );
              }}
              style={{ paddingLeft: `${row.depth * INDENT_PX + 6}px` }}
              className={
                'flex w-full items-center gap-1 rounded px-1 py-1 text-left text-sm ' +
                (active
                  ? 'bg-accent/10 text-fg'
                  : isFocused
                    ? 'bg-bg-muted text-fg'
                    : 'text-fg-subtle hover:bg-bg-muted hover:text-fg')
              }
              title={row.path}
            >
              <span aria-hidden="true" className="inline-block w-3 shrink-0" />
              <span aria-hidden="true" className="shrink-0">
                📄
              </span>
              <span className="truncate">{row.title}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Re-flatten the tree for use outside the component (e.g. keyboard nav
 * needs the same row order). Exported as a named helper to avoid
 * duplicating the walk logic.
 */
export function flattenTree(tree: TreeNode[], expanded: ReadonlySet<string>): FlatRow[] {
  const out: FlatRow[] = [];
  flatten(tree, 0, expanded, out);
  return out;
}

export type { FlatRow };
