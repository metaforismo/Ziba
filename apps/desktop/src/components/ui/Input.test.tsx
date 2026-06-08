import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Input } from './Input';

afterEach(() => {
  cleanup();
});

describe('<Input>', () => {
  it('renders a controlled text input and fires onChange', () => {
    const onChange = vi.fn();
    render(<Input value="ciao" onChange={onChange} aria-label="Nome" />);
    const input = screen.getByRole('textbox', { name: 'Nome' }) as HTMLInputElement;
    expect(input.value).toBe('ciao');

    fireEvent.change(input, { target: { value: 'mondo' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('defaults to type="text"', () => {
    render(<Input aria-label="Campo" />);
    expect((screen.getByRole('textbox', { name: 'Campo' }) as HTMLInputElement).type).toBe('text');
  });

  it('associates a visible label with the control', () => {
    render(<Input label="Titolo" />);
    // getByLabelText resolves the <label for> wiring.
    expect(screen.getByLabelText('Titolo')).toBeTruthy();
  });

  it('sets aria-invalid only when invalid', () => {
    const { rerender } = render(<Input aria-label="x" />);
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBeNull();

    rerender(<Input aria-label="x" invalid />);
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
  });

  it('renders a leading icon marked decorative', () => {
    render(<Input aria-label="Cerca" leadingIcon={<span data-testid="icon">i</span>} />);
    expect(screen.getByTestId('icon').closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it('forwards a ref to the underlying input element', () => {
    let node: HTMLInputElement | null = null;
    render(
      <Input
        aria-label="r"
        ref={(el): void => {
          node = el;
        }}
      />,
    );
    expect(node).toBeInstanceOf(HTMLInputElement);
  });
});
