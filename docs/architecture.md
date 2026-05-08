# Architettura di synapsium

Documento ad alto livello per chi vuole contribuire o capire come è strutturato il progetto. Per il setup pratico vedi [CONTRIBUTING.md](../CONTRIBUTING.md). Per la roadmap vedi [README.md](../README.md).

## Mappa mentale

```
┌─────────────────────────── Electron desktop app ───────────────────────────┐
│                                                                            │
│   Renderer (Chromium)                       Main (Node.js)                 │
│   ┌────────────────────┐                   ┌───────────────────────┐       │
│   │ React + Tiptap     │                   │ IPC handlers          │       │
│   │ Zustand stores     │  ◄── invoke ──►   │ ├─ vault              │       │
│   │ lib/ipc (typed)    │   contextBridge   │ ├─ notes              │       │
│   │                    │                   │ ├─ folder             │       │
│   │ window.synapsium   │  ──►  preload  ◄──│ ├─ links              │       │
│   └────────────────────┘                   │ ├─ search / tags      │       │
│                                            │ ├─ database / graph   │       │
│                                            │ └─ settings           │       │
│           ▲                                │                       │       │
│           │ webContents.send               │ adapters              │       │
│           │ (vault events,                 │ ├─ FilesystemAdapter  │       │
│           │  index progress)               │ ├─ IndexStoreAdapter  │       │
│           │                                │ └─ WatcherAdapter     │       │
│           │                                │                       │       │
│           │                                │ security              │       │
│           │                                │ ├─ assertVaultRelative│       │
│           │                                │ ├─ IpcError           │       │
│           │                                │ └─ toSerializedError  │       │
│           │                                └───────────┬───────────┘       │
└───────────┼─────────────────────────────────────────────┼──────────────────┘
            │                                              │
            │                                              ▼
            │                              ┌───────────────────────────────┐
            │                              │ Filesystem (vault/)           │
            │                              │  ├─ note1.md                  │
            │                              │  ├─ folder/note2.md           │
            │                              │  └─ .synapsium/index.db       │
            │                              │     (SQLite cache, ricostr.)  │
            │                              └───────────────────────────────┘
            │
            │                              ┌───────────────────────────────┐
            └──────────────────────────────│ packages/core (TS puro)       │
                                           │  zero dipendenze React/Electr.│
                                           │  ├─ types/                    │
                                           │  ├─ adapters/ (interfacce)    │
                                           │  ├─ markdown/ (+ tags)        │
                                           │  ├─ query/ (DB query AST)     │
                                           │  ├─ vault/                    │
                                           │  └─ index-store/ (schema SQL) │
                                           └───────────────────────────────┘
```

## Tre invarianti che governano tutto

### 1. Source of truth = filesystem

I file `.md` sono *sempre* l'autorità. La cache SQLite (`<vault>/.synapsium/index.db`) è solo un acceleratore di query (resolveTitle, backlinks, list). Cancellabile senza perdere niente — viene ricostruita all'apertura del vault.

Conseguenze:
- Le mutazioni vanno *prima* a disco, *poi* aggiornano l'index. Mai il contrario.
- Se l'index e il disco divergono (es. crash a metà di una scrittura), un `reindexVault` è sempre ok.
- I path nelle interfacce di `packages/core` sono **vault-relative con forward slash**, indipendentemente dal sistema operativo. La conversione a path assoluti vive negli adapter.

### 2. `packages/core` non sa nulla della piattaforma

Le interfacce definite in `packages/core/src/adapters/`:

```ts
interface FilesystemAdapter {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  // …
}

interface IndexStoreAdapter {
  upsertNote(note: Omit<Note, 'content'>): Promise<void>;
  getBacklinks(targetPath: NotePath): Promise<…>;
  // …
}

interface WatcherAdapter {
  start(vaultRoot: string, onEvent: …): Promise<void>;
}
```

Ogni piattaforma fornisce la propria implementazione:

| Piattaforma | Filesystem | IndexStore | Watcher |
|---|---|---|---|
| Desktop (Electron) | `node:fs/promises` | better-sqlite3 (sync, in main proc) | chokidar |
| Web (futuro) | File System Access API + IndexedDB fallback | sql.js / IndexedDB | custom (FS Access API events) |
| Mobile (futuro) | Expo FileSystem | expo-sqlite | Expo file events |

