import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Gear } from '@phosphor-icons/react';
import { IconButton } from './IconButton';
import { SegmentedControl } from './SegmentedControl';

describe('shared panel controls', () => {
  it('renders a segmented tab control and reports value changes', () => {
    const onChange = vi.fn();

    render(
      <SegmentedControl
        ariaLabel="Pannello laterale"
        value="references"
        items={[
          { id: 'references', label: 'Riferimenti' },
          { id: 'graph', label: 'Grafo' },
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Grafo' }));

    expect(onChange).toHaveBeenCalledWith('graph');
  });

  it('renders an icon-only button with accessible label and pressed state', () => {
    const onClick = vi.fn();

    render(
      <IconButton
        label="Apri controlli"
        pressed
        onClick={onClick}
        icon={<Gear size={16} aria-hidden="true" />}
      />,
    );

    const button = screen.getByRole('button', { name: 'Apri controlli' });
    expect(button).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledOnce();
  });
});
