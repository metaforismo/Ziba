import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColumnPicker } from './ColumnPicker';

describe('<ColumnPicker>', () => {
  it('renders a button with the visible-column count', () => {
    render(
      <ColumnPicker
        availableProperties={['title', 'year']}
        visibleColumns={['title']}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Colonne (1)' })).toBeInTheDocument();
  });

  it('opens the menu and lists available properties', () => {
    render(
      <ColumnPicker
        availableProperties={['title', 'year']}
        visibleColumns={[]}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Colonne/ }));
    expect(screen.getByLabelText('title')).toBeInTheDocument();
    expect(screen.getByLabelText('year')).toBeInTheDocument();
  });

  it('toggling a checkbox calls onChange with the new set', () => {
    const onChange = vi.fn();
    render(
      <ColumnPicker
        availableProperties={['title', 'year']}
        visibleColumns={['title']}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Colonne/ }));
    fireEvent.click(screen.getByLabelText('year'));
    expect(onChange).toHaveBeenCalledWith(['title', 'year']);
  });

  it('shows the empty-state when no available properties and no suggestions', () => {
    render(<ColumnPicker availableProperties={[]} visibleColumns={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Colonne/ }));
    expect(screen.getByText('Nessuna proprietà rilevata.')).toBeInTheDocument();
  });
});

describe('<ColumnPicker> — suggestedKeys', () => {
  it('renders suggested keys in a dedicated "Suggerite" group at the top of the menu', () => {
    render(
      <ColumnPicker
        availableProperties={['title', 'year']}
        suggestedKeys={['author', 'isbn']}
        visibleColumns={[]}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Colonne/ }));
    expect(screen.getByText('Suggerite')).toBeInTheDocument();
    expect(screen.getByLabelText('author')).toBeInTheDocument();
    expect(screen.getByLabelText('isbn')).toBeInTheDocument();
    expect(screen.getByLabelText('title')).toBeInTheDocument();
    expect(screen.getByLabelText('year')).toBeInTheDocument();
  });

  it('does not render a suggested group when the prop is empty', () => {
    render(
      <ColumnPicker
        availableProperties={['title', 'year']}
        suggestedKeys={[]}
        visibleColumns={[]}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Colonne/ }));
    expect(screen.queryByText('Suggerite')).not.toBeInTheDocument();
  });

  it('clicking a suggested key adds it to visibleColumns even if not in availableProperties', () => {
    const onChange = vi.fn();
    render(
      <ColumnPicker
        availableProperties={['title']}
        suggestedKeys={['author']}
        visibleColumns={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Colonne/ }));
    fireEvent.click(screen.getByLabelText('author'));
    expect(onChange).toHaveBeenCalledWith(['author']);
  });

  it('deduplicates keys that appear in both suggested and available lists', () => {
    render(
      <ColumnPicker
        availableProperties={['title', 'author']}
        suggestedKeys={['author']}
        visibleColumns={[]}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Colonne/ }));
    // `author` appears once — in the suggested group only.
    expect(screen.getAllByLabelText('author')).toHaveLength(1);
  });
});
