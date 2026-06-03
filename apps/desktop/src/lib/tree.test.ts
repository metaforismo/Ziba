import { describe, expect, it } from 'vitest';
import type { NoteSummary } from '@ziba/core';
import { buildTree } from './tree';

function note(path: string, title: string): NoteSummary {
  return { path, title, mtimeMs: 0 };
}

describe('buildTree', () => {
  it('merges real folders with notes so empty folders are visible', () => {
    const tree = buildTree(
      [note('projects/ziba/plan.md', 'Plan')],
      ['archive/empty', 'projects/assets'],
    );

    expect(tree).toMatchObject([
      {
        kind: 'folder',
        path: 'archive',
        children: [
          {
            kind: 'folder',
            path: 'archive/empty',
            children: [],
          },
        ],
      },
      {
        kind: 'folder',
        path: 'projects',
        children: [
          {
            kind: 'folder',
            path: 'projects/assets',
            children: [],
          },
          {
            kind: 'folder',
            path: 'projects/ziba',
            children: [{ kind: 'file', path: 'projects/ziba/plan.md', title: 'Plan' }],
          },
        ],
      },
    ]);
  });
});
