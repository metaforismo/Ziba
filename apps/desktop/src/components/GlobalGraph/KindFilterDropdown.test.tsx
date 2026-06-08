import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KindFilterDropdown } from './KindFilterDropdown';

describe('<KindFilterDropdown>', () => {
  it('shows "Tutte" when selection is empty', () => {
    render(
      <KindFilterDropdown
        kinds={['author', 'cites']}
        selectedKinds={new Set()}
        onChange={vi.fn()}
        hasMentions={false}
        showMentions={true}
        onShowMentionsChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Filtra relazioni: Tutte/ })).toBeInTheDocument();
  });

  it('shows the count when selection is non-empty', () => {
    render(
      <KindFilterDropdown
        kinds={['author', 'cites']}
        selectedKinds={new Set(['author'])}
        onChange={vi.fn()}
        hasMentions={false}
        showMentions={true}
        onShowMentionsChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Filtra relazioni \(1\)/ })).toBeInTheDocument();
  });

  it('opens the menu and lists every kind with a checkbox', () => {
    render(
      <KindFilterDropdown
        kinds={['author', 'cites']}
        selectedKinds={new Set()}
        onChange={vi.fn()}
        hasMentions={false}
        showMentions={true}
        onShowMentionsChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Filtra relazioni/ }));
    expect(screen.getByLabelText('author')).toBeInTheDocument();
    expect(screen.getByLabelText('cites')).toBeInTheDocument();
  });

  it('toggling a checkbox calls onChange with the new set', () => {
    const onChange = vi.fn();
    render(
      <KindFilterDropdown
        kinds={['author', 'cites']}
        selectedKinds={new Set()}
        onChange={onChange}
        hasMentions={false}
        showMentions={true}
        onShowMentionsChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Filtra relazioni/ }));
    fireEvent.click(screen.getByLabelText('author'));
    const arg = onChange.mock.calls[0]?.[0] as Set<string>;
    expect(arg).toBeInstanceOf(Set);
    expect(arg.has('author')).toBe(true);
    expect(arg.has('cites')).toBe(false);
  });

  it('"Mostra tutte" clears the selection', () => {
    const onChange = vi.fn();
    render(
      <KindFilterDropdown
        kinds={['author', 'cites']}
        selectedKinds={new Set(['author'])}
        onChange={onChange}
        hasMentions={false}
        showMentions={true}
        onShowMentionsChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Filtra relazioni/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mostra tutte' }));
    const arg = onChange.mock.calls[0]?.[0] as Set<string>;
    expect(arg.size).toBe(0);
  });

  it('shows the empty hint when no kinds are available', () => {
    render(
      <KindFilterDropdown
        kinds={[]}
        selectedKinds={new Set()}
        onChange={vi.fn()}
        hasMentions={false}
        showMentions={true}
        onShowMentionsChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Filtra relazioni/ }));
    expect(screen.getByText('Nessuna relazione tipizzata nel grafo.')).toBeInTheDocument();
  });

  it('offers a soft-reference toggle when the graph has mentions', () => {
    const onShowMentionsChange = vi.fn();
    render(
      <KindFilterDropdown
        kinds={[]}
        selectedKinds={new Set()}
        onChange={vi.fn()}
        hasMentions={true}
        showMentions={true}
        onShowMentionsChange={onShowMentionsChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Filtra relazioni/ }));
    const toggle = screen.getByLabelText('Riferimenti deboli');
    expect(toggle).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(onShowMentionsChange).toHaveBeenCalledWith(false);
  });

  it('counts a hidden mention toggle in the button label', () => {
    render(
      <KindFilterDropdown
        kinds={['author']}
        selectedKinds={new Set()}
        onChange={vi.fn()}
        hasMentions={true}
        showMentions={false}
        onShowMentionsChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Filtra relazioni \(1\)/ })).toBeInTheDocument();
  });
});
