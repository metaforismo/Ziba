import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Graph } from '@phosphor-icons/react';
import { EmptyView } from './EmptyView';

afterEach(() => {
  cleanup();
});

describe('EmptyView', () => {
  it('renders title and description as a labelled region', () => {
    render(<EmptyView title="Nessun nodo" description="Il vault è vuoto." />);

    const region = screen.getByRole('group', { name: 'Nessun nodo' });
    expect(region).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Nessun nodo' })).toBeTruthy();
    expect(screen.getByText('Il vault è vuoto.')).toBeTruthy();
  });

  it('marks the icon decorative so the heading carries meaning', () => {
    render(<EmptyView icon={<Graph data-testid="icon" />} title="Vuoto" />);

    const icon = screen.getByTestId('icon');
    // The badge wrapper is aria-hidden so AT skips the decorative glyph.
    expect(icon.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it('wires the primary action to its onClick', () => {
    const onClick = vi.fn();
    render(<EmptyView title="Nessun risultato" action={{ label: 'Azzera filtri', onClick }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Azzera filtri' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables and marks busy a loading action', () => {
    render(
      <EmptyView title="Carico" action={{ label: 'Crea', onClick: vi.fn(), loading: true }} />,
    );

    const button = screen.getByRole('button', { name: 'Crea' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('renders both primary and secondary actions', () => {
    const primary = vi.fn();
    const secondary = vi.fn();
    render(
      <EmptyView
        title="Vuoto"
        action={{ label: 'Crea nota', onClick: primary }}
        secondaryAction={{ label: 'Cerca', onClick: secondary }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cerca' }));
    expect(secondary).toHaveBeenCalledTimes(1);
    expect(primary).not.toHaveBeenCalled();
  });

  it('left-aligns content in compact mode for side panels', () => {
    render(<EmptyView title="Nessun titolo" compact />);
    const region = screen.getByRole('group', { name: 'Nessun titolo' });
    expect(region.className).toContain('text-left');
  });

  it('uses danger styling for error-shaped empties', () => {
    render(<EmptyView title="Errore" tone="danger" />);
    const heading = screen.getByRole('heading', { name: 'Errore' });
    expect(heading.className).toContain('text-red-600');
  });
});
