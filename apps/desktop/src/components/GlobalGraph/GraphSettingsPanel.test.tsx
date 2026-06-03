import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GraphSettingsPanel } from './GraphSettingsPanel';
import { DEFAULT_GRAPH_SETTINGS } from '../../lib/graph-settings';

const DEFAULT_PROPS = {
  settings: DEFAULT_GRAPH_SETTINGS,
  onClose: vi.fn(),
  onReset: vi.fn(),
  onApplyPreset: vi.fn(),
  onQueryChange: vi.fn(),
  onDisplayChange: vi.fn(),
  onForcesChange: vi.fn(),
  onAddGroup: vi.fn(),
  onUpdateGroup: vi.fn(),
  onRemoveGroup: vi.fn(),
};

describe('<GraphSettingsPanel>', () => {
  it('stays out of the graph until the drawer is opened', () => {
    render(<GraphSettingsPanel {...DEFAULT_PROPS} open={false} />);

    expect(screen.queryByRole('heading', { name: 'Controlli grafo' })).toBeNull();
  });

  it('renders the Obsidian-like drawer sections without unsupported global controls', () => {
    render(<GraphSettingsPanel {...DEFAULT_PROPS} open />);

    expect(screen.getByRole('heading', { name: 'Controlli grafo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Applica preset SiYuan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtri' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gruppi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aspetto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forze' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nodi irrisolti')).toBeNull();
    expect(screen.queryByLabelText('Solo esistenti')).toBeNull();
    expect(screen.queryByLabelText('Profondità locale')).toBeNull();
  });

  it('emits real setting updates from search, toggles, and sliders', () => {
    const onQueryChange = vi.fn();
    const onDisplayChange = vi.fn();
    const onForcesChange = vi.fn();

    render(
      <GraphSettingsPanel
        {...DEFAULT_PROPS}
        open
        onQueryChange={onQueryChange}
        onDisplayChange={onDisplayChange}
        onForcesChange={onForcesChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Cerca nel grafo'), { target: { value: 'tag:#idea' } });
    expect(onQueryChange).toHaveBeenCalledWith({ search: 'tag:#idea' });

    fireEvent.click(screen.getByLabelText('Orfani'));
    expect(onQueryChange).toHaveBeenCalledWith({ includeOrphans: false });

    fireEvent.change(screen.getByLabelText('Connessioni minime'), { target: { value: '2' } });
    expect(onQueryChange).toHaveBeenCalledWith({ minDegree: 2 });

    fireEvent.click(screen.getByLabelText('Etichette'));
    expect(onDisplayChange).toHaveBeenCalledWith({ showText: false });

    fireEvent.change(screen.getByLabelText('Dimensione nodo'), { target: { value: '1.4' } });
    expect(onDisplayChange).toHaveBeenCalledWith({ nodeScale: 1.4 });

    fireEvent.change(screen.getByLabelText('Forza di repulsione'), { target: { value: '260' } });
    expect(onForcesChange).toHaveBeenCalledWith({ repel: 260 });
  });

  it('applies graph presets as a single user action', () => {
    const onApplyPreset = vi.fn();
    render(<GraphSettingsPanel {...DEFAULT_PROPS} open onApplyPreset={onApplyPreset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Applica preset SiYuan' }));

    expect(onApplyPreset).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'siyuan',
        query: expect.objectContaining({ minDegree: 1, includeOrphans: false }),
        display: expect.objectContaining({ showArrows: true }),
      }),
    );
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
          color: '#64748b',
        },
      ],
    };

    render(
      <GraphSettingsPanel
        {...DEFAULT_PROPS}
        open
        settings={settings}
        onAddGroup={onAddGroup}
        onUpdateGroup={onUpdateGroup}
        onRemoveGroup={onRemoveGroup}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Nuovo' }));
    expect(onAddGroup).toHaveBeenCalledWith({
      name: 'Nuovo gruppo',
      query: '',
      color: expect.stringMatching(/^#[0-9a-f]{6}$/),
    });

    fireEvent.click(screen.getByLabelText('Abilita People'));
    expect(onUpdateGroup).toHaveBeenCalledWith('people', { enabled: false });

    fireEvent.change(screen.getByLabelText('People query'), { target: { value: 'path:"Team"' } });
    expect(onUpdateGroup).toHaveBeenCalledWith('people', { query: 'path:"Team"' });

    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi People' }));
    expect(onRemoveGroup).toHaveBeenCalledWith('people');
  });

  it('collapses sections and exposes reset/close actions', () => {
    const onClose = vi.fn();
    const onReset = vi.fn();
    render(<GraphSettingsPanel {...DEFAULT_PROPS} open onClose={onClose} onReset={onReset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Aspetto' }));
    expect(screen.queryByLabelText('Soglia testo')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ripristina impostazioni grafo' }));
    expect(onReset).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi controlli grafo' }));
    expect(onClose).toHaveBeenCalled();
  });
});
