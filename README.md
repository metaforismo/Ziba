<div align="center">

# Ziba

**Un second brain open-source che fonde Notion e Obsidian.**

Markdown locale come fonte unica di verità, database strutturati come Notion, grafo di connessioni come Obsidian. In futuro: AI-native (semantic search, auto-link, agent organizzativi).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-alpha%20%E2%80%94%20v0.1-orange)](#stato)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Filosofia](#filosofia--perché-Ziba) ·
[Funzionalità](#funzionalità) ·
[Architettura](#architettura) ·
[Quick start](#quick-start) ·
[Roadmap](#roadmap) ·
[Contribuire](CONTRIBUTING.md)

</div>

---

## Filosofia — Perché Ziba

Notion e Obsidian sono entrambi strumenti eccellenti, ma costringono a scegliere:

|  | **Notion** | **Obsidian** | **Ziba** |
|---|---|---|---|
| Storage | Cloud proprietario | File markdown locali | File markdown locali |
| Block editor con `/` menu | ✅ | ❌ | ✅ (in roadmap) |
| Database con property tipizzate | ✅ | Limitato | ✅ (in roadmap) |
| Wikilinks `[[...]]` + backlink | Limitato | ✅ | ✅ |
| Knowledge graph | ❌ | ✅ | ✅ (in roadmap) |
| Lock-in | Sì | No | No |
| Open source | No | No | ✅ |
| AI nativa | Limitata | Plugin | In roadmap |

**Posizionamento:** Notion's power, Obsidian's freedom, AI-ready.

I tuoi dati restano file `.md` con frontmatter YAML sul tuo disco. Sincronizzabili con qualsiasi servizio (Dropbox, iCloud, git). Nessun lock-in. Mai.

## Stato

> **Alpha — v0.3 in costruzione.** Non è ancora installabile come app distribuita. Funziona solo in modalità sviluppo, ma le funzionalità centrali (vault, editor, wikilink/backlink, search FTS5, database view, grafo globale, callout) sono cablate end-to-end.

## Funzionalità

### v0.1 — Foundation (✅ shipped)

- 📂 **Vault locale** — scegli una cartella, è il tuo workspace. Source of truth = file `.md` sul disco.
- 📝 **Editor Tiptap** con markdown shortcut nativi: `# ` → heading, `**testo**` → bold, `> ` → quote, `- ` → lista, ecc.
- 🔗 **Wikilink `[[Nota]]`** con autocomplete su `[[`, click per navigare, link rotti evidenziati, creazione automatica della nota mancante
- 🌳 **Sidebar** con file tree annidato, CRUD via context menu, navigazione completa da tastiera
- 🔄 **Pannello backlink** che si aggiorna live al variare del vault
- 👀 **Watcher su disco** con detection conflitti (vim, altri editor)
- 💾 Autosave debounced

### v0.2 — Power editing (✅ shipped)

- 🔍 **Search palette `Cmd/Ctrl+K`** — full-text search via SQLite FTS5 con sintassi booleana (`foo OR bar`, `"frase esatta"`, `-escludi`)
- 🏷️ **Tag system** — `#tag` nel body o `tags: []` in frontmatter. Sidebar mostra Tag section con count, click filtra il file tree
- 📊 **Property editor** — frontmatter come property tipizzate (text/number/date/boolean/url/multi-select) sopra l'editor
- ⚡ **Slash menu `/`** — popup blocchi inseribili (heading, list, quote, code, hr, callout)
- 🕸️ **Mini-graph** locale alla nota corrente (1-hop) nel right pane (tab "Grafo")

### v0.3 — Database & graph (✅ shipped)

- 🗄️ **Database view** — vista tabellare di tutto il vault con FilterBar tipizzata (eq/contains/has/lacks/lt/gt/lte/gte), sort multi-key, group-by su qualsiasi property, ColumnPicker. Triggered dal pulsante "Database" in TopBar.
- 🌐 **Grafo globale** — vista force-directed dell'intero vault con pan/zoom (anchora sul cursore), search, click highlight 1-hop neighbors, double-click apre. Triggered dal pulsante "Grafo" in TopBar.
- 💡 **Callout block** — Tiptap node con 6 kinds (note, info, tip, warning, danger, success). Markdown roundtrip Obsidian-compatible (`> [!kind]`).
- 🔢 **Typed property index** — ogni frontmatter property estratta in colonne SQLite tipizzate per query veloci

### v0.4 — DB sub-views + blocchi avanzati (✅ shipped)

- 📋 **Board view (kanban)** — sub-mode del Database: colonne raggruppate per property, drag-and-drop per spostare le note tra colonne. Aggiorna direttamente il frontmatter sul disco. Multi-select friendly (string-array).
- 🗓️ **Calendar view** — sub-mode del Database: griglia mensile italiana (Lun-Dom), navigazione prev/next/oggi, note posizionate nel giorno della loro property data. Click → apre.
- ↪️ **Embed block** — `![[Nota]]` mostra il contenuto di un'altra nota inline (read-only). Markdown roundtrip Obsidian-compatible. Lazy-load del target.
- ∑ **Math (KaTeX)** — formule LaTeX con `$$..$$` block e `$..$` inline. Click sul rendering → editor LaTeX live preview. Markdown roundtrip nativo.

### In arrivo

Vedi la [roadmap](#roadmap).

## Architettura

```
ziba/
├── apps/
│   └── desktop/              # App Electron (l'unica nell'MVP v0.1)
│       ├── electron/         # Main process: IPC, fs, SQLite, watcher
│       ├── src/              # Renderer: React + Tiptap + Tailwind + Zustand
│       └── shared/           # Contratto IPC tipizzato (main ↔ renderer)
└── packages/
    ├── core/                 # Logica condivisa (TS puro, zero React/Electron)
    │   └── src/
    │       ├── adapters/     # Interfacce: Filesystem, IndexStore, Watcher
    │       ├── markdown/     # Parser, serializer, wikilink extractor
    │       ├── vault/        # Scan, indicizzazione, load/save note
    │       ├── index-store/  # Schema SQLite condiviso
    │       └── types/        # Tipi domain (Note, Frontmatter, NotePath)
    └── tsconfig/             # Config TypeScript condivisa
```

### Principio architetturale: adapter pattern

`packages/core` non importa React, Electron, o Node-specific code. Espone interfacce che ogni piattaforma implementa:

- **Desktop (Electron):** Node `fs/promises`, `better-sqlite3`, `chokidar`
- **Web (futuro):** File System Access API, IndexedDB, custom file watcher
- **Mobile (futuro):** Expo FileSystem, expo-sqlite, Expo file events

Aggiungere una nuova piattaforma significa scrivere solo gli adapter, non riscrivere la logica.

### Stack tecnico

| Layer | Tecnologia | Perché |
|---|---|---|
| Monorepo | Turborepo + pnpm workspaces | Caching incrementale, link automatico tra package |
| Linguaggio | TypeScript strict | Type safety end-to-end, condivisa tra processi |
| Desktop runtime | Electron 32 | Ecosistema npm completo, futuro AI locale via Node |
| Build desktop | electron-vite + electron-builder | DX moderna, HMR, build multi-piattaforma |
| UI | React 18 | Standard di settore |
| Editor | Tiptap (ProseMirror) | Block editor estendibile, round-trip markdown via `tiptap-markdown` |
| Stato | Zustand | Minimale, niente boilerplate |
| Styling | Tailwind CSS | Utility-first, niente runtime |
| Storage | File `.md` + cache SQLite | Local-first, source of truth = filesystem |
| Index | better-sqlite3 (sync) | Veloce, zero overhead async, perfetto in Electron main |
| Watcher | chokidar | Standard de facto cross-platform |

### Modello dati

```ts
type Note = {
  path: string;                    // relativo al vault, "projects/ziba.md"
  title: string;                   // frontmatter.title > primo H1 > basename
  frontmatter: Record<string, unknown>;
  content: string;                 // body markdown senza frontmatter
  wikilinks: string[];             // target estratti da [[...]]
  mtimeMs: number;
};
```

Il file `.md` sul disco è la fonte unica di verità. La cache SQLite (in `<vault>/.ziba/index.db`) accelera query come "trova tutti i backlink di X" e "autocomplete per `[[`". Cancellabile in qualsiasi momento — viene ricostruita all'apertura del vault.

## Quick start

### Prerequisiti

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (`corepack enable && corepack use pnpm@9` o `npm i -g pnpm`)
- **macOS / Linux / Windows** (primary dev su macOS, gli altri non sono ancora stati testati a fondo)

### Installazione e dev

```bash
git clone https://github.com/metaforismo/Ziba.git ziba
cd ziba
pnpm install
pnpm --filter ziba-desktop run dev
```

L'app si apre. Al primo avvio: scegli una cartella vuota o piena di `.md` come vault e si parte.

### Vault di esempio

Per provare le funzionalità senza preparare un vault da zero:

```bash
node scripts/seed-vault.mjs ./sample-vault
```

Genera 6 note interconnesse via wikilink (idee, progetti, persone, libri, daily). Poi apri `./sample-vault` da Ziba e clicca tra le note per vedere il funzionamento di autocomplete, navigazione e backlink.

### Verifica

```bash
pnpm typecheck   # tutto il monorepo
pnpm build       # produce dist/ per packages e out/ per app
```

### Build distributable

```bash
pnpm --filter ziba-desktop run dist:mac     # .dmg + .zip per macOS (x64+arm64)
pnpm --filter ziba-desktop run dist:win     # NSIS installer
pnpm --filter ziba-desktop run dist:linux   # AppImage + .deb
```

> ⚠️ Non c'è ancora code signing. Su macOS l'app non firmata richiede "Apri" dal menu contestuale del Finder la prima volta.

## Roadmap

| Versione | Tema | Funzionalità chiave |
|---|---|---|
| ✅ v0.1 | Foundation desktop | Vault + editor + wikilink + backlink + watcher |
| ✅ v0.2 | Power editing | Search FTS5 (Cmd+K), property editor, tag system, slash menu, mini-graph |
| ✅ v0.3 | Database & graph | Database table view, grafo globale interattivo, callout block proper |
| ✅ v0.4 | DB sub-views + blocchi | Kanban view, calendar view, embed `![[...]]`, math (KaTeX) `$$...$$` |
| v0.5 (next) | Polish + power-user | Property drag handles, theme switcher, Sidebar refactor, plugin system foundation |
| v1.0 | Multi-piattaforma | Web app, plugin system, sync via filesystem-cloud (Dropbox/iCloud/Drive) |
| v1.x | AI native | Embeddings locali, semantic search, auto-link suggestions, Q&A sul vault, agent organizzativi |
| v1.5+ | Mobile | Expo app (iOS/Android), sync server custom |

Le issue del repository taggano la versione obiettivo. La roadmap è indicativa, non promessa di delivery.

## Contribuire

Le contribuzioni sono benvenute. Vedi [CONTRIBUTING.md](CONTRIBUTING.md) per linee guida, setup ambiente, e processo di PR.

Per discussioni più aperte (idee di feature, design, dubbi di architettura), apri una [Discussion](https://github.com/metaforismo/Ziba/discussions). Per bug riproducibili, una [Issue](https://github.com/metaforismo/Ziba/issues).

## License

[MIT](LICENSE) © 2026 Francesco Giannicola e contributor.
