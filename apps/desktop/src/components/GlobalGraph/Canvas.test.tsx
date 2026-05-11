import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import { Canvas, type CanvasHandle, type CanvasNode, type CanvasEdge } from './Canvas';

function makeNode(id: string, opts?: Partial<CanvasNode>): CanvasNode {
  return {
    id,
    x: 0,
    y: 0,
    r: 4,
    degree: 1,
    title: id,
    type: null,
    color: null,
    ...opts,
  };
}

describe('<Canvas> — dim precedence', () => {
  it('dims a neighbour of the selected node when the neighbour is outside the active type filter', () => {
    const nodes: CanvasNode[] = [
      makeNode('a', { x: 100, y: 100, type: 'book' }),
      makeNode('b', { x: 200, y: 200, type: 'person' }),
    ];
    const edges: CanvasEdge[] = [{ source: 'a', target: 'b', kind: '' }];
    const ref = createRef<CanvasHandle>();
    const { container } = render(
      <Canvas
        ref={ref}
        nodes={nodes}
        edges={edges}
        width={500}
        height={500}
        initialView={{ tx: 0, ty: 0, scale: 1 }}
        selectedId="a"
        matchedIds={new Set()}
        neighborIds={new Set(['b'])}
        onNodeClick={vi.fn()}
        onNodeDoubleClick={vi.fn()}
        onBackgroundMouseDown={vi.fn()}
        onWheel={vi.fn()}
        onBackgroundClick={vi.fn()}
        panning={false}
        clusterOverlayOn={false}
        highlightType="book"
        highlightKinds={new Set()}
      />,
    );

    // The neighbour group (b) wraps a <circle>; find it by the node's
    // transform translate. The dim treatment shows up as opacity < 1.
    const groups = container.querySelectorAll('g[transform^="translate(200"]');
    expect(groups.length).toBeGreaterThan(0);
    const nodeGroup = groups[0]!;
    const opacityAttr = nodeGroup.getAttribute('opacity');
    expect(opacityAttr).not.toBeNull();
    expect(Number(opacityAttr)).toBeLessThan(1);
  });

  it('renders the neighbour at full opacity when no type filter is active', () => {
    const nodes: CanvasNode[] = [
      makeNode('a', { x: 100, y: 100, type: 'book' }),
      makeNode('b', { x: 200, y: 200, type: 'person' }),
    ];
    const edges: CanvasEdge[] = [{ source: 'a', target: 'b', kind: '' }];
    const ref = createRef<CanvasHandle>();
    const { container } = render(
      <Canvas
        ref={ref}
        nodes={nodes}
        edges={edges}
        width={500}
        height={500}
        initialView={{ tx: 0, ty: 0, scale: 1 }}
        selectedId="a"
        matchedIds={new Set()}
        neighborIds={new Set(['b'])}
        onNodeClick={vi.fn()}
        onNodeDoubleClick={vi.fn()}
        onBackgroundMouseDown={vi.fn()}
        onWheel={vi.fn()}
        onBackgroundClick={vi.fn()}
        panning={false}
        clusterOverlayOn={false}
        highlightType={null}
        highlightKinds={new Set()}
      />,
    );

    const groups = container.querySelectorAll('g[transform^="translate(200"]');
    expect(groups.length).toBeGreaterThan(0);
    const nodeGroup = groups[0]!;
    const opacityAttr = nodeGroup.getAttribute('opacity');
    // Either explicitly 1 or unset (full opacity by default).
    if (opacityAttr !== null) {
      expect(Number(opacityAttr)).toBe(1);
    }
  });
});
