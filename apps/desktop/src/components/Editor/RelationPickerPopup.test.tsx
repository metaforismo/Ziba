import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RelationPickerPopup } from './RelationPickerPopup';

describe('<RelationPickerPopup>', () => {
  it('renders a kind input that starts empty', () => {
    render(
      <RelationPickerPopup
        position={{ top: 0, left: 0, bottom: 0 }}
        suggestedKinds={[]}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const kindInput = screen.getByPlaceholderText('Tipo di relazione') as HTMLInputElement;
    expect(kindInput.value).toBe('');
  });

  it('renders one chip per suggested kind', () => {
    render(
      <RelationPickerPopup
        position={{ top: 0, left: 0, bottom: 0 }}
        suggestedKinds={['author', 'cites']}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'author' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'cites' })).toBeInTheDocument();
  });

  it('calls onCancel when Escape is pressed', () => {
    const onCancel = vi.fn();
    render(
      <RelationPickerPopup
        position={{ top: 0, left: 0, bottom: 0 }}
        suggestedKinds={[]}
        onCommit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCommit({kind, target}) when both fields have values and the user submits', () => {
    const onCommit = vi.fn();
    render(
      <RelationPickerPopup
        position={{ top: 0, left: 0, bottom: 0 }}
        suggestedKinds={[]}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Tipo di relazione'), {
      target: { value: 'author' },
    });
    fireEvent.change(screen.getByPlaceholderText('Nota di destinazione'), {
      target: { value: 'Tolkien' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Inserisci' }));
    expect(onCommit).toHaveBeenCalledWith({ kind: 'author', target: 'Tolkien' });
  });

  it('disables the commit button when either field is empty', () => {
    render(
      <RelationPickerPopup
        position={{ top: 0, left: 0, bottom: 0 }}
        suggestedKinds={[]}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const commit = screen.getByRole('button', { name: 'Inserisci' });
    expect(commit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Tipo di relazione'), {
      target: { value: 'author' },
    });
    expect(commit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Nota di destinazione'), {
      target: { value: 'Tolkien' },
    });
    expect(commit).not.toBeDisabled();
  });

  it('clicking a suggested-kind chip populates the kind input', () => {
    render(
      <RelationPickerPopup
        position={{ top: 0, left: 0, bottom: 0 }}
        suggestedKinds={['author']}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'author' }));
    expect((screen.getByPlaceholderText('Tipo di relazione') as HTMLInputElement).value).toBe(
      'author',
    );
  });

  it('trims whitespace from both fields before committing', () => {
    const onCommit = vi.fn();
    render(
      <RelationPickerPopup
        position={{ top: 0, left: 0, bottom: 0 }}
        suggestedKinds={[]}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Tipo di relazione'), {
      target: { value: '  author  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('Nota di destinazione'), {
      target: { value: '  Tolkien  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Inserisci' }));
    expect(onCommit).toHaveBeenCalledWith({ kind: 'author', target: 'Tolkien' });
  });
});