**Aggiungere una nuova piattaforma = scrivere solo gli adapter, niente modifiche a core.**

### 3. La frontiera IPC è il confine di sicurezza

Il renderer è considerato non-fidato (XSS via markdown malevolo, plugin futuri, ecc.). Tutto ciò che arriva al main process via IPC viene:

1. **Tipato** dal contratto in `apps/desktop/shared/ipc.ts` — niente più "untyped any" tra main e renderer.
2. **Validato** dai helper in `apps/desktop/electron/security.ts`:
   - `assertVaultRelative(path)` — rifiuta path con `..`, leading `/`, drive Windows, NUL byte.
   - `assertResolvedWithinVault(root, abs)` — defence in depth dopo `path.resolve`.
3. **Sanitizzato sui ritorni**: errori thrown dagli handler diventano `{ code, message }` traducibili. Stack trace e path assoluti restano nel main process.

Vedi `apps/desktop/electron/ipc/notes.ts` per il pattern: ogni handler chiama `assertVaultRelative(args.path)` come prima cosa.

## Flussi chiave

### Apertura di un vault

```
Renderer (Sidebar/EmptyState)
   │ ipc.pickVaultFolder()
   ▼
Main: dialog.showOpenDialog() ──► path utente
   │
   │ ipc.openVault({ root })
   ▼
Main: openVault()
   ├─ teardown() del vault precedente (se esiste)
   ├─ stat-check sul path (no filesystem root, deve essere directory)
   ├─ inizializza FilesystemAdapter, IndexStore (apre/crea index.db)
   ├─ indexVault() ── push progress eventi ──► renderer
   ├─ avvia ChokidarWatcher ── eventi (filtrati per self-write) ──► renderer
   └─ persiste in recent-vaults.json
   ▼
Renderer riceve VaultInfo, popola sidebar via listNotes()
```

### Scrittura di una nota

```
Renderer (Editor, autosave)
   │ ipc.saveNote({ path, body, frontmatter })
   ▼
Main: saveNote()
   ├─ assertVaultRelative(path) + assertResolvedWithinVault(...)
   ├─ markSelfWrite(path)        ← previene self-watcher echo
   ├─ coreSaveNote() scrive il file (.md) sul disco
   ├─ stat() per leggere il vero mtime
   └─ reindexSingle() aggiorna l'index (note + wikilinks)
   ▼
Watcher emette `change` per il path
Main: consumeIfSelfWrite(path) → true → evento NON forwardato al renderer
   (l'editor ha già il mtime aggiornato; un evento qui causerebbe un falso conflitto)
```

### Wikilink autocomplete

