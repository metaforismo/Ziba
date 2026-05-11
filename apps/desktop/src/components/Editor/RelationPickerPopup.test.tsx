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
    expect(screen.getByRole('button', { name: 'Usa tipo author' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usa tipo cites' })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Usa tipo author' }));
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

  it('does not let Tab escape the dialog forward from the last focusable', () => {
    render(
      <RelationPickerPopup
        position={{ top: 0, left: 0, bottom: 0 }}
        suggestedKinds={[]}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // With empty fields, Inserisci is disabled; last enabled focusable is Annulla.
    const annulla = screen.getByRole('button', { name: 'Annulla' });
    annulla.focus();
    // Simulate Tab on the last focusable; focus should cycle to the first.
    fireEvent.keyDown(annulla, { key: 'Tab' });
    // Focus moves to the first focusable, which is the kind input.
    const kindInput = screen.getByPlaceholderText('Tipo di relazione');
    expect(kindInput).toHaveFocus();
  });

  it('does not let Shift+Tab escape the dialog backward from the first focusable', () => {
    render(
      <RelationPickerPopup
        position={{ top: 0, left: 0, bottom: 0 }}
        suggestedKinds={[]}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const kindInput = screen.getByPlaceholderText('Tipo di relazione');
    kindInput.focus();
    fireEvent.keyDown(kindInput, { key: 'Tab', shiftKey: true });
    // With empty fields, last enabled focusable is Annulla (Inserisci is disabled).
    const annulla = screen.getByRole('button', { name: 'Annulla' });
    expect(annulla).toHaveFocus();
  });

  it('has aria-modal="true"', () => {
    render(
      <RelationPickerPopup
        position={{ top: 0, left: 0, bottom: 0 }}
        suggestedKinds={[]}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Aggiungi relazione' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
