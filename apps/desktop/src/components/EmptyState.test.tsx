import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { VaultInfo } from '../../shared/ipc';
import { installMockIpc } from '../test/mock-ipc';
import { useVaultStore } from '../stores/vault';
import { EmptyState } from './EmptyState';

const RECENT_A: VaultInfo = {
  root: '/Users/francesco/Notes',
  name: 'Notes',
  openedAt: new Date('2026-05-20T12:00:00Z').getTime(),
};

const RECENT_B: VaultInfo = {
  root: '/Users/francesco/Work',
  name: 'Work',
  openedAt: new Date('2026-05-21T12:00:00Z').getTime(),
};

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  installMockIpc();
  useVaultStore.setState({
    current: null,
    notes: [],
    typedPaths: new Map(),
    recentVaults: [],
    indexProgress: null,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EmptyState onboarding', () => {
  it('frames true first launch as creating or opening a local Markdown vault', () => {
    render(<EmptyState onOpenVault={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Crea o apri un vault' })).toBeTruthy();
    expect(
      screen.getByText(/un vault è una cartella locale che contiene le tue note markdown/i),
    ).toBeTruthy();
    expect(screen.getByText(/scegli una cartella esistente o creane una nuova/i)).toBeTruthy();
    expect(screen.getByText(/i file restano sul tuo computer/i)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /vault recenti/i })).toBeNull();
  });

  it('shows recent vaults for returning launch', () => {
    useVaultStore.setState({ recentVaults: [RECENT_A, RECENT_B] });

    render(<EmptyState onOpenVault={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /vault recenti/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /notes/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /work/i })).toBeTruthy();
  });

  it('contains and scrolls many recent vaults without letting long paths overflow', () => {
    const longRoot =
      '/Users/francesco/Documents/Research/2026/Clients/Ziba/Very Long Vault Name/with/a/deeply/nested/path/that/keeps/going/for/layout/regression/coverage';
    useVaultStore.setState({
      recentVaults: Array.from({ length: 18 }, (_, idx) => ({
        root: `${longRoot}/${idx}`,
        name: `Long Vault ${idx}`,
        openedAt: new Date('2026-05-21T12:00:00Z').getTime() + idx,
      })),
    });

    render(<EmptyState onOpenVault={vi.fn()} />);

    const panel = screen.getByRole('region', { name: /vault recenti/i });
    const list = screen.getByRole('list', { name: /vault recenti/i });
    const firstButton = screen.getByRole('button', { name: /long vault 0/i });
    const firstPath = screen.getByText(`${longRoot}/0`);

    expect(panel.className).toContain('max-h-[min(46vh,calc(100dvh-2rem))]');
    expect(panel.className).toContain('overflow-hidden');
    expect(list.className).toContain('overflow-y-auto');
    expect(list.className).toContain('min-h-0');
    expect(firstButton.className).toContain('min-w-0');
    expect(firstPath.className).toContain('truncate');
  });

  it('shows local loading state while the primary folder picker is opening', () => {
    const opening = deferred<void>();

    render(<EmptyState onOpenVault={vi.fn(async () => opening.promise)} />);

    const button = screen.getByRole('button', { name: /crea o apri un vault/i });
    fireEvent.click(button);

    expect(screen.getByRole('button', { name: /apertura/i })).toHaveProperty('disabled', true);
  });

  it('does not show an error when the folder picker is canceled', async () => {
    render(<EmptyState onOpenVault={vi.fn(async () => null)} />);

    fireEvent.click(screen.getByRole('button', { name: /crea o apri un vault/i }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('shows a recoverable inline error and re-enables controls after primary open failure', async () => {
    render(
      <EmptyState onOpenVault={vi.fn(async () => Promise.reject(new Error('Access denied')))} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /crea o apri un vault/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /non siamo riusciti ad aprire il vault/i,
    );
    expect(screen.getByRole('button', { name: /crea o apri un vault/i })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('marks only the clicked recent vault row as loading', () => {
    const opening = deferred<void>();
    const openVault = vi.fn(async () => opening.promise);
    useVaultStore.setState({ recentVaults: [RECENT_A, RECENT_B], openVault });

    render(<EmptyState onOpenVault={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /notes/i }));

    expect(screen.getByRole('button', { name: /apertura.*notes/i })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: /work/i })).toHaveProperty('disabled', true);
  });

  it('shows a recoverable inline error and re-enables controls after recent open failure', async () => {
    const openVault = vi.fn(async () => Promise.reject(new Error('Missing folder')));
    useVaultStore.setState({ recentVaults: [RECENT_A], openVault });

    render(<EmptyState onOpenVault={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /notes/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /non siamo riusciti ad aprire il vault/i,
    );
    expect(screen.getByRole('button', { name: /notes/i })).toHaveProperty('disabled', false);
  });
});
