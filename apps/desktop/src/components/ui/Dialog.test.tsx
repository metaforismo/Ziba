import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState, type JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, Dialog } from './Dialog';

/**
 * Harness: a real trigger button plus a Dialog whose open state it owns, so we
 * can exercise open → interact → close → focus-return the way callers do.
 */
function Harness({ initialOpen = true }: { initialOpen?: boolean }): JSX.Element {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div>
      <button type="button" onClick={(): void => setOpen(true)}>
        open
      </button>
      <button type="button">outside</button>
      <Dialog
        open={open}
        onClose={(): void => setOpen(false)}
        title="Titolo"
        description="Descrizione"
      >
        <button type="button">first</button>
        <button type="button">second</button>
      </Dialog>
    </div>
  );
}

describe('<Dialog> aria wiring', () => {
  it('wires role, aria-modal and labelledby/describedby to the title/description', async () => {
    render(<Harness />);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const labelledby = dialog.getAttribute('aria-labelledby');
    const describedby = dialog.getAttribute('aria-describedby');
    expect(labelledby).not.toBeNull();
    expect(describedby).not.toBeNull();
    expect(document.getElementById(labelledby!)).toHaveTextContent('Titolo');
    expect(document.getElementById(describedby!)).toHaveTextContent('Descrizione');
  });

  it('falls back to ariaLabel when no visible title is given', async () => {
    render(
      <Dialog open onClose={vi.fn()} ariaLabel="Senza titolo">
        <button type="button">x</button>
      </Dialog>,
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Senza titolo');
    expect(dialog).not.toHaveAttribute('aria-labelledby');
  });

  it('renders as alertdialog when role="alertdialog"', async () => {
    render(
      <Dialog open onClose={vi.fn()} role="alertdialog" title="!">
        <button type="button">x</button>
      </Dialog>,
    );
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });
});

describe('<Dialog> dismissal', () => {
  it('closes on Escape', async () => {
    render(<Harness />);
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes on backdrop click but not on clicks inside the panel', async () => {
    render(<Harness />);
    const dialog = await screen.findByRole('dialog');

    // Click inside the panel must not close.
    fireEvent.click(screen.getByText('first'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // The backdrop is the dialog panel's parent (the portal root).
    const backdrop = dialog.parentElement as HTMLElement;
    fireEvent.click(backdrop);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('<Dialog> focus management', () => {
  it('moves focus into the panel on open (first focusable)', async () => {
    render(<Harness initialOpen={false} />);
    fireEvent.click(screen.getByText('open'));
    await screen.findByRole('dialog');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText('first')));
  });

  it('honours initialFocusRef', async () => {
    function FocusHarness(): JSX.Element {
      const ref = useRef<HTMLButtonElement | null>(null);
      return (
        <Dialog open onClose={vi.fn()} title="t" initialFocusRef={ref}>
          <button type="button">first</button>
          <button ref={ref} type="button">
            target
          </button>
        </Dialog>
      );
    }
    render(<FocusHarness />);
    await screen.findByRole('dialog');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText('target')));
  });

  it('traps Tab focus within the panel (wraps last → first)', async () => {
    render(<Harness />);
    const dialog = await screen.findByRole('dialog');
    const first = screen.getByText('first');
    const second = screen.getByText('second');

    second.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('traps Shift+Tab focus within the panel (wraps first → last)', async () => {
    render(<Harness />);
    const dialog = await screen.findByRole('dialog');
    const first = screen.getByText('first');
    const second = screen.getByText('second');

    first.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(second);
  });

  it('returns focus to the trigger when it closes', async () => {
    render(<Harness initialOpen={false} />);
    const trigger = screen.getByText('open');
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('locks body scroll while open and restores it on close', async () => {
    render(<Harness initialOpen={false} />);
    expect(document.body.style.overflow).toBe('');

    fireEvent.click(screen.getByText('open'));
    await screen.findByRole('dialog');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe('');
  });
});

describe('<ConfirmDialog>', () => {
  it('focuses Cancel by default and is an alertdialog when destructive', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Elimina"
        message="Sicuro?"
        confirmLabel="Elimina"
        destructive
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Annulla' })),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
