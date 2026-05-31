import type { NotePath } from '@ziba/core';
import { extractIpcErrorCode } from './ipc-error';
import { ipc } from './ipc';
import { navigateToNote } from './navigate';
import { DEFAULT_FOLDER_ICON_ID } from '../stores/ui';
import { useUiStore, type FolderIconId } from '../stores/ui';
import { useVaultStore } from '../stores/vault';

export const STARTER_NOTE_PATH = 'Projects/Ziba.md' as NotePath;

export const STARTER_FOLDERS = ['Inbox', 'Daily', 'Projects', 'Books', 'People'] as const;

const STARTER_NOTES: Array<{ path: NotePath; body: string }> = [
  {
    path: STARTER_NOTE_PATH,
    body: `## Costruire un secondo cervello semplice

Ziba è il mio spazio per catturare idee, collegare concetti e costruire conoscenza che resta nel tempo.

- [x] Raccogliere idee ogni giorno
- [ ] Collegare le note tra loro
- [ ] Ritrovare e usare le conoscenze

---

### Collegamenti utili

Approfondimento su [[Ricerca semantica]] e costruzione di reti di conoscenza.

#prodotto
`,
  },
  {
    path: 'Projects/Roadmap.md' as NotePath,
    body: `## Roadmap

- [ ] Migliorare la ricerca
- [ ] Collegare note e progetti
- [ ] Rivedere il grafo globale
`,
  },
  {
    path: 'Projects/Idee di prodotto.md' as NotePath,
    body: `## Idee di prodotto

- Catturare idee velocemente
- Organizzare progetti senza perdere il contesto
- Rendere visibili i collegamenti tra note
`,
  },
];

const STARTER_FOLDER_ICONS: Partial<Record<(typeof STARTER_FOLDERS)[number], FolderIconId>> = {
  Inbox: 'archive',
  Daily: 'star',
  Projects: 'briefcase',
  Books: 'book',
  People: DEFAULT_FOLDER_ICON_ID,
};

function isAlreadyExists(err: unknown): boolean {
  return extractIpcErrorCode(err) === 'ALREADY_EXISTS';
}

export async function createStarterVault(): Promise<void> {
  const currentVault = useVaultStore.getState().current;

  for (const folder of STARTER_FOLDERS) {
    try {
      await ipc.createFolder({ path: folder as NotePath });
    } catch (err: unknown) {
      if (!isAlreadyExists(err)) throw err;
    }
  }

  for (const note of STARTER_NOTES) {
    try {
      await ipc.createNote({ path: note.path, initialBody: note.body });
    } catch (err: unknown) {
      if (!isAlreadyExists(err)) throw err;
    }
  }

  await useVaultStore.getState().refreshNotes();

  const ui = useUiStore.getState();
  ui.setExpandedFolders(['Projects']);

  if (currentVault !== null) {
    for (const [folder, icon] of Object.entries(STARTER_FOLDER_ICONS)) {
      if (icon !== undefined && icon !== DEFAULT_FOLDER_ICON_ID) {
        ui.setFolderIcon(currentVault.root, folder, icon);
      }
    }
  }

  await navigateToNote(STARTER_NOTE_PATH);
}
