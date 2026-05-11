import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TypeFilterDropdown } from './TypeFilterDropdown';

const TYPES = [
  { id: 'book', label: 'Libro', icon: '📖', color: null, count: 12 },
  { id: 'person', label: 'Persona', icon: '👤', color: null, count: 8 },
];

describe('<TypeFilterDropdown>', () => {
  it('shows "Tutti" when selectedType is null', () => {
    render(<TypeFilterDropdown types={TYPES} selectedType={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Tipo: Tutti/i })).toBeInTheDocument();
  });

  it('shows the selected type label when one is selected', () => {
    render(<TypeFilterDropdown types={TYPES} selectedType="book" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Tipo: 📖 Libro/i })).toBeInTheDocument();
  });

  it('falls back to the type slug when no schema label is available', () => {
    render(<TypeFilterDropdown types={[]} selectedType="custom" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Tipo: custom/i })).toBeInTheDocument();
  });

  it('opening the dropdown lists Tutti + every type with its count', () => {
    render(<TypeFilterDropdown types={TYPES} selectedType={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Tipo:/ }));
    expect(screen.getByRole('menuitemradio', { name: /Tutti/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /📖 Libro/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /👤 Persona/i })).toBeInTheDocument();
    expect(screen.getByText(/\(12\)/)).toBeInTheDocument();
    expect(screen.getByText(/\(8\)/)).toBeInTheDocument();
  });

  it('selecting "Tutti" calls onChange(null) and closes the menu', () => {
    const onChange = vi.fn();
    render(<TypeFilterDropdown types={TYPES} selectedType="book" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Tipo:/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Tutti/i }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.queryByRole('menuitemradio', { name: /Tutti/i })).not.toBeInTheDocument();
  });

  it('selecting a type calls onChange with its id', () => {
    const onChange = vi.fn();
    render(<TypeFilterDropdown types={TYPES} selectedType={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Tipo:/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /📖 Libro/i }));
    expect(onChange).toHaveBeenCalledWith('book');
  });

  it('closes on outside click', () => {
    render(
      <div>
        <TypeFilterDropdown types={TYPES} selectedType={null} onChange={vi.fn()} />
        <button type="button">elsewhere</button>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Tipo:/ }));
    expect(screen.getByRole('menuitemradio', { name: /Tutti/i })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'elsewhere' }));
    expect(screen.queryByRole('menuitemradio', { name: /Tutti/i })).not.toBeInTheDocument();
  });

  it('shows the empty-state hint when no types are available', () => {
    render(<TypeFilterDropdown types={[]} selectedType={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Tipo:/ }));
    expect(screen.getByText('Nessun tipo nel vault.')).toBeInTheDocument();
  });
});
