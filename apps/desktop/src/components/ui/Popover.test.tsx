import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState, type JSX } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Popover, type PopoverPlacement } from './Popover';

// jsdom has no real layout. We stub getBoundingClientRect per-element so the
// positioner has something to flip against, then restore between tests.
function stubRects(
  resolver: (el: HTMLElement) => Partial<DOMRect> | null,
): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect(
    this: HTMLElement,
  ): DOMRect {
    const r = resolver(this) ?? {};
    const left = r.left ?? 0;
    const top = r.top ?? 0;
    const width = r.width ?? 0;
    const height = r.height ?? 0;
    return {
      x: left,
      y: top,
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

function setViewport(width: number, height: number): () => void {
  const ow = window.innerWidth;
  const oh = window.innerHeight;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  return (): void => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: ow });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: oh });
  };
}

/** Test harness: a real trigger button + a Popover whose open state it owns. */
function Harness({
  placement = 'bottom-start',
  initialOpen = true,
}: {
  placement?: PopoverPlacement;
  initialOpen?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(initialOpen);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div>
      <button ref={triggerRef} type="button" onClick={(): void => setOpen((v) => !v)}>
        trigger
      </button>
      <button type="button">outside</button>
      <Popover
        open={open}
        onClose={(): void => setOpen(false)}
        anchor={{ kind: 'element', ref: triggerRef }}
        placement={placement}
        ariaLabel="panel"
        role="dialog"
      >
        <button type="button">inside</button>
      </Popover>
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('<Popover> positioning', () => {
  it('places a bottom-start panel below and left-aligned to its anchor', async () => {
    const restoreVp = setViewport(1000, 800);
    const rectSpy = stubRects((el) => {
      if (el.textContent === 'trigger') return { left: 100, top: 50, width: 80, height: 24 };
      if (el.getAttribute('role') === 'dialog') return { left: 0, top: 0, width: 200, height: 120 };
      return null;
    });
    try {
      render(<Harness placement="bottom-start" />);
      const panel = await screen.findByRole('dialog');
      await waitFor(() => {
        expect(panel.style.left).toBe('100px'); // anchor.left
        expect(panel.style.top).toBe('78px'); // anchor.bottom (50+24) + default offset 4
      });
    } finally {
      rectSpy.mockRestore();
      restoreVp();
    }
  });

  it('flips above when the panel would overflow the bottom of the viewport', async () => {
    const restoreVp = setViewport(1000, 200);
    const rectSpy = stubRects((el) => {
      if (el.textContent === 'trigger') return { left: 100, top: 150, width: 80, height: 24 };
      if (el.getAttribute('role') === 'dialog') return { left: 0, top: 0, width: 200, height: 120 };
      return null;
    });
    try {
      render(<Harness placement="bottom-start" />);
      const panel = await screen.findByRole('dialog');
      // below would be 150+24+4=178, +120 = 298 > 200-6 → flip above:
      // 150 - 4 - 120 = 26
      await waitFor(() => {
        expect(Number.parseFloat(panel.style.top)).toBeLessThan(150);
      });
    } finally {
      rectSpy.mockRestore();
      restoreVp();
    }
  });

  it('flips horizontally to the left when a right-start submenu would overflow', async () => {
    const restoreVp = setViewport(220, 600);
    const rectSpy = stubRects((el) => {
      if (el.textContent === 'trigger') return { left: 160, top: 40, width: 60, height: 24 };
      if (el.getAttribute('role') === 'dialog') return { left: 0, top: 0, width: 150, height: 90 };
      return null;
    });
    try {
      render(<Harness placement="right-start" />);
      const panel = await screen.findByRole('dialog');
      await waitFor(() => {
        // right side would be 160+60 = 220 > 214 → flips to the left of the anchor
        expect(Number.parseFloat(panel.style.left)).toBeLessThan(160);
      });
    } finally {
      rectSpy.mockRestore();
      restoreVp();
    }
  });
});

describe('<Popover> dismissal', () => {
  it('closes on outside mousedown but not on clicks inside the panel', async () => {
    render(<Harness />);
    expect(await screen.findByText('inside')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('inside'));
    expect(screen.getByText('inside')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('outside'));
    await waitFor(() => expect(screen.queryByText('inside')).not.toBeInTheDocument());
  });

  it('closes on Escape', async () => {
    render(<Harness />);
    expect(await screen.findByText('inside')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('inside')).not.toBeInTheDocument());
  });

  it('does not close when mousedown lands on the anchor trigger', async () => {
    render(<Harness />);
    expect(await screen.findByText('inside')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText('trigger'));
    expect(screen.getByText('inside')).toBeInTheDocument();
  });
});

describe('<Popover> focus return', () => {
  it('returns focus to the trigger when it closes', async () => {
    render(<Harness initialOpen={false} />);
    const trigger = screen.getByText('trigger');
    trigger.focus();
    fireEvent.click(trigger); // open
    expect(await screen.findByText('inside')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' }); // close
    await waitFor(() => expect(screen.queryByText('inside')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
