# Changelog

Tutte le modifiche notevoli a synapsium saranno documentate qui.

Il formato si basa su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e questo progetto aderisce a [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

### v0.3 Added

- **Database view** (`components/DatabaseView/`) — vista tabellare di tutto il vault triggered dal pulsante "Database" in TopBar. FilterBar tipizzata (eq/contains/has/lacks/lt/gt/lte/gte), sort multi-key, group-by, ColumnPicker, click-row apre nota. Empty states distinti (vault-empty vs filtered-out). Cell rendering type-aware (Italian-locale dates/numbers, ✓/✗ booleans, link URLs, chip arrays).
- **Grafo globale** (`components/GlobalGraph/`) — vista force-directed dell'intero vault. Riusa il simulatore `MiniGraph/layout.ts` con tuning vault-scale (200/400/600/800 iterations a step da n). Pan/zoom imperativi via `<g transform>` (no React re-render per frame). Click highlight 1-hop neighbors, double-click apre nota, search per titolo, fit-to-screen + zoom buttons. Auto-fit solo al primo settle, preserva pan/zoom su refetch.
- **Callout block** (`components/Editor/extensions/Callout.ts`) — Tiptap block node proper con 6 kinds (note/info/tip/warning/danger/success). Markdown roundtrip Obsidian-compatible (`> [!kind]`) via custom serialize + markdown-it core ruler. Slash menu ha 6 entries dedicate. Sostituisce l'approssimazione blockquote+emoji di v0.2.
- **Property index tipizzato** (`packages/core/src/query/`) — ogni frontmatter property estratta in colonne SQLite tipizzate (text/number/boolean/date/array). `detectProperty` + `extractProperties` con stesse regole del PropertyEditor.
- **Query API** (`packages/core/src/query/index.ts`) — `DatabaseQuery` con filter/sort/group/folder/limit, `ScalarFilter` discriminated union (eq/in/has/lacks/lt/gt/lte/gte/contains), `DatabaseResult` con rows + group counts + totalCount.
- **IPC channels** `db:query` (`runDatabaseQuery`) e `graph:full` (`getFullGraph`). Validazione: limite query clampato [1, 5000], filter keys non-empty (errore `INVALID_QUERY`).
- **Stores nuovi**: `database.ts` (query state + auto-debounced re-run + watcher subscription), `mainView` field in `ui.ts` (editor/database/graph routing).
- **TopBar** con view-switcher tab-style (3 icon buttons).
- **Layout.tsx** route condizionalmente sulla `mainView`.
- **30 test Vitest** per `query/index.ts` (detectProperty per ogni tipo, extractProperties, compile-time pattern checks). Totale suite: 140/140.

### v0.2 Added

- **Test suite Vitest** in `packages/core` con 85 unit test che coprono `markdown/wikilinks` (parser stato a stati con code-block awareness), `markdown/parse` e `serialize` (round-trip frontmatter/body via gray-matter), `types/frontmatter` (type guards) e `vault/note` (`deriveTitleFromPath`, `loadNote`, `saveNote` con `MockFilesystemAdapter` in-memory). Script `pnpm test` cablato in turbo e nel job CI dopo `Format check`.
- `apps/desktop/src/lib/timings.ts` raccoglie le costanti di debounce dell'editor (`AUTOSAVE_DEBOUNCE_MS`), del vault store (`VAULT_EVENT_REFRESH_MS`) e del backlinks panel (`BACKLINKS_REFETCH_MS`) con commenti sul perché dei valori scelti.
- `docs/architecture.md` — overview ad alto livello con diagramma main↔renderer↔core, le tre invarianti del progetto (filesystem source of truth, core platform-agnostic, IPC come confine di sicurezza), flussi chiave (apertura vault, scrittura nota, wikilink autocomplete) e mappa "dove guardare per capire X".
- Pre-commit hook via husky + lint-staged: ogni commit auto-formatta con Prettier e fixa con ESLint i file staged. Setup automatico via `prepare` script in `pnpm install`.
- `scripts/seed-vault.mjs` — script Node che genera un vault di esempio con 6 note interconnesse via wikilink (idee, progetti, persone, libri, daily). Utile per primo avvio, demo, e onboarding contributor.
- `.nvmrc` pinnato a Node 20 per coerenza fra contributor.

### Fixed

- **Slash menu in code block**: `/` all'inizio di una riga in un fenced code block apriva il popup. Fix: `allow({ state, range })` callback rifiuta dentro `codeBlock` ancestor o inline `code` mark.
- **White screen on launch**: `electron/main.ts` cercava `preload.js` nella stessa directory di `main.js` ma electron-vite emette il preload come `out/preload/preload.mjs`. Senza preload, `window.synapsium` era undefined e il primo IPC call schiantava React. Fix: path corretto + relax CSP in dev (Vite inietta inline scripts per React Refresh) tramite plugin Vite condizionale.
- Aggiunto `<ErrorBoundary>` top-level: errori React in fase di render mostrano un pannello con stack + bottoni Ricarica/Continua invece di blank window.

## [0.1.0] - In sviluppo

Prima release alpha della desktop app.

### Added

- Monorepo Turborepo + pnpm workspaces con `packages/core` (logica condivisa, TypeScript puro) e `apps/desktop` (Electron + Vite + React)
- Apertura e cambio di vault (cartella di file `.md` sul disco) con persistenza dell'ultimo vault aperto
- File tree laterale con cartelle annidate, CRUD via menu contestuale, navigazione tastiera (frecce, Enter, F2, Delete)
- Editor a blocchi Tiptap con markdown input rules native (`#`, `**`, `>`, `- `, ecc.)
- Wikilink `[[...]]` con custom Tiptap node, autocomplete su `[[`, click per navigare, link rotti evidenziati, creazione automatica di note mancanti
- Pannello backlinks che si aggiorna live al variare del vault
- File watcher chokidar con detection di modifiche esterne e UI di risoluzione conflitto
- Cache SQLite (`<vault>/.synapsium/index.db`) per risoluzione titoli e backlink
- Adapter pattern in `packages/core` (Filesystem, IndexStore, Watcher) per riusabilità futura su web e mobile
- Build distributable via electron-builder per macOS (dmg+zip), Windows (NSIS), Linux (AppImage+deb)
- ESLint + Prettier + EditorConfig per uniformità del codice
- GitHub Actions CI: typecheck + lint + build su PR

[Unreleased]: https://github.com/metaforismo/Synapsium/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/metaforismo/Synapsium/releases/tag/v0.1.0
