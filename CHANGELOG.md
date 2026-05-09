# Changelog

Tutte le modifiche notevoli a synapsium saranno documentate qui.

Il formato si basa su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e questo progetto aderisce a [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

### v0.4 Added

- **Database sub-views** (`databaseViewMode` in `useUiStore`): tabs Tabella / Board / Calendario nel Database header. Stessa query (filtri/sort/groupBy/folder), tre visualizzazioni.
- **Board view (kanban)** (`components/DatabaseView/BoardView/`) — colonne raggruppate per `groupBy` property, drag-and-drop HTML5 nativo (no nuova dep). Drop su una colonna aggiorna il frontmatter via `ipc.saveNote` (replace per scalari, splice per array). "(senza valore)" column sempre presente per cancellare la property. Multi-select (`string-array`): card appare in tutte le colonne dei suoi tag. +30 unit test in `helpers.test.ts`.
- **Calendar view** (`components/DatabaseView/CalendarView/`) — griglia mensile Lun-Dom italiano. Buckets le note per ISO date in `properties[groupBy]`. Header con prev/next/Oggi. Each cell up to 3 note pills + "+N altre". Today accent-bordered, out-of-month dimmed. DST-safe + reject calendar-invalid ISO. +12 unit test.
- **Embed block** (`Editor/extensions/Embed.ts` + `EmbedNodeView.tsx`) — `![[Target]]` Tiptap atomic node con React node view che lazy-loada il target via `ipc.resolveTitle` + `ipc.loadNote`. Markdown roundtrip Obsidian-compatible. Hand-rolled markdown preview renderer (~150 righe, no nuova dep — usa solo escape via React). Stati: loading / not-found (con "Crea nota" CTA) / error (con Riprova). Click → `navigateToNote`. Slash menu entry `↪ Embed nota`.
- **Math (KaTeX)** (`Editor/extensions/MathBlock.ts` + `MathInline.ts` + `MathRenderer.tsx`) — `$$..$$` block + `$..$` inline. Tiptap atomic nodes con React node view. KaTeX `renderToString` con `throwOnError: false`. Click → live-preview textarea editor (Cmd+Enter commit, Esc revert, blur fallback commit). Markdown roundtrip via markdown-it block + inline rules con guards Pandoc-style anti-currency-falsi-positivi. Slash menu entries `∑ Formula matematica` (block) e `𝑥 Formula inline`. Nuova dep runtime: `katex@^0.16.11` + `@types/katex@^0.16.7`.
- **`navigateToNote(path)`** in `lib/navigate.ts` — shared switch-view + open helper, riusato da DatabaseView (Table/Board) e GlobalGraph. Uno spot per evolvere a toast-based error surface.
- **`lib/graph-tuning.ts`** — costanti del global graph estratte (CANVAS_W/H, ZOOM_MIN/MAX, FIT_PADDING, LARGE_THRESHOLD, LABEL_TOP_DEGREE_QUANTILE, DIM_OPACITY) parallela a `lib/timings.ts`.

Total tests: **232** (140 core + 92 desktop). Was 190 in v0.3.

### Added

- **Renderer test suite Vitest + jsdom** in `apps/desktop` (`vitest.config.ts`, `src/test/setup.ts`, `src/test/mock-ipc.ts`). 50 test cases coprono `useSearchStore` (debounce 150ms, coalesce di rapid setQuery, sequence-number guard su risposte out-of-order, chooseSelected che apre nota + chiude palette, errori IPC), `useDatabaseStore` (mutator filtri, debounce 200ms, sequence-number guard, sottoscrizione vault con vault-switch e vault-close), `useTagsStore` (refresh, selectTag con last-click-wins, applyVaultEvent debounced, modulo-level subscription a `useVaultStore`), `useUiStore` (clamping width, toggle persistence, validator `loadPersisted` con localStorage corrotto / type-mismatch / clamp), e `lib/debounce.ts` (cancel/flush/trailing-edge invariants). Mock `window.synapsium` via `installMockIpc()` con stub returns + `vi.fn()` spies per ogni canale + simulazione push events. Total project test count: **190** (140 core + 50 desktop).

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
