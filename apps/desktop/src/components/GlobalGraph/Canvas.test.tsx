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

  it('honors display toggles for links, nodes, labels, and arrows', () => {
    const nodes: CanvasNode[] = [
      makeNode('a', { x: 100, y: 100, degree: 5 }),
      makeNode('b', { x: 200, y: 200, degree: 5 }),
    ];
    const edges: CanvasEdge[] = [{ source: 'a', target: 'b', kind: 'owns' }];
    const ref = createRef<CanvasHandle>();
    const { container, rerender } = render(
      <Canvas
        ref={ref}
        nodes={nodes}
        edges={edges}
        width={500}
        height={500}
        initialView={{ tx: 0, ty: 0, scale: 2 }}
        selectedId={null}
        matchedIds={new Set()}
        neighborIds={new Set()}
        onNodeClick={vi.fn()}
        onNodeDoubleClick={vi.fn()}
        onBackgroundMouseDown={vi.fn()}
        onWheel={vi.fn()}
        onBackgroundClick={vi.fn()}
        panning={false}
        clusterOverlayOn={false}
        highlightType={null}
        highlightKinds={new Set()}
        showLinks={false}
        showNodes={false}
        showText={false}
        showArrows={false}
        linkOpacity={0.42}
        focusMode={false}
      />,
    );

    expect(container.querySelectorAll('path[data-graph-edge="true"]')).toHaveLength(0);
    expect(container.querySelectorAll('circle[stroke]')).toHaveLength(0);
    expect(container.querySelectorAll('text')).toHaveLength(0);

    rerender(
      <Canvas
        ref={ref}
        nodes={nodes}
        edges={edges}
        width={500}
        height={500}
        initialView={{ tx: 0, ty: 0, scale: 2 }}
        selectedId={null}
        matchedIds={new Set()}
        neighborIds={new Set()}
        onNodeClick={vi.fn()}
        onNodeDoubleClick={vi.fn()}
        onBackgroundMouseDown={vi.fn()}
        onWheel={vi.fn()}
        onBackgroundClick={vi.fn()}
        panning={false}
        clusterOverlayOn={false}
        highlightType={null}
        highlightKinds={new Set()}
        showLinks
        showNodes
        showText
        showArrows={false}
        linkOpacity={0.42}
        focusMode={false}
      />,
    );

    const edge = container.querySelector('path[data-graph-edge="true"]');
    expect(edge).not.toBeNull();
    expect(edge?.getAttribute('d')).toContain('Q');
    expect(edge?.getAttribute('opacity')).toBe('0.42');
    expect(edge?.getAttribute('marker-end')).toBeNull();
    expect(container.querySelectorAll('circle[stroke]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('text').length).toBeGreaterThan(0);
  });

  it('uses the Obsidian-style dark surface with grid off and neutral links by default', () => {
    const nodes: CanvasNode[] = [
      makeNode('a', { x: 100, y: 100, degree: 5 }),
      makeNode('b', { x: 200, y: 200, degree: 5 }),
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
        initialView={{ tx: 0, ty: 0, scale: 2 }}
        selectedId={null}
        matchedIds={new Set()}
        neighborIds={new Set()}
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

    expect(container.querySelector('[data-graph-surface="obsidian-dark"]')).not.toBeNull();
    expect(container.querySelector('[data-graph-grid="true"]')).toBeNull();
    const edge = container.querySelector('path[data-graph-edge="true"]');
    expect(edge?.getAttribute('stroke')).toBe('#484a50');
    expect(edge?.getAttribute('stroke-width')).toBe('0.72');
    expect(edge?.getAttribute('marker-end')).toBeNull();
  });

  it('applies graph display controls for grid, label threshold, node scale, and link width', () => {
    const nodes: CanvasNode[] = [
      makeNode('a', { x: 100, y: 100, r: 4, degree: 5 }),
      makeNode('b', { x: 200, y: 200, r: 4, degree: 5 }),
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
        initialView={{ tx: 0, ty: 0, scale: 0.9 }}
        selectedId={null}
        matchedIds={new Set()}
        neighborIds={new Set()}
        onNodeClick={vi.fn()}
        onNodeDoubleClick={vi.fn()}
        onBackgroundMouseDown={vi.fn()}
        onWheel={vi.fn()}
        onBackgroundClick={vi.fn()}
        panning={false}
        clusterOverlayOn={false}
        highlightType={null}
        highlightKinds={new Set()}
        showGrid
        labelFade={0}
        nodeScale={1.5}
        linkWidth={1.25}
      />,
    );

    expect(container.querySelector('[data-graph-grid="true"]')).not.toBeNull();
    expect(
      container.querySelector('path[data-graph-edge="true"]')?.getAttribute('stroke-width'),
    ).toBe('1.25');
    expect(container.querySelector('circle[stroke="#d7d8dc"]')?.getAttribute('r')).toBe('6');
    const label = container.querySelector('text');
    expect(label).not.toBeNull();
    expect(label?.getAttribute('paint-order')).toBe('stroke');
  });
});
