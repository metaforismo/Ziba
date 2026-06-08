import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NoteSummary } from '@ziba/core';
import { EmptyEditor } from './EmptyEditor';

const note = (path: string, title: string, mtimeMs: number): NoteSummary => ({
  path: path as NoteSummary['path'],
  title,
  mtimeMs,
});

function setup(notes: NoteSummary[], starterCreating = false) {
  const handlers = {
    onCreateBlankNote: vi.fn(),
    onCreateStarter: vi.fn(),
    onOpenSearch: vi.fn(),
    onOpenNote: vi.fn(),
  };
  render(
    <EmptyEditor
      notes={notes}
      starterCreating={starterCreating}
      onCreateBlankNote={handlers.onCreateBlankNote}
      onCreateStarter={handlers.onCreateStarter}
      onOpenSearch={handlers.onOpenSearch}
      onOpenNote={handlers.onOpenNote}
    />,
  );
  return handlers;
}

afterEach(cleanup);

describe('<EmptyEditor>', () => {
  it('emphasises starter + blank note and hides recents for an empty vault', () => {
    const handlers = setup([]);

    fireEvent.click(screen.getByRole('button', { name: 'Crea struttura iniziale' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crea nota' }));

    expect(handlers.onCreateStarter).toHaveBeenCalledTimes(1);
    expect(handlers.onCreateBlankNote).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Note recenti')).toBeNull();
  });

  it('opens the search palette from the Cerca action', () => {
    const handlers = setup([]);

    fireEvent.click(screen.getByRole('button', { name: /Cerca/ }));

    expect(handlers.onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it('lists most-recent notes and opens the clicked one', () => {
    const handlers = setup([
      note('a.md', 'Alpha', 100),
      note('b.md', 'Bravo', 300),
      note('c.md', 'Charlie', 200),
    ]);

    expect(screen.getByText('Note recenti')).toBeInTheDocument();
    // Sorted by mtime desc → Bravo first.
    const recentButtons = screen.getAllByRole('button', { name: /Alpha|Bravo|Charlie/ });
    expect(recentButtons[0]).toHaveTextContent('Bravo');

    fireEvent.click(screen.getByRole('button', { name: /Charlie/ }));
    expect(handlers.onOpenNote).toHaveBeenCalledWith('c.md');

    // No starter action once the vault has notes.
    expect(screen.queryByRole('button', { name: 'Crea struttura iniziale' })).toBeNull();
  });
});
