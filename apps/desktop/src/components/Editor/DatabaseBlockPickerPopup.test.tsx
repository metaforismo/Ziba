import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { DatabaseViewDefinition } from '../../../shared/ipc';
import { DatabaseBlockPickerPopup } from './DatabaseBlockPickerPopup';

function view(id: string, name: string): DatabaseViewDefinition {
  return {
    id,
    name,
    layout: 'table',
    query: { filters: [], limit: 1000 },
    selectedType: null,
    columns: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('<DatabaseBlockPickerPopup>', () => {
  it('selects a saved database view from the picker', () => {
    const onSelect = vi.fn();

    render(
      <DatabaseBlockPickerPopup
        position={{ top: 0, left: 0, bottom: 0 }}
        views={[view('projects', 'Projects')]}
        loading={false}
        error={null}
        onSelect={onSelect}
        onCreateQuick={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.mouseDown(screen.getByRole('option', { name: /Projects/i }));

    expect(onSelect).toHaveBeenCalledWith('projects');
  });

  it('offers quick creation when no saved view is suitable', () => {
    const onCreateQuick = vi.fn();

    render(
      <DatabaseBlockPickerPopup
        position={{ top: 0, left: 0, bottom: 0 }}
        views={[]}
        loading={false}
        error={null}
        onSelect={vi.fn()}
        onCreateQuick={onCreateQuick}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.mouseDown(screen.getByRole('button', { name: /Nuova vista database/i }));

    expect(onCreateQuick).toHaveBeenCalledOnce();
  });
});