```
Renderer (Tiptap editor)
   │ utente digita `[[`
   ▼
WikilinkSuggestion plugin: cattura il prefisso "[[Foo"
   │ ipc.searchByTitle({ prefix: "Foo", limit: 8 })
   ▼
Main: searchByTitle()
   ├─ clamp limit a [1, 100]
   └─ store.searchNotesByTitle(prefix, limit) ── SQLite LIKE su LOWER(title)
   ▼
Renderer riceve NoteSummary[], mostra WikilinkPopup
   │ utente seleziona
   ▼
Tiptap inserisce il custom Wikilink node (target = "Foo")
   ▼
useResolvedWikilinks hook: ipc.resolveTitle({ title }) per ogni link
   → aggiorna editor.storage.wikilink.resolved (true | false)
   → renderHTML stila link rotti diversamente
```

### Database query (v0.3)

```
Renderer (DatabaseView)
   │ utente edita un filtro (eq/contains/has/lacks/lt/gt/lte/gte)
   ▼
useDatabaseStore.{addFilter|setSort|setGroupBy|...}
   │ debounced 200ms
   ▼
ipc.runDatabaseQuery({ query: { filters, sort, groupBy, folder, limit } })
   ▼
Main: runDatabaseQuery() in electron/ipc/database.ts
   ├─ valida filter keys non-empty (errore INVALID_QUERY)
   ├─ clampa limit [1, 5000]
   └─ store.runQuery(query) → SQL builder
       ├─ EXISTS subquery per ogni filter su note_properties
       ├─ LEFT JOIN per ogni sort key (mixed-type COALESCE)
       └─ GROUP BY + COUNT su prop_value (se groupBy set)
   ▼
Renderer riceve DatabaseResult { rows, groups, totalCount }
   ▼
Table.tsx renderizza rows con cell type-aware
```

### Grafo globale (v0.3)

```
Renderer (GlobalGraph), su mount o vault event:
   │ ipc.getFullGraph()
   ▼
Main: getFullGraph()
   └─ store.getFullGraph() →
       SELECT path, title FROM notes
       SELECT source_path, target_path, target_title FROM wikilinks
              WHERE target_path IS NOT NULL    ← solo edge risolti
   ▼
Renderer riceve { nodes, edges }
   │ runGlobalLayout() — riusa simulateLayout di MiniGraph/layout.ts
   │   con tuning vault-scale (n→iterations: 200/400/600/800)
   ▼
Canvas.tsx renderizza SVG con <g transform> imperativo
   pan/zoom non ri-rendera React → 1000+ nodi reggono
```

### Callout block (v0.3)

```
Editor: utente fa /callout-tip
   ▼
SlashCommand.runSlashCommand("callout-tip"):
   editor.commands.insertCallout({ kind: 'tip' })
   ▼
Tiptap inserisce un nodo Callout con attrs.kind='tip'
   ▼
Su save: tiptap-markdown chiama Callout.storage.markdown.serialize:
   state.write('> [!tip]\n')
   state.wrapBlock('> ', null, node, () => ...)
   → output:
        > [!tip]
        > body content
   ▼
Su load di un .md con `> [!kind]\n> body`:
   markdown-it core ruler synapsium_callout intercetta blockquote_open,
   converte in callout_open con attrs.kind, strip della marker line
```

## Modello dati

```ts
// packages/core/src/types/note.ts
type NotePath = string; // sempre vault-relative, sempre forward slash

type Note = {
  path: NotePath;
  title: string;          // frontmatter.title > primo H1 > basename
  frontmatter: Record<string, unknown>;
  content: string;        // body markdown senza frontmatter
  wikilinks: string[];    // target raw da [[...]]
  mtimeMs: number;
};
```

### Schema SQLite (cache)

```sql
-- v0.1
CREATE TABLE notes (
  path TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  frontmatter_json TEXT NOT NULL DEFAULT '{}',
  mtime INTEGER NOT NULL
);

CREATE TABLE wikilinks (
  source_path TEXT NOT NULL,
  target_title TEXT NOT NULL,
  target_path TEXT,                   -- NULL se "broken" (titolo non trovato)
  PRIMARY KEY (source_path, target_title)
);

CREATE INDEX idx_notes_title ON notes(LOWER(title));
CREATE INDEX idx_wikilinks_target ON wikilinks(LOWER(target_title));
CREATE INDEX idx_wikilinks_target_path ON wikilinks(target_path);

-- v0.2 — full-text search (FTS5) + tags
CREATE VIRTUAL TABLE notes_fts USING fts5(
  path UNINDEXED, title, body,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE tags (
  source_path TEXT NOT NULL,
  tag TEXT NOT NULL,                  -- canonical lowercase
  display_tag TEXT NOT NULL,
  PRIMARY KEY (source_path, tag),
  FOREIGN KEY (source_path) REFERENCES notes(path) ON DELETE CASCADE
);
CREATE INDEX idx_tags_tag ON tags(tag);

-- v0.3 — typed property index per query database view
CREATE TABLE note_properties (
  source_path TEXT NOT NULL,
  prop_key TEXT NOT NULL,
  prop_type TEXT NOT NULL,            -- text|number|boolean|date|url|string-array
  text_value TEXT,
  number_value REAL,
  boolean_value INTEGER,
  date_value TEXT,                    -- ISO YYYY-MM-DD
  array_value TEXT,                   -- JSON-encoded string[]
  PRIMARY KEY (source_path, prop_key),
  FOREIGN KEY (source_path) REFERENCES notes(path) ON DELETE CASCADE
);
CREATE INDEX idx_note_props_key    ON note_properties(prop_key);
CREATE INDEX idx_note_props_text   ON note_properties(prop_key, text_value);
CREATE INDEX idx_note_props_number ON note_properties(prop_key, number_value);
CREATE INDEX idx_note_props_date   ON note_properties(prop_key, date_value);
```

Tutti gli statement usano `IF NOT EXISTS` (omesso sopra per leggibilità) — vault esistenti aggiungono le nuove tabelle on-open senza migration script. La popolazione iniziale di `notes_fts`/`tags`/`note_properties` per vault già aperti avviene lazy: la prossima save di una nota popola la sua riga, oppure si esegue `vault:reindex` (IPC esistente) per ricostruire tutto.

Lo schema è in `packages/core/src/index-store/schema.ts` come stringa SQL pura — `packages/core` non importa `better-sqlite3`. Il binding al driver vive in `apps/desktop/electron/adapters/index-store.sqlite.ts`.

## State management nel renderer

Sei store Zustand, ognuno con una sola responsabilità:

| Store | File | Cosa contiene |
|---|---|---|
| `useVaultStore` | `stores/vault.ts` | Vault corrente, lista note, recent vaults, progresso indicizzazione. Coalesce gli eventi watcher in refresh debouncing (`VAULT_EVENT_REFRESH_MS`). |
| `useEditorStore` | `stores/editor.ts` | Path/Note correnti aperti, dirty flag, errore di save. Gestisce l'apply degli external change. |
| `useUiStore` | `stores/ui.ts` | Larghezza pannelli, backlinks aperto/chiuso, cartelle espanse, `mainView` (editor/database/graph), `rightPaneTab`, `tagsExpanded`. Persistito in localStorage chiave `synapsium.ui.v1`. |
| `useSearchStore` | `stores/search.ts` | Cmd+K palette: open/query/results/selectedIndex/loading. Debounce 150ms (`SEARCH_DEBOUNCE_MS`), sequence-number guard. |
| `useTagsStore` | `stores/tags.ts` | Lista tag + count, tag selezionato, note del tag. Module-level subscribe a `useVaultStore` per refresh on vault switch e watcher events. |
| `useDatabaseStore` | `stores/database.ts` | DatabaseView: query state (filters/sort/groupBy/folder), `result`, `loading`, `error`, `availableProperties`. Auto-debounced run su ogni mutation (`DATABASE_QUERY_DEBOUNCE_MS=200`). |

Niente Redux, niente Context grandi. Un componente che ha bisogno di stato ne sottoscrive un selettore preciso e si re-renderizza solo quando quel pezzo cambia.

## Fonti di verità per le timing constants

Tutti i debounce / throttle UI vivono in `apps/desktop/src/lib/timings.ts` con un commento sul *perché* di quel valore. Cambiare un timing → cambiare un solo file.

## Cosa NON c'è (per ora)

Per evitare di reinventare la ruota:
- **Niente plugin system.** v1.0+. Per estendere ora, fork.
- **Niente sync server.** v1.0+. Per ora si usa Dropbox/iCloud/Drive sopra il vault.
- **Niente AI nativa.** v1.x. La struttura `packages/core` è pronta a ospitare embeddings, ma non li implementiamo finché v0.3 non è stabile.
- **Niente i18n.** L'app parla italiano. Quando serve i18n, apriamo una Discussion.

## Decision log riassunto

Le decisioni grosse vissute durante v0.1-v0.3, riassunte:

**v0.1**
- **Electron, non Tauri.** Ecosistema npm completo, AI futura facile via Node, contributor pool ampio. Costo accettato: binary più grande.
- **Tiptap, non CodeMirror.** Block editor da subito → niente rewrite quando arriva il `/`-menu in v0.2. Tiptap supporta markdown shortcut nativi (`# `, `**`) quindi la UX è "Notion + Obsidian fusi", non una scelta forzata fra i due.
- **better-sqlite3 sync, non async.** Siamo nel main process, una query è < 1ms, async aggiunge solo overhead. Le interfacce di core sono comunque async per non legare core a SQLite.
- **Wikilink come Tiptap node, non Decoration.** Roundtrip markdown perfetto via custom serialize, click delegation pulita su `[data-wikilink]`, atomic delete con Backspace. Un po' più di codice ma gestibile.

**v0.2**
- **FTS5, non FTS3/4 o ricerca custom.** SQLite FTS5 ha snippet() built-in con highlight, scoring rank decente, sintassi booleana familiare. Il query escaping richiede un piccolo helper.
- **Tag come Decoration, non Mark.** Markdown sul disco resta `#tag` plain — niente custom serialize nel markdown roundtrip. Solo un decoration plugin che applica `.synapsium-tag` ai pattern matchati.
- **Property editor con detection lazy.** Il tipo è derivato dal valore (boolean → number → date → URL → string-array → text) con override manuale per row. Salvataggio su disco resta YAML standard — nessun lock-in al nostro modello.

**v0.3**
- **Property index in colonne tipizzate, non JSON.** `note_properties` ha `text_value`/`number_value`/`boolean_value`/`date_value`/`array_value` separate. Permette query veloci tramite indici dedicati per tipo. JSON sarebbe più flessibile ma forzerebbe scan O(n) su query range.
- **Database view come overlay sul mainView, non come "view file".** Niente file `.synapsium/views/*.json` — la query è in-memory nel renderer. Più semplice per v0.3; salvabili come "saved queries" in v0.4 se serve.
- **Global graph riusa MiniGraph layout, non Barnes-Hut.** Il simulatore O(n²) basta fino a ~1000 nodi. Sopra emette `console.warn`. Quando un vault reale lo richiede, sostituiamo con BH dietro la stessa interfaccia `simulateLayout`.
- **Callout markdown roundtrip via markdown-it core ruler.** Convertiamo `> [!kind]\n> body` ↔ Tiptap node senza modificare il body markdown stesso. Compatibilità completa con Obsidian e GitHub (entrambi rendono `> [!tip]`).

Per un decision log strutturato (ADR style) potremmo aggiungere `docs/adr/` se la complessità cresce.

## Per orientarsi nel codice

Quando devi capire come funziona qualcosa, parti da questi file:

- "Come si apre un vault?" → `apps/desktop/electron/ipc/vault.ts:openVault`
- "Come funziona l'autocomplete dei wikilink?" → `apps/desktop/src/components/Editor/extensions/WikilinkSuggestion.ts`
- "Come funziona il roundtrip markdown?" → `apps/desktop/src/components/Editor/extensions/Wikilink.ts` + `packages/core/src/markdown/wikilinks.ts`
- "Come arrivano i backlinks?" → `apps/desktop/electron/ipc/links.ts:getBacklinks`
- "Come funziona la search Cmd+K?" → `apps/desktop/src/stores/search.ts` + `electron/ipc/search.ts` (FTS5 escape in `adapters/index-store.sqlite.ts:escapeFts5Query`)
- "Come si estraggono i tag dal markdown?" → `packages/core/src/markdown/tags.ts:extractTags`
- "Come funziona il property editor?" → `apps/desktop/src/components/PropertyEditor/types.ts:detectPropertyType` + UI in `PropertyEditor/index.tsx`
- "Come funziona la query database (v0.3)?" → `packages/core/src/query/index.ts` (AST + detectProperty) + SQL builder in `apps/desktop/electron/adapters/index-store.sqlite.ts:runQuery`
- "Come renderizza il grafo globale (v0.3)?" → `apps/desktop/src/components/GlobalGraph/index.tsx` (orchestration) + `Canvas.tsx` (SVG + pan/zoom imperativo) + `layout.ts` (riusa MiniGraph simulator)
- "Come fa il callout markdown roundtrip (v0.3)?" → `apps/desktop/src/components/Editor/extensions/Callout.ts` (markdown-it core ruler + custom serialize)
- "Dove vivono le decisioni di sicurezza?" → `apps/desktop/electron/security.ts`
- "Dove sono i tipi del contratto IPC?" → `apps/desktop/shared/ipc.ts`
