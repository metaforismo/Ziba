import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RelationsSection } from './RelationsSection';

describe('<RelationsSection>', () => {
  it('renders an empty-state hint with an add button when no relations exist', () => {
    render(<RelationsSection frontmatter={{}} suggestedKinds={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Nessuna relazione dichiarata.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Aggiungi relazione' })).toBeInTheDocument();
  });

  it('renders one row per (kind, target) pair, flattening lists', () => {
    render(
      <RelationsSection
        frontmatter={{ relations: { author: '[[Tolkien]]', cites: ['[[A]]', '[[B]]'] } }}
        suggestedKinds={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('author')).toBeInTheDocument();
    expect(screen.getByText('Tolkien')).toBeInTheDocument();
    expect(screen.getAllByText('cites').length).toBe(2);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('calls onChange with the relation removed when the user clicks the row delete button', () => {
    const onChange = vi.fn();
    render(
      <RelationsSection
        frontmatter={{ relations: { author: '[[Tolkien]]' } }}
        suggestedKinds={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi relazione author → Tolkien' }));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it('clicking the add button reveals an inline form; commit calls onChange with the new relation', () => {
    const onChange = vi.fn();
    render(<RelationsSection frontmatter={{}} suggestedKinds={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Aggiungi relazione' }));

    fireEvent.change(screen.getByPlaceholderText('Tipo'), { target: { value: 'author' } });
    fireEvent.change(screen.getByPlaceholderText('Destinazione'), { target: { value: 'Tolkien' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' }));

    expect(onChange).toHaveBeenCalledWith({ relations: { author: '[[Tolkien]]' } });
  });

  it('clicking cancel closes the inline form without calling onChange', () => {
    const onChange = vi.fn();
    render(<RelationsSection frontmatter={{}} suggestedKinds={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Aggiungi relazione' }));
    fireEvent.change(screen.getByPlaceholderText('Tipo'), { target: { value: 'author' } });
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('Tipo')).not.toBeInTheDocument();
  });

  it('shows an error and rejects commit when either field is empty', () => {
    const onChange = vi.fn();
    render(<RelationsSection frontmatter={{}} suggestedKinds={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Aggiungi relazione' }));
    fireEvent.change(screen.getByPlaceholderText('Tipo'), { target: { value: 'author' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Tipo e destinazione sono entrambi obbligatori.')).toBeInTheDocument();
  });
});
