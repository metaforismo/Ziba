import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Tooltip } from './Tooltip';

afterEach(() => {
  cleanup();
});

describe('<Tooltip>', () => {
  it('links the trigger to the tooltip via aria-describedby', () => {
    render(
      <Tooltip label="Apri grafo">
        <button type="button">Grafo</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole('button', { name: 'Grafo' });
    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(trigger.getAttribute('aria-describedby')).toBe(tip.id);
    expect(tip).toHaveTextContent('Apri grafo');
  });

  it('shows instantly on keyboard focus (no delay for tab users)', () => {
    render(
      <Tooltip label="Apri grafo">
        <button type="button">Grafo</button>
      </Tooltip>,
    );

    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(tip).toHaveAttribute('aria-hidden', 'true');

    fireEvent.focus(screen.getByRole('button', { name: 'Grafo' }));
    expect(tip).toHaveAttribute('aria-hidden', 'false');

    fireEvent.blur(screen.getByRole('button', { name: 'Grafo' }));
    expect(tip).toHaveAttribute('aria-hidden', 'true');
  });

  it('preserves the child existing handlers', () => {
    let focused = false;
    render(
      <Tooltip label="Apri grafo">
        <button type="button" onFocus={(): void => void (focused = true)}>
          Grafo
        </button>
      </Tooltip>,
    );

    fireEvent.focus(screen.getByRole('button', { name: 'Grafo' }));
    expect(focused).toBe(true);
  });
});
