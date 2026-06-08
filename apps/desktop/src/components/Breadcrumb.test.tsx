import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Breadcrumb, notePathToSegments } from './Breadcrumb';

afterEach(() => {
  cleanup();
});

describe('notePathToSegments', () => {
  it('splits a nested path into folder + note segments and strips .md from the label only', () => {
    // The label drops the extension for display; the key stays the real
    // path so it remains a stable, unique React key.
    expect(notePathToSegments('Projects/Ziba/Roadmap.md')).toEqual([
      { label: 'Projects', key: 'Projects' },
      { label: 'Ziba', key: 'Projects/Ziba' },
      { label: 'Roadmap', key: 'Projects/Ziba/Roadmap.md' },
    ]);
  });

  it('handles a root-level note', () => {
    expect(notePathToSegments('Index.md')).toEqual([{ label: 'Index', key: 'Index.md' }]);
  });

  it('returns an empty list for an empty path', () => {
    expect(notePathToSegments('')).toEqual([]);
    expect(notePathToSegments('   ')).toEqual([]);
  });
});

describe('<Breadcrumb>', () => {
  it('renders the vault name and each segment, marking the note as current', () => {
    render(
      <Breadcrumb vaultName="secondbrain" segments={notePathToSegments('Projects/Roadmap.md')} />,
    );

    expect(screen.getByText('secondbrain')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    const note = screen.getByText('Roadmap');
    expect(note).toBeInTheDocument();
    expect(note).toHaveAttribute('aria-current', 'page');
  });

  it('shows an empty hint when no note is open', () => {
    render(<Breadcrumb vaultName="secondbrain" segments={[]} />);
    expect(screen.getByText('Nessuna nota aperta')).toBeInTheDocument();
  });
});
