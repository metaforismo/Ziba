import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GraphSettingsPanel } from './GraphSettingsPanel';
import { DEFAULT_GRAPH_SETTINGS } from '../../lib/graph-settings';

describe('<GraphSettingsPanel>', () => {
  it('renders the required settings sections', () => {
    render(
      <GraphSettingsPanel
        settings={DEFAULT_GRAPH_SETTINGS}
        onQueryChange={vi.fn()}
        onDisplayChange={vi.fn()}
        onForcesChange={vi.fn()}
        onAddGroup={vi.fn()}
        onUpdateGroup={vi.fn()}
        onRemoveGroup={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Groups' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Display' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Forces' })).toBeInTheDocument();
  });

  it('emits real setting updates from filters, display, and forces controls', () => {
    const onQueryChange = vi.fn();
    const onDisplayChange = vi.fn();
    const onForcesChange = vi.fn();

    render(
      <GraphSettingsPanel
        settings={DEFAULT_GRAPH_SETTINGS}
        onQueryChange={onQueryChange}
        onDisplayChange={onDisplayChange}
        onForcesChange={onForcesChange}
        onAddGroup={vi.fn()}
        onUpdateGroup={vi.fn()}
        onRemoveGroup={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'tag:#idea' } });
    expect(onQueryChange).toHaveBeenCalledWith({ search: 'tag:#idea' });

    fireEvent.click(screen.getByLabelText('Include orphans'));
    expect(onQueryChange).toHaveBeenCalledWith({ includeOrphans: false });

    fireEvent.click(screen.getByLabelText('Text labels'));
    expect(onDisplayChange).toHaveBeenCalledWith({ showText: false });

    fireEvent.change(screen.getByLabelText('Repel'), { target: { value: '260' } });
    expect(onForcesChange).toHaveBeenCalledWith({ repel: 260 });
  });

  it('adds and edits group rules', () => {
    const onAddGroup = vi.fn();
    const onUpdateGroup = vi.fn();
    const onRemoveGroup = vi.fn();
    const settings = {
      ...DEFAULT_GRAPH_SETTINGS,
      groups: [
        {
          id: 'people',
          name: 'People',
          query: 'type:person',
          enabled: true,
          color: '#ef4444',
        },
      ],
    };

    render(
      <GraphSettingsPanel
        settings={settings}
        onQueryChange={vi.fn()}
        onDisplayChange={vi.fn()}
        onForcesChange={vi.fn()}
        onAddGroup={onAddGroup}
        onUpdateGroup={onUpdateGroup}
        onRemoveGroup={onRemoveGroup}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add group' }));
    expect(onAddGroup).toHaveBeenCalledWith({
      name: 'New group',
      query: '',
      color: expect.stringMatching(/^#[0-9a-f]{6}$/),
    });

    fireEvent.click(screen.getByLabelText('Enable People'));
    expect(onUpdateGroup).toHaveBeenCalledWith('people', { enabled: false });

    fireEvent.change(screen.getByLabelText('People query'), { target: { value: 'tag:#team' } });
    expect(onUpdateGroup).toHaveBeenCalledWith('people', { query: 'tag:#team' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove People' }));
    expect(onRemoveGroup).toHaveBeenCalledWith('people');
  });
});
