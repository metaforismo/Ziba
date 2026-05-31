import type { Icon } from '@phosphor-icons/react';
import {
  Archive,
  BookOpen,
  Briefcase,
  Database,
  Folder,
  FolderOpen,
  ImageSquare,
  Star,
} from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { FolderIconId } from '../../stores/ui';
import { DEFAULT_FOLDER_ICON_ID, FOLDER_ICON_IDS, FOLDER_ICON_LABELS } from '../../stores/ui';

type FolderGlyphProps = {
  id: FolderIconId;
  open?: boolean;
  className?: string;
};

function iconFor(id: FolderIconId, open: boolean): Icon {
  switch (id) {
    case 'briefcase':
      return Briefcase;
    case 'book':
      return BookOpen;
    case 'archive':
      return Archive;
    case 'star':
      return Star;
    case 'database':
      return Database;
    case 'image':
      return ImageSquare;
    case 'folder':
      return open ? FolderOpen : Folder;
  }
}

export function FolderGlyph({ id, open = false, className = '' }: FolderGlyphProps): JSX.Element {
  const Icon = iconFor(id, open);
  return (
    <span
      role="img"
      aria-label={`Icona cartella: ${FOLDER_ICON_LABELS[id]}`}
      className={`inline-flex h-4 w-4 items-center justify-center text-fg-muted ${className}`}
    >
      <Icon size={15} weight="regular" aria-hidden="true" />
    </span>
  );
}

export type FolderIconPickerProps = {
  x: number;
  y: number;
  value: FolderIconId;
  onSelect: (iconId: FolderIconId) => void;
  onReset: () => void;
  onClose: () => void;
};

export function FolderIconPicker({
  x,
  y,
  value,
  onSelect,
  onReset,
  onClose,
}: FolderIconPickerProps): JSX.Element | null {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const node = ref.current;
      if (node !== null && e.target instanceof Node && !node.contains(e.target)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    const rect = node.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let dx = 0;
    let dy = 0;
    if (rect.right > vw) dx = vw - rect.right - 4;
    if (rect.bottom > vh) dy = vh - rect.bottom - 4;
    if (dx !== 0 || dy !== 0) {
      node.style.left = `${x + dx}px`;
      node.style.top = `${y + dy}px`;
    }
  }, [x, y]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Cambia icona cartella"
      style={{ left: x, top: y }}
      className="fixed z-50 flex gap-1 rounded-md border border-border bg-bg p-1 shadow-lg"
    >
      {FOLDER_ICON_IDS.map((id) => (
        <button
          key={id}
          type="button"
          title={FOLDER_ICON_LABELS[id]}
          aria-label={FOLDER_ICON_LABELS[id]}
          aria-pressed={value === id}
          onClick={(): void => {
            if (id === DEFAULT_FOLDER_ICON_ID) {
              onReset();
            } else {
              onSelect(id);
            }
            onClose();
          }}
          className={
            'inline-flex h-8 w-8 items-center justify-center rounded text-fg-subtle hover:bg-bg-muted hover:text-fg ' +
            (value === id ? 'bg-bg-muted text-fg' : '')
          }
        >
          <FolderGlyph id={id} />
        </button>
      ))}
    </div>,
    document.body,
  );
}
