import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { SearchHit, VaultInfo } from '../../../shared/ipc';
import { installMockIpc } from '../../test/mock-ipc';
import { useSearchStore } from '../../stores/search';
import { useVaultStore } from '../../stores/vault';
import { SearchPalette } from './index';

const VAULT: VaultInfo = { root: '/vault', name: 'Ricerca', openedAt: 0 };

function hit(title: string, snippet: string): SearchHit {
  return { path: `${title}.md`, title, snippet };
}

beforeEach(() => {
  installMockIpc();
  // jsdom doesn't implement scrollIntoView; the palette calls it to keep
  // the highlighted row visible. Stub it so result rendering doesn't throw.
  Element.prototype.scrollIntoView = (): void => undefined;
  useVaultStore.setState({ current: VAULT, notes: [] });
  useSearchStore.setState({
    open: true,
    query: '',
    results: [],
    selectedIndex: 0,
    loading: false,
    error: null,
  });
});

afterEach(() => {
  cleanup();
  useSearchStore.setState({ open: false });
});

describe('<SearchPalette>', () => {
  it('shows the typing hint and the current vault scope on an empty query', () => {
    render(<SearchPalette />);

    expect(screen.getByText(/inizia a digitare per cercare/i)).toBeInTheDocument();
    expect(screen.getByText(/in Ricerca/)).toBeInTheDocument();
    // No "no results" copy while the query is empty.
    expect(screen.queryByRole('heading', { name: /nessun risultato/i })).toBeNull();
  });

  it('echoes the query in the no-results empty state', () => {
    useSearchStore.setState({ query: 'foobar', results: [], loading: false });
    render(<SearchPalette />);

    expect(screen.getByRole('heading', { name: /nessun risultato/i })).toBeInTheDocument();
    expect(screen.getByText(/«foobar»/)).toBeInTheDocument();
  });

  it('does not flash no-results while a newer query is in flight', () => {
    // loading=true models the debounce race: results are momentarily empty
    // but a fresh query is pending, so we must not claim "no results".
    useSearchStore.setState({ query: 'foo', results: [], loading: true });
    render(<SearchPalette />);

    expect(screen.queryByRole('heading', { name: /nessun risultato/i })).toBeNull();
  });

  it('shows a pluralized result count and highlights the matched title substring', () => {
    useSearchStore.setState({
      query: 'ziba',
      results: [hit('Ziba notes', 'body'), hit('Other ziba doc', 'body')],
      loading: false,
    });
    render(<SearchPalette />);

    expect(screen.getByText('2 risultati')).toBeInTheDocument();
    // The matched substring is wrapped in a <mark> in each title.
    const marks = screen.getAllByText(/ziba/i, { selector: 'mark' });
    expect(marks.length).toBeGreaterThanOrEqual(2);
  });

  it('uses the singular result label for a single hit', () => {
    useSearchStore.setState({
      query: 'ziba',
      results: [hit('Ziba', 'body')],
      loading: false,
    });
    render(<SearchPalette />);

    expect(screen.getByText('1 risultato')).toBeInTheDocument();
  });
});
