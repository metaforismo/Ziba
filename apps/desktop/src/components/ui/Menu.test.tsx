import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useRef, type JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Menu, type MenuItem } from './Menu';

function PointMenu({
  items,
  onClose = vi.fn(),
}: {
  items: MenuItem[];
  onClose?: () => void;
}): JSX.Element {
  return <Menu open onClose={onClose} anchor={{ kind: 'point', x: 10, y: 10 }} items={items} />;
}

function ElementMenu({
  items,
  onClose = vi.fn(),
}: {
  items: MenuItem[];
  onClose?: () => void;
}): JSX.Element {
  const ref = useRef<HTMLButtonElement | null>(null);
  return (
    <div>
      <button ref={ref} type="button">
        trigger
      </button>
      <Menu open onClose={onClose} anchor={{ kind: 'element', ref }} items={items} />
    </div>
  );
}

describe('<Menu> rendering', () => {
  it('renders items, separators, danger and disabled rows with menu roles', () => {
    render(
      <PointMenu
        items={[
          { label: 'Apri', onSelect: vi.fn() },
          { label: 'Elimina', destructive: true, onSelect: vi.fn(), separatorBefore: true },
          { label: 'Bloccato', disabled: true },
        ]}
      />,
    );
    const menu = screen.getByRole('menu');
    const names = within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent?.trim());
    expect(names).toEqual(['Apri', 'Elimina', 'Bloccato']);
    expect(within(menu).getByRole('separator')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Bloccato' })).toBeDisabled();
  });
});

describe('<Menu> keyboard navigation', () => {
  it('auto-focuses the first enabled item on open', async () => {
    render(
      <PointMenu
        items={[
          { label: 'Uno', onSelect: vi.fn() },
          { label: 'Due', onSelect: vi.fn() },
        ]}
      />,
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Uno' })),
    );
  });

  it('moves with ArrowDown/ArrowUp and wraps, skipping disabled rows', async () => {
    render(
      <PointMenu
        items={[
          { label: 'Uno', onSelect: vi.fn() },
          { label: 'Skip', disabled: true },
          { label: 'Due', onSelect: vi.fn() },
        ]}
      />,
    );
    const uno = screen.getByRole('menuitem', { name: 'Uno' });
    const due = screen.getByRole('menuitem', { name: 'Due' });
    await waitFor(() => expect(document.activeElement).toBe(uno));

    fireEvent.keyDown(uno, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(due); // skipped the disabled 'Skip'

    fireEvent.keyDown(due, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(uno); // wrapped

    fireEvent.keyDown(uno, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(due); // wrapped back
  });

  it('Home/End jump to the first/last enabled item', async () => {
    render(
      <PointMenu
        items={[
          { label: 'Uno', onSelect: vi.fn() },
          { label: 'Due', onSelect: vi.fn() },
          { label: 'Tre', onSelect: vi.fn() },
        ]}
      />,
    );
    const uno = screen.getByRole('menuitem', { name: 'Uno' });
    await waitFor(() => expect(document.activeElement).toBe(uno));
    fireEvent.keyDown(uno, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Tre' }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' });
    expect(document.activeElement).toBe(uno);
  });
});

describe('<Menu> activation', () => {
  it('Enter activates the focused item and closes the menu', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<ElementMenu onClose={onClose} items={[{ label: 'Uno', onSelect }]} />);
    const uno = screen.getByRole('menuitem', { name: 'Uno' });
    await waitFor(() => expect(document.activeElement).toBe(uno));
    fireEvent.keyDown(uno, { key: 'Enter' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('Space activates the focused item', async () => {
    const onSelect = vi.fn();
    render(<PointMenu items={[{ label: 'Uno', onSelect }]} />);
    const uno = screen.getByRole('menuitem', { name: 'Uno' });
    await waitFor(() => expect(document.activeElement).toBe(uno));
    fireEvent.keyDown(uno, { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('clicking an item activates it', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<PointMenu onClose={onClose} items={[{ label: 'Uno', onSelect }]} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Uno' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not activate a disabled item', () => {
    const onSelect = vi.fn();
    render(<PointMenu items={[{ label: 'Uno', disabled: true, onSelect }]} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Uno' }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('<Menu> submenus', () => {
  it('opens a child submenu on click and activates a child item', async () => {
    const childSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <PointMenu
        onClose={onClose}
        items={[
          { label: 'Apri', onSelect: vi.fn() },
          { label: 'Altro', children: [{ label: 'Duplica', onSelect: childSelect }] },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Altro' }));
    const child = await screen.findByRole('menuitem', { name: 'Duplica' });
    fireEvent.click(child);
    expect(childSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('marks a parent row with aria-haspopup and aria-expanded', async () => {
    render(
      <PointMenu
        items={[{ label: 'Altro', children: [{ label: 'Duplica', onSelect: vi.fn() }] }]}
      />,
    );
    const parent = screen.getByRole('menuitem', { name: 'Altro' });
    expect(parent).toHaveAttribute('aria-haspopup', 'menu');
    expect(parent).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(parent);
    await waitFor(() => expect(parent).toHaveAttribute('aria-expanded', 'true'));
  });
});
