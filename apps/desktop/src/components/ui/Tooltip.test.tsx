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

  it('dismisses on Escape while keeping focus on the trigger', () => {
    render(
      <Tooltip label="Apri grafo">
        <button type="button">Grafo</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole('button', { name: 'Grafo' });
    const tip = screen.getByRole('tooltip', { hidden: true });

    trigger.focus();
    fireEvent.focus(trigger);
    expect(tip).toHaveAttribute('aria-hidden', 'false');

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(tip).toHaveAttribute('aria-hidden', 'true');
    // Focus stays on the trigger (Escape dismisses the bubble, not focus).
    expect(document.activeElement).toBe(trigger);
  });
});
