import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TypeChips } from './TypeChips';

const TYPES = [
  { id: 'book', label: 'Libro', icon: '📖', color: '#6366f1' },
  { id: 'person', label: 'Persona', icon: '👤', color: null },
];

describe('<TypeChips>', () => {
  it('renders Tutti + every type chip', () => {
    render(<TypeChips types={TYPES} selectedType={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Tutti' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /📖 Libro/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /👤 Persona/ })).toBeInTheDocument();
  });

  it('Tutti is pressed when selectedType is null', () => {
    render(<TypeChips types={TYPES} selectedType={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Tutti' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('the matching chip is pressed when its id is selected', () => {
    render(<TypeChips types={TYPES} selectedType="book" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /📖 Libro/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Tutti' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking a chip calls onChange with its id', () => {
    const onChange = vi.fn();
    render(<TypeChips types={TYPES} selectedType={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /📖 Libro/ }));
    expect(onChange).toHaveBeenCalledWith('book');
  });

  it('clicking the already-active chip clears (calls onChange(null))', () => {
    const onChange = vi.fn();
    render(<TypeChips types={TYPES} selectedType="book" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /📖 Libro/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('clicking Tutti calls onChange(null)', () => {
    const onChange = vi.fn();
    render(<TypeChips types={TYPES} selectedType="book" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tutti' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
