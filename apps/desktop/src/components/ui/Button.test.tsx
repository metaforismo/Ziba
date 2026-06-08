import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button';

afterEach(() => {
  cleanup();
});

describe('<Button>', () => {
  it('renders its children as a real button defaulting to type="button"', () => {
    render(<Button>Salva</Button>);
    const button = screen.getByRole('button', { name: 'Salva' });
    expect(button).toBeTruthy();
    // Default type is `button` so it never accidentally submits a form.
    expect(button.getAttribute('type')).toBe('button');
  });

  it('honours an explicit type', () => {
    render(<Button type="submit">Invia</Button>);
    expect(screen.getByRole('button', { name: 'Invia' }).getAttribute('type')).toBe('submit');
  });

  it('fires onClick when enabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Premi</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Premi' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders each variant with its distinguishing token class', () => {
    const { rerender } = render(<Button variant="primary">x</Button>);
    expect(screen.getByRole('button').className).toContain('bg-accent');

    rerender(<Button variant="danger">x</Button>);
    expect(screen.getByRole('button').className).toContain('bg-red-600');

    rerender(<Button variant="secondary">x</Button>);
    expect(screen.getByRole('button').className).toContain('border-border');

    rerender(<Button variant="ghost">x</Button>);
    // Ghost has no solid fill — it only tints on hover.
    expect(screen.getByRole('button').className).toContain('hover:bg-bg-muted');
  });

  it('disables and does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Bloccato
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Bloccato' });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('marks loading as busy + disabled and suppresses clicks', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Carico
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Carico' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button).toHaveProperty('disabled', true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders a decorative spinner only while loading', () => {
    const { rerender } = render(<Button>Pronto</Button>);
    expect(screen.queryByTestId('ziba-button-spinner')).toBeNull();

    rerender(<Button loading>Pronto</Button>);
    const spinner = screen.getByTestId('ziba-button-spinner');
    // The spinner is decorative — the label carries the accessible name.
    expect(spinner.getAttribute('aria-hidden')).toBe('true');
  });

  it('applies fullWidth as a block-level width', () => {
    render(<Button fullWidth>Largo</Button>);
    expect(screen.getByRole('button').className).toContain('w-full');
  });

  it('renders leading and trailing icons marked decorative', () => {
    render(
      <Button
        leadingIcon={<span data-testid="lead">L</span>}
        trailingIcon={<span data-testid="trail">T</span>}
      >
        Azione
      </Button>,
    );
    expect(screen.getByTestId('lead').closest('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.getByTestId('trail').closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it('hides leading/trailing icons while loading so only the spinner shows', () => {
    render(
      <Button loading leadingIcon={<span data-testid="lead">L</span>}>
        Azione
      </Button>,
    );
    expect(screen.queryByTestId('lead')).toBeNull();
    expect(screen.getByTestId('ziba-button-spinner')).toBeTruthy();
  });

  it('forwards a ref to the underlying button element', () => {
    let node: HTMLButtonElement | null = null;
    render(
      <Button
        ref={(el): void => {
          node = el;
        }}
      >
        Ref
      </Button>,
    );
    expect(node).toBeInstanceOf(HTMLButtonElement);
  });
});
