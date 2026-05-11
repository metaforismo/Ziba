import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { HullsLayer } from './HullsLayer';
import type { CanvasNode } from './Canvas';

function n(id: string, x: number, y: number, type: string | null): CanvasNode {
  return { id, x, y, r: 4, degree: 0, title: id, type, color: '#6366f1' };
}

describe('<HullsLayer>', () => {
  it('renders nothing when fewer than 3 typed nodes share the same type', () => {
    const { container } = render(
      <svg>
        <HullsLayer nodes={[n('a', 0, 0, 'book'), n('b', 10, 0, 'book')]} hiddenTypes={new Set()} />
      </svg>,
    );
    expect(container.querySelector('path')).toBeNull();
  });

  it('renders one hull when ≥ 3 nodes share the same type', () => {
    const { container } = render(
      <svg>
        <HullsLayer
          nodes={[n('a', 0, 0, 'book'), n('b', 10, 0, 'book'), n('c', 5, 10, 'book')]}
          hiddenTypes={new Set()}
        />
      </svg>,
    );
    expect(container.querySelectorAll('path').length).toBe(1);
  });

  it('omits hulls whose type is in hiddenTypes', () => {
    const { container } = render(
      <svg>
        <HullsLayer
          nodes={[n('a', 0, 0, 'book'), n('b', 10, 0, 'book'), n('c', 5, 10, 'book')]}
          hiddenTypes={new Set(['book'])}
        />
      </svg>,
    );
    expect(container.querySelector('path')).toBeNull();
  });

  it('skips nodes whose type is null or empty string', () => {
    const { container } = render(
      <svg>
        <HullsLayer
          nodes={[
            n('a', 0, 0, null),
            n('b', 10, 0, null),
            n('c', 5, 10, null),
            n('d', 0, 0, ''),
            n('e', 10, 0, ''),
            n('f', 5, 10, ''),
          ]}
          hiddenTypes={new Set()}
        />
      </svg>,
    );
    expect(container.querySelector('path')).toBeNull();
  });

  it('renders one hull per typed cluster when multiple types are present', () => {
    const { container } = render(
      <svg>
        <HullsLayer
          nodes={[
            n('a', 0, 0, 'book'),
            n('b', 10, 0, 'book'),
            n('c', 5, 10, 'book'),
            n('d', 100, 100, 'person'),
            n('e', 110, 100, 'person'),
            n('f', 105, 110, 'person'),
          ]}
          hiddenTypes={new Set()}
        />
      </svg>,
    );
    expect(container.querySelectorAll('path').length).toBe(2);
  });
});
