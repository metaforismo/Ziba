import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SCROLL_TO_HEADING_EVENT, type ScrollToHeadingDetail } from '../../lib/outline';
import { OutlinePanel } from './index';

describe('OutlinePanel', () => {
  it('filters headings and dispatches scroll requests', () => {
    const events: ScrollToHeadingDetail[] = [];
    const listener: EventListener = (event) => {
      events.push((event as CustomEvent<ScrollToHeadingDetail>).detail);
    };
    window.addEventListener(SCROLL_TO_HEADING_EVENT, listener);

    render(
      <OutlinePanel
        currentPath="Projects/Ziba.md"
        markdown={`# Ziba
## Graph
### Database blocks
## References`}
      />,
    );

    expect(screen.getByText('4')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtra indice'), { target: { value: 'data' } });

    expect(screen.queryByRole('button', { name: 'Graph' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Database blocks' }));

    expect(events).toEqual([
      {
        path: 'Projects/Ziba.md',
        index: 2,
      },
    ]);

    window.removeEventListener(SCROLL_TO_HEADING_EVENT, listener);
  });
});
