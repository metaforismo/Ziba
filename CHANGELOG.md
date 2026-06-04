# Changelog

Tutte le modifiche notevoli a Ziba saranno documentate qui.

Il formato si basa su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e questo progetto aderisce a [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

### Added

- Grafo ispirato a SiYuan con default piu' ariosi, frecce visibili, modalita'
  globale/locale, refresh, ricerca compatta e fullscreen della surface.
- Pannello `Riferimenti` con sezioni Backlinks/Mentions, filtro, sort,
  conteggi e preview inline.
- Attribute Views salvate in `<vault>/.ziba/database-views.json`, con tab
  vista, layout `table | board | calendar | gallery`, colonne e query
  persistite.
- Controllo "Righe" nella DatabaseView, collegato a `DatabaseQuery.limit`.

## [1.0.1] - 2026-05-10

### Phase 2 followups

- Cache renderer-side per i tipi degli oggetti (`typedPaths`, `objectTypeSchemas`) — evita round-trip IPC ad ogni render.
- Hot-reload degli schemi `.ziba/schema/*.yml` senza reindex completo: chokidar notifica solo il file modificato e aggiorna `object_types` in-place.
- Toggle split centralizzato e derivazione slug centralizzata.

## [1.0.0] - 2026-05-11

### v1.0 Object-Relational Foundation

Ziba evolve da "Obsidian con extras" a object graph tipizzato. Ogni nota può
dichiararsi un oggetto tipizzato (`type:`) con relazioni tipizzate (`relations:`)
verso altri oggetti. Cinque fasi:

- **Phase 1 — Schema + indexer + relations table.** Nuova directory
  `<vault>/.ziba/schema/<type>.yml` per definire tipi (label, icon, color,
  properties, relations, inverse). Sette schemi seed (`note`, `person`,
  `book`, `project`, `idea`, `daily`, `meeting`). Tabella SQLite `relations`
  sostituisce `wikilinks` con `kind` tipizzato. Wikilink generici nel body
  restano backward-compatible come relazioni untyped (`kind = ''`).
- **Phase 2 — ObjectPanel + sidebar TypesSection.** Pannello laterale sulla
  nota corrente mostra properties dello schema + relazioni inverse. Nuova
  sezione sidebar "Tipi" con counts per tipo. Cache renderer-side
  (`typedPaths`, `objectTypeSchemas`).
- **Phase 3 — Editor type-icon + slash relation + PropertyEditor relations.**
  Icona di tipo decora i wikilink secondo lo schema del target. Slash menu
  `/relazione` per inserire relazioni tipizzate. PropertyEditor riconosce e
  gestisce `relations:`.
- **Phase 4 — Database view type filter + schema-aware columns.** Filtro
  page-level "Tipo: …" nella DatabaseView; le colonne suggerite seguono lo
  schema della nota.
- **Phase 5 — Constellation graph.** Grafo globale: cluster bias per tipo,
  hull colorati, filtro multi-select per kind di relazione, leggenda
  in overlay.

### Note d'uso

- **Schema soft, non hard.** Gli schemi sono documentazione + affordance UI,
  non validazione che rifiuta il salvataggio. Valori out-of-spec renderizzano
  best-effort.
- **Backward-compat.** Vault v0.x continuano a funzionare; le wikilink
  generiche restano nel grafo con `kind = ''`.

### Limitazioni note (da fixare in v1.x)

- Filtri "type" tra Sidebar, DatabaseView e GlobalGraph hanno store
  indipendenti — possono mostrare valori divergenti tra le view (issue noto;
  refactor verso uno slice condiviso pianificato per v1.1).
- Aliased relations (`[[Target|Display]]`) ora supportati a livello di
  helper ma non ancora esposti nei popup di inserimento. v1.1 aggiungerà
  i campi.

## [0.6.0] - 2026-04-15

### Rebrand: Synapsium → Ziba

- Nomi package: `synapsium` → `ziba`, `@synapsium/core` → `@ziba/core`, `synapsium-desktop` → `ziba-desktop`, `@synapsium/tsconfig` → `@ziba/tsconfig`.
- Bridge IPC: `window.synapsium` → `window.ziba` (`SynapsiumApi` → `ZibaApi`).
- Directory cache vault: `INDEX_DIR_NAME` `.synapsium` → `.ziba`. I vault esistenti ricostruiscono l'index al primo avvio; la vecchia `.synapsium/` rimane orfana e può essere rimossa manualmente.
- Prefisso CSS: `.synapsium-*` → `.ziba-*` (math, embed, wikilink styling).
- Chiave markdown-it rule: `synapsium_math_inline` aggiornata.
- electron-builder: `appId` `com.metaforismo.ziba`, `productName` `Ziba`.
- URL repository: `metaforismo/Synapsium` → `metaforismo/Ziba` in `package.json`.
- README, CHANGELOG, CONTRIBUTING, architecture doc, issue templates.

### v0.5.2 Fixed (review LOW items)

- **`Fragment` discriminated union** in `index-store-query.ts`: `predicate / always-false / always-true` variants. `buildWhereFragments` short-circuits to `always-false` quando un filtro (es. `in [ ]`) è unsatisfiable; il SQLite adapter salta il round-trip interamente. Tutti i campi array nelle forme pubbliche sono `ReadonlyArray`.
- **`toSerializedError` double-prefix sanitiser**: strip del `[XYZ] ` iniziale da `IpcError.message` prima di ri-wrappare con `[CODE]`. Senza questo, un messaggio tagged round-trippava come `[CODE] [XYZ] body`.
- **`columnForRhs` docstring** documenta che le stringhe ISO datetime (con `T`) vanno a `text_value`, non `date_value`.

### v0.5.1 Fixed (post-review hardening)

- **EmbedNodeView race recovery — null branch**: quando il re-resolve post-ALREADY_EXISTS ritorna `null`, lo stato ricade su `not-found` invece di mostrare il messaggio stale. Logica estratta in `attemptCreateNoteForEmbed(target, ipc)`.
- **Sidebar mutations — narrowly-scoped catches**: ogni mutazione è ora un flusso a due stadi. Stage 1 (call IPC) → errore visible. Stage 2 (refresh + follow-up) → log non-blocking.
- **`clampQueryLimit` contro NaN / Infinity**: guard `Number.isFinite` previene `LIMIT NaN` su SQLite.
- **Whitespace-only folder filter**: `query.folder = "   "` trattato come "nessun filtro cartella".
- **`ipcErrorMessage` / `extractIpcErrorCode` accettano plain `{ code, message }`**: path di serializzazione futura non degrada silenziosamente.
- **Defensive try/catch intorno a `katex.renderToString`**: con `throwOnError: false` KaTeX non dovrebbe lanciare, ma una versione major futura potrebbe. Cache un sentinel di errore per evitare hot-loop.

### v0.5 Fixed

- **Inline-math currency false positives**: guard Pandoc simmetrico (`prev !== ASCII digit`) estratto in `scanInlineMath(src, start)`.
- **CalendarView DST anchor**: ogni `Date` in `buildMonthGrid` è ora ancorata a local-noon (12:00).
- **Embed preview rendering**: `![[Other]]` nested render come pill compatta. `renderPreview` fa strip del frontmatter.
- **EmbedNodeView ALREADY_EXISTS retry**: intercetta `code === 'ALREADY_EXISTS'` e re-resolve trasparentemente.
- **IPC error code propagation**: il wrapper traduce eccezioni main-process al renderer con due path indipendenti (own `code` + `[CODE]` message prefix).
- **Memo stability in DatabaseView/Board/Calendar**: `EMPTY_ROWS` / `EMPTY_GROUPS` frozen const.

### v0.5 Added

- **KaTeX render cache**: LRU map a 256 entry per `renderToString`.
- **`scanInlineMath(src, start)`** esportata da `MathInline.ts`.
- **`extractIpcErrorCode(err)` + `ipcErrorMessage(err)`** in `lib/ipc-error.ts`.

### v0.5 Changed

- **Sidebar split**: `useSidebarMutations()` hook + `<SidebarDialogs>` component.
- **index-store query-builder split**: tutto il fragment SQL estratto in `index-store-query.ts` (modulo puro, niente `better-sqlite3`).

### v0.4 Added

- **Database sub-views** (`databaseViewMode`): tab Tabella / Board / Calendario nel Database header.
- **Board view (kanban)**: colonne raggruppate per `groupBy` property, drag-and-drop HTML5 nativo. Drop aggiorna il frontmatter via `ipc.saveNote`.
- **Calendar view**: griglia mensile Lun-Dom italiano. Buckets le note per ISO date.
- **Embed block** (`![[Target]]`): Tiptap atomic node che lazy-carica il target via IPC.
- **Math (KaTeX)**: `$$..$$` block + `$..$` inline con live-preview editor.
- **`navigateToNote(path)`** in `lib/navigate.ts`: helper condiviso tra DatabaseView e GlobalGraph.

### v0.3 Added

- **Database view**: FilterBar tipizzata, sort multi-key, group-by, ColumnPicker.
- **Grafo globale**: force-directed con pan/zoom imperativo, highlight 1-hop, search.
- **Callout block**: Tiptap node con 6 kinds. Markdown roundtrip Obsidian-compatible.
- **Property index tipizzato**: `note_properties` con colonne per tipo.
- **Query API**: `DatabaseQuery` con filter/sort/group/folder/limit.

### v0.2 Added

- **Search palette `Cmd/Ctrl+K`**: full-text search via SQLite FTS5.
- **Tag system**: `#tag` nel body o `tags: []` in frontmatter.
- **Property editor**: frontmatter come property tipizzate.
- **Slash menu `/`**: popup blocchi inseribili.
- **Mini-graph** locale (1-hop).

## [0.1.0] - In sviluppo

Prima release alpha della desktop app.

### Added

- Monorepo Turborepo + pnpm workspaces con `packages/core` e `apps/desktop`.
- Apertura e cambio vault con persistenza dell'ultimo aperto.
- File tree laterale con CRUD via context menu e navigazione tastiera.
- Editor Tiptap con markdown shortcut nativi.
- Wikilink `[[...]]` con autocomplete, navigazione, creazione automatica.
- Pannello backlinks live.
- Watcher chokidar con detection conflitti.
- Cache SQLite in `<vault>/.ziba/index.db`.
- Adapter pattern in `packages/core`.
- Build distributable via electron-builder per macOS, Windows, Linux.
- ESLint + Prettier + EditorConfig.
- GitHub Actions CI.

[Unreleased]: https://github.com/metaforismo/Ziba/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/metaforismo/Ziba/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/metaforismo/Ziba/compare/v0.6.0...v1.0.0
[0.6.0]: https://github.com/metaforismo/Ziba/compare/v0.1.0...v0.6.0
[0.1.0]: https://github.com/metaforismo/Ziba/releases/tag/v0.1.0
