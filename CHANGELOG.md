# Changelog

Tutte le modifiche notevoli a Ziba saranno documentate qui.

Il formato si basa su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e questo progetto aderisce a [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

### v0.6 Rebrand: synapsium → Ziba

The project is now called **Ziba**. All identifiers updated in lockstep:

- Package names: `synapsium` → `ziba`, `@synapsium/core` → `@ziba/core`, `synapsium-desktop` → `ziba-desktop`, `@synapsium/tsconfig` → `@ziba/tsconfig`.
- IPC bridge: `window.synapsium` → `window.ziba` (`SynapsiumApi` → `ZibaApi`).
- Vault cache directory: `INDEX_DIR_NAME` `.synapsium` → `.ziba`. Existing vaults will silently rebuild the index on first open under the new name; the old `.synapsium/` directory is left orphan and can be removed manually.
- CSS class prefix: `.synapsium-*` → `.ziba-*` (math, embed, wikilink styling).
- markdown-it rule key: `synapsium_math_inline` (registry flag and token name).
- electron-builder: `appId` `com.metaforismo.ziba`, `productName` `Ziba`.
- Repository URL: `metaforismo/Synapsium` → `metaforismo/Ziba` in `package.json` (`homepage`, `repository.url`).
- README, CHANGELOG, CONTRIBUTING, architecture doc, issue templates.

Tests, typecheck, and lint all clean post-rename. The local working directory keeps its `synapsium` path on disk because changing it isn't part of the codebase.

### v0.5.2 Fixed (review LOW items)

- **`Fragment` discriminated union** in `index-store-query.ts`: `predicate / always-false / always-true` variants. `buildWhereFragments` short-circuits to `always-false` when any filter (e.g. `in [ ]`) is unsatisfiable, and the SQLite adapter now skips the round-trip entirely. All array fields in the public shapes are `ReadonlyArray`.
- **`toSerializedError` double-prefix sanitiser**: strips a leading `[XYZ] ` from `IpcError.message` before re-wrapping with `[CODE]`. Without this, a manually-tagged message round-tripped as `[CODE] [XYZ] body` and the renderer's `ipcErrorMessage` only stripped the outer wrapper.
- **`columnForRhs` docstring** documents that ISO datetime strings (with `T`) route to `text_value`, not `date_value` — matching the indexer's strict 10-character calendar form. Caller's responsibility to trim if comparing against a date-typed property.

### v0.5.1 Fixed (post-review hardening)

After v0.5 a parallel review (4 specialised agents on diff 37e22d1) surfaced a handful of real issues. This commit closes them:

- **EmbedNodeView race recovery — null branch** (`EmbedNodeView.tsx`): when the post-ALREADY_EXISTS re-resolve returns `null` (a parallel gesture deleted the just-created note), state now falls back to `not-found` instead of surfacing the stale ALREADY_EXISTS message. When the recovery itself throws, the recovery error is shown — the original is no longer the actionable signal. Logic extracted to pure `attemptCreateNoteForEmbed(target, ipc)` (six new tests).
- **Sidebar mutations — narrowly-scoped catches** (`useSidebarMutations.ts`): each mutation is now a two-stage flow. Stage 1 (the IPC call) is the one whose failure the user sees as `Impossibile <verb>`. Stage 2 (refresh + follow-up open/close) runs through `runFollowUp(verb, fn)`, which logs and shows a non-blocking "operazione riuscita ma vista non aggiornata" alert on failure. Previously a stuck file watcher would mis-report a successful delete as "Impossibile eliminare la nota".
- **`clampQueryLimit` against NaN / Infinity** (`index-store-query.ts`): `Number.isFinite` guard prevents `LIMIT NaN` reaching SQLite and silently returning zero rows.
- **Whitespace-only folder filter** (`index-store-query.ts`): `query.folder = "   "` now treated as "no folder filter" instead of producing an unmatchable `"   /%"` LIKE.
- **`ipcErrorMessage` / `extractIpcErrorCode` accept plain `{ code, message }` objects**: a future serialization path (e.g. web build over service worker) won't silently degrade to "Errore sconosciuto" because the payload isn't an `Error` instance.
- **Defensive try/catch around `katex.renderToString`** (`MathRenderer.tsx`): with `throwOnError: false` + `strict: 'ignore'` KaTeX shouldn't throw, but a future major version could. Without the catch a throw escapes `useMemo` and unmounts every formula on the page. Caches an error sentinel so a hot-loop re-throw doesn't peg the renderer. Asserts `KATEX_CACHE_LIMIT > 0` at module load.

### v0.5.1 Changed (post-review hardening)

- **`KNOWN_CODES` derived from the `IpcErrorCode` union** via a const-as-keys table (`shared/ipc.ts` exports both `IpcErrorCode` and `IPC_ERROR_CODES: ReadonlySet<IpcErrorCode>` from one source). Eliminates the lockstep hazard where adding a code to the type but forgetting the set would silently treat the new code as "no code".
- **`BoardColumn` made `readonly`** with a private `MutableBoardColumn` for the build phase. Aligns with the v0.5 readonly propagation across the database views; the only mutation site (`distributeRows`) keeps its push semantics internally.

### v0.5.1 Tests

- `MathRenderer.test.ts` (5 cases): cache hit / displayMode-keyed / eviction at the 256 boundary / LRU touch reordering.
- `EmbedNodeView.test.ts` (+6 cases for `attemptCreateNoteForEmbed`): happy path, ALREADY_EXISTS+resolve-hits, ALREADY_EXISTS+resolve-null (race resolved differently), ALREADY_EXISTS+recovery-throws, non-recoverable error, ALREADY_EXISTS+loadNote-throws.
- `index-store-query.test.ts` (+4 cases): `clampQueryLimit` NaN / Infinity guards, folder whitespace handling.
- `ipc-error.test.ts` (+3 cases): plain-object inputs for both `extractIpcErrorCode` and `ipcErrorMessage`.

Total tests: **312** (140 core + 172 desktop). Was 294 at v0.5.

### v0.5 Fixed

- **Inline-math currency false positives** (`MathInline.ts`): the parser previously rejected `$5+$10$` only on the close side (`afterClose !== digit`), letting strings like `Pago $5+$10 totale` open a math span when the closer landed before whitespace. Added the symmetric Pandoc guard (`prev !== ASCII digit`) and extracted the scanner into a pure exported function `scanInlineMath(src, start)` for direct unit testing.
- **CalendarView DST anchor** (`CalendarView/helpers.ts`): every `Date` in `buildMonthGrid` is now anchored at local-noon (12:00). In locales where DST falls back across midnight (historical São Paulo, parts of Argentina/Cuba), `new Date(y, m, d)` with implicit-midnight could shift cells into the previous day; noon is never affected. Defense-in-depth, zero perf cost.
- **Embed preview rendering** (`EmbedNodeView.tsx`):
  - `![[Other]]` nested embeds now render as a compact pill (`.ziba-embed-nested`) instead of `!` + wikilink.
  - `renderPreview` defensively strips a leading `---\n…\n---` (or `...`) frontmatter block. `Note.content` is already body-only via gray-matter, but the function is exported and reachable from other call sites where this guard matters.
- **`![[]]` and frontmatter** stripping covered by 8 new tests in `EmbedNodeView.test.ts`.
- **EmbedNodeView ALREADY_EXISTS retry**: the "Crea nota" CTA used to surface the IPC error if a watcher event created the same note between `resolveTitle` returning null and the `createNote` call. Now intercepts `code === 'ALREADY_EXISTS'` and re-resolves + loads the existing note transparently.
- **IPC error code propagation** (`lib/ipc-error.ts` + IPC wrapper): the wrapper that translates main-process exceptions to the renderer now belt-and-braces the canonical code via two paths — own `code` property and a `[CODE] ` message prefix. Adds `extractIpcErrorCode(err)` and `ipcErrorMessage(err)`; every renderer call site that displays `err.message` now goes through the prefix-stripping helper.
- **Memo stability in DatabaseView/Board/Calendar**: replaced `result?.rows ?? []` (which allocated a fresh array per render) with frozen module-level `EMPTY_ROWS` / `EMPTY_GROUPS` constants. Public helper signatures (`buildMonthGrid`, `buildColumns`, `detectGroupType`, `detectColumnType`, FilterBar, Table) now accept `readonly DatabaseRow[]` / `readonly DatabaseGroup[]`.

### v0.5 Added

- **KaTeX render cache** (`MathRenderer.tsx`): module-level LRU map (256 entries, keyed on `${displayMode} ${formula}`) memoises `renderToString` output across node-view re-mounts. Vaults with many formulas no longer pay the parse cost on scroll / undo / selection changes.
- **`scanInlineMath(src, start)`** exported from `MathInline.ts` for direct testing of the inline-math recognition heuristic.
- **`extractIpcErrorCode(err)` + `ipcErrorMessage(err)`** in `lib/ipc-error.ts` (also exported `IpcErrorCode` from `shared/ipc.ts` as the single source of truth).

### v0.5 Changed

- **Sidebar split** (`Sidebar/index.tsx` 553 → 344 lines): CRUD wiring extracted to `useSidebarMutations()` (~160 lines, type `SidebarMutations`); the six dialog flows extracted to `<SidebarDialogs>` keyed on a `DialogState` discriminated union (~140 lines). The orchestrator file now reads top-to-bottom: layout → tree filter → keyboard nav → context menu → dialogs.
- **index-store query-builder split** (`index-store.sqlite.ts` 882 → 745 lines): all SQL fragment construction extracted to `electron/adapters/index-store-query.ts` — `columnForRhs`, `buildFilterFragment`, `buildWhereFragments`, `buildSortClause`, `clampQueryLimit`, plus `DEFAULT_QUERY_LIMIT` / `MAX_QUERY_LIMIT` constants. The new module is pure (no `better-sqlite3` import) and gets its own test file (27 cases).
- **Vitest renderer config** now also collects specs from `electron/**/*.test.ts` so pure-logic helpers in the main-process tree (e.g. the query-builder) are covered without spinning up Electron.

Total tests: **294** (140 core + 154 desktop). Was 233 at the close of v0.4.

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

- **Renderer test suite Vitest + jsdom** in `apps/desktop` (`vitest.config.ts`, `src/test/setup.ts`, `src/test/mock-ipc.ts`). 50 test cases coprono `useSearchStore` (debounce 150ms, coalesce di rapid setQuery, sequence-number guard su risposte out-of-order, chooseSelected che apre nota + chiude palette, errori IPC), `useDatabaseStore` (mutator filtri, debounce 200ms, sequence-number guard, sottoscrizione vault con vault-switch e vault-close), `useTagsStore` (refresh, selectTag con last-click-wins, applyVaultEvent debounced, modulo-level subscription a `useVaultStore`), `useUiStore` (clamping width, toggle persistence, validator `loadPersisted` con localStorage corrotto / type-mismatch / clamp), e `lib/debounce.ts` (cancel/flush/trailing-edge invariants). Mock `window.ziba` via `installMockIpc()` con stub returns + `vi.fn()` spies per ogni canale + simulazione push events. Total project test count: **190** (140 core + 50 desktop).

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
- **White screen on launch**: `electron/main.ts` cercava `preload.js` nella stessa directory di `main.js` ma electron-vite emette il preload come `out/preload/preload.mjs`. Senza preload, `window.ziba` era undefined e il primo IPC call schiantava React. Fix: path corretto + relax CSP in dev (Vite inietta inline scripts per React Refresh) tramite plugin Vite condizionale.
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
- Cache SQLite (`<vault>/.ziba/index.db`) per risoluzione titoli e backlink
- Adapter pattern in `packages/core` (Filesystem, IndexStore, Watcher) per riusabilità futura su web e mobile
- Build distributable via electron-builder per macOS (dmg+zip), Windows (NSIS), Linux (AppImage+deb)
- ESLint + Prettier + EditorConfig per uniformità del codice
- GitHub Actions CI: typecheck + lint + build su PR

[Unreleased]: https://github.com/metaforismo/Ziba/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/metaforismo/Ziba/releases/tag/v0.1.0
