# Architettura di Ziba

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
│   │ window.ziba        │  ──►  preload  ◄──│ ├─ links              │       │
│   └────────────────────┘                   │ ├─ search / tags      │       │
│                                            │ ├─ database / graph   │       │
│                                            │ ├─ types / relations  │       │
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
            │                              │  └─ .ziba/                    │
            │                              │      ├─ index.db  (cache SQL) │
            │                              │      └─ schema/               │
            │                              │          ├─ book.yml          │
            │                              │          └─ person.yml        │
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
                                           │  ├─ index-store/ (schema SQL) │
                                           │  └─ seed-schemas/             │
                                           └───────────────────────────────┘
```

## Tre invarianti che governano tutto

### 1. Source of truth = filesystem

I file `.md` sono *sempre* l'autorità. La cache SQLite (`<vault>/.ziba/index.db`) è solo un acceleratore di query (resolveTitle, backlinks, list). Cancellabile senza perdere niente — viene ricostruita all'apertura del vault.

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
   ├─ carica schemi da .ziba/schema/*.yml → popola object_types
   ├─ indexVault() ── push progress eventi ──► renderer
   ├─ avvia ChokidarWatcher ── eventi (filtrati per self-write) ──► renderer
   └─ persiste in recent-vaults.json
   ▼
Renderer riceve VaultInfo, popola sidebar via listNotes()
Renderer riceve typedPaths + objectTypeSchemas via types:list
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
   └─ reindexSingle() aggiorna l'index (note + relations + object_types)
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
   → legge editor.storage.wikilink.typeIconByPath per mostrare icona tipo
```

### Database query (v0.3)

```
Renderer (DatabaseView)
   │ utente edita un filtro (eq/contains/has/lacks/lt/gt/lte/gte)
   ▼
useDatabaseStore.{addFilter|setSort|setGroupBy|...}
   │ debounced 200ms
   ▼
ipc.runDatabaseQuery({ query: { filters, sort, groupBy, folder, typeFilter, limit } })
   ▼
Main: runDatabaseQuery() in electron/ipc/database.ts
   ├─ valida filter keys non-empty (errore INVALID_QUERY)
   ├─ clampa limit [1, 5000]
   └─ store.runQuery(query) → SQL builder
       ├─ EXISTS subquery per ogni filter su note_properties
       ├─ LEFT JOIN per ogni sort key (mixed-type COALESCE)
       ├─ JOIN su notes.path con relations per typeFilter (v1.0)
       └─ GROUP BY + COUNT su prop_value (se groupBy set)
   ▼
Renderer riceve DatabaseResult { rows, groups, totalCount }
   ▼
Table.tsx renderizza rows con cell type-aware
```

### Grafo globale (v0.3 + constellation mode v1.0)

```
Renderer (GlobalGraph), su mount o vault event:
   │ ipc.getFullGraph()
   ▼
Main: getFullGraph()
   └─ store.getFullGraph() →
       SELECT path, title, frontmatter_json FROM notes
       SELECT source_path, target_path, target_title, kind FROM relations
              WHERE target_path IS NOT NULL    ← solo edge risolti
   ▼
Renderer riceve { nodes, edges }
   │ runGlobalLayout() — riusa simulateLayout di MiniGraph/layout.ts
   │   con cluster bias per tipo (v1.0): nodi dello stesso tipo
   │   partono vicini via forza attrattiva aggiuntiva
   ▼
Canvas.tsx renderizza SVG con <g transform> imperativo
   pan/zoom non ri-rendera React → 1000+ nodi reggono
   ▼
HullsLayer.tsx disegna un convex hull per tipo (colore da schema)
KindFilterDropdown + Legend filtrano gli edge per kind
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
   markdown-it core ruler ziba_callout intercetta blockquote_open,
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
  wikilinks: string[];    // target raw da [[...]] (generico)
  mtimeMs: number;
};
```

### Frontmatter v1.0

Con v1.0 una nota può dichiarare:

```yaml
---
type: book          # slug che referenzia .ziba/schema/book.yml
title: The Hobbit
year: 1937
relations:
  author: "[[Tolkien]]"        # relazione scalare
  genres:                      # relazione multipla
    - "[[Fantasy]]"
    - "[[Adventure]]"
---
```

Il campo `type:` è opzionale. Se assente, la nota è indicizzata normalmente e i suoi wikilink nel body diventano relazioni di `kind = ''`.

Il campo `relations:` è opzionale. I wikilink nel body (al di fuori di `relations:`) vengono anch'essi indicizzati come relazioni untyped per mantenere la backward-compat con i vault v0.x.

### Schema SQLite (cache)

```sql
-- v0.1
CREATE TABLE IF NOT EXISTS notes (
  path             TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  frontmatter_json TEXT NOT NULL DEFAULT '{}',
  mtime            INTEGER NOT NULL
);

-- v1.0: sostituisce `wikilinks`. La tabella legacy viene droppata
-- alla prima apertura di un vault v1.0 (MIGRATION_DROP_SQL).
-- `kind` è NOT NULL con sentinel '' per wikilink generici del body.
-- SQLite PRIMARY KEY richiede riferimenti a colonne (non espressioni),
-- quindi "untyped" è codificato come '' anziché NULL.
CREATE TABLE IF NOT EXISTS relations (
  source_path  TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT '',
  target_title TEXT NOT NULL,
  target_path  TEXT,
  PRIMARY KEY (source_path, kind, target_title),
  FOREIGN KEY (source_path) REFERENCES notes(path) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_relations_target_title ON relations(target_title);
CREATE INDEX IF NOT EXISTS idx_relations_target_path  ON relations(target_path, kind);
CREATE INDEX IF NOT EXISTS idx_relations_kind         ON relations(kind) WHERE kind <> '';

CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);

-- v1.0: cache degli schemi da <vault>/.ziba/schema/*.yml.
-- Caricata all'apertura del vault; aggiornata in-place da hot-reload.
-- Consumata da sidebar TypesSection (counts) e autocomplete editor.
CREATE TABLE IF NOT EXISTS object_types (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  icon        TEXT,
  color       TEXT,
  schema_json TEXT NOT NULL,
  mtime       INTEGER NOT NULL
);

-- Full-text search via FTS5
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  path UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Tags (una riga per nota × tag)
CREATE TABLE IF NOT EXISTS tags (
  source_path TEXT NOT NULL,
  tag         TEXT NOT NULL,        -- canonical lowercase
  display_tag TEXT NOT NULL,
  PRIMARY KEY (source_path, tag),
  FOREIGN KEY (source_path) REFERENCES notes(path) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);

-- v0.3: property index tipizzato per query database view
CREATE TABLE IF NOT EXISTS note_properties (
  source_path  TEXT NOT NULL,
  prop_key     TEXT NOT NULL,
  prop_type    TEXT NOT NULL,       -- text|number|boolean|date|url|string-array
  text_value   TEXT,
  number_value REAL,
  boolean_value INTEGER,
  date_value   TEXT,               -- ISO YYYY-MM-DD
  array_value  TEXT,               -- JSON-encoded string[]
  PRIMARY KEY (source_path, prop_key),
  FOREIGN KEY (source_path) REFERENCES notes(path) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_note_props_key    ON note_properties(prop_key);
CREATE INDEX IF NOT EXISTS idx_note_props_text   ON note_properties(prop_key, text_value);
CREATE INDEX IF NOT EXISTS idx_note_props_number ON note_properties(prop_key, number_value);
CREATE INDEX IF NOT EXISTS idx_note_props_date   ON note_properties(prop_key, date_value);
```

Tutti gli statement usano `IF NOT EXISTS` (omesso sopra per leggibilità) — vault esistenti aggiungono le nuove tabelle on-open senza migration script esplicito. Quando la versione dello schema (`EXPECTED_USER_VERSION`) sale, `MIGRATION_DROP_SQL` droppa e ricostruisce le tabelle cache — i file `.md` sul disco sono l'autorità, quindi nessun dato viene perso.

Lo schema è in `packages/core/src/index-store/schema.ts` come stringa SQL pura — `packages/core` non importa `better-sqlite3`. Il binding al driver vive in `apps/desktop/electron/adapters/index-store.sqlite.ts`.

## Schema files (.ziba/schema/*.yml)

Ogni tipo di oggetto è descritto da un file YAML in `<vault>/.ziba/schema/<id>.yml`. Il ciclo di vita è:

1. **Vault open**: il main process legge tutti i file `.yml` in `.ziba/schema/`, li parsa con `parseSchemaYaml` (da `packages/core/src/types/schema.ts`), e fa upsert in `object_types`.
2. **Hot-reload**: chokidar watch su `.ziba/schema/`. Quando un file cambia, solo quel tipo viene ricaricato e `object_types` aggiornato in-place — niente full reindex.
3. **Vault nuovo / schema assenti**: se `.ziba/schema/` è vuota, i sette seed schemas vengono copiati dal bundle (`packages/core/src/seed-schemas/`).
4. **Errori**: `parseSchemaYaml` restituisce `{ ok: false, errors }` invece di lanciare — il loader segnala ogni schema rotto in un singolo pass invece di fermarsi al primo.

La forma YAML valida:

```yaml
id: book            # slug ^[a-z][a-z0-9-]*$, obbligatorio
label: Libro        # display name, obbligatorio
icon: 📖            # emoji o stringa ≤ 2 char, opzionale
color: "#6366f1"    # hex CSS #RRGGBB, opzionale
properties:
  year:
    type: number    # text|number|boolean|date|url|string-array
    required: true  # opzionale — avvisa ma non blocca il salvataggio
    label: Anno     # opzionale — label nell'ObjectPanel
relations:
  author:
    target: person  # id del tipo atteso (soft — non validato a salvataggio)
    multiple: false # default false — accetta lista se true
    label: Autore
inverse:
  cited_by:
    reverse_of: cites  # kind su cui fare la join inversa
    label: Citato da
```

## Renderer caches (v1.0)

Tre cache nel renderer evitano round-trip IPC ridondanti:

| Cache | Dove vive | Cosa contiene | Quando si aggiorna |
|---|---|---|---|
| `useVaultStore.typedPaths` | `stores/vault.ts` | Set di `NotePath` per le note che hanno `type:` | Al vault open via `notes:typedPaths`; su vault event debounced |
| `useTagsStore.objectTypeSchemas` | `stores/tags.ts` | `Map<id, ObjectTypeSchema>` di tutti i tipi caricati | Al vault open via `types:list`; su hot-reload schema (vault event) |
| `editor.storage.wikilink.typeIconByPath` | Tiptap extension `Wikilink.ts` | `Map<NotePath, string>` path → icona tipo | Aggiornato dalla extension dopo ogni risoluzione wikilink |

## Canali IPC (v1.0 additions)

Oltre ai canali esistenti (vault/notes/folder/links/search/tags/database/graph), v1.0 aggiunge:

| Canale | Direzione | Descrizione |
|---|---|---|
| `notes:typedPaths` | main → renderer | Array di `NotePath` per le note con `type:` nel frontmatter |
| `types:list` | renderer → main | Ritorna tutti gli `ObjectTypeSchema` caricati |
| `types:counts` | renderer → main | Mappa `id → count` delle note per tipo |
| `types:upsert` | renderer → main | Salva o aggiorna uno schema (interno, usato da hot-reload) |
| `types:delete` | renderer → main | Rimuove un tipo dall'index (quando il file schema viene cancellato) |
| `relations:bySource` | renderer → main | Tutte le relazioni partenti da `source_path` |
| `relations:byTarget` | renderer → main | Tutte le relazioni in arrivo su `target_path` (backlinks tipizzati) |

## State management nel renderer

Sei store Zustand, ognuno con una sola responsabilità:

| Store | File | Cosa contiene |
|---|---|---|
| `useVaultStore` | `stores/vault.ts` | Vault corrente, lista note, recent vaults, progresso indicizzazione, `typedPaths`. Coalesce gli eventi watcher in refresh debouncing (`VAULT_EVENT_REFRESH_MS`). |
| `useEditorStore` | `stores/editor.ts` | Path/Note correnti aperti, dirty flag, errore di save. Gestisce l'apply degli external change. |
| `useUiStore` | `stores/ui.ts` | Larghezza pannelli, backlinks aperto/chiuso, cartelle espanse, `mainView` (editor/database/graph), `rightPaneTab`, `tagsExpanded`. Persistito in localStorage chiave `ziba.ui.v1`. |
| `useSearchStore` | `stores/search.ts` | Cmd+K palette: open/query/results/selectedIndex/loading. Debounce 150ms (`SEARCH_DEBOUNCE_MS`), sequence-number guard. |
| `useTagsStore` | `stores/tags.ts` | Lista tag + count, tag selezionato, note del tag, `objectTypeSchemas`. Module-level subscribe a `useVaultStore` per refresh on vault switch e watcher events. |
| `useDatabaseStore` | `stores/database.ts` | DatabaseView: query state (filters/sort/groupBy/folder/typeFilter), `result`, `loading`, `error`, `availableProperties`. Auto-debounced run su ogni mutation (`DATABASE_QUERY_DEBOUNCE_MS=200`). |

Niente Redux, niente Context grandi. Un componente che ha bisogno di stato ne sottoscrive un selettore preciso e si re-renderizza solo quando quel pezzo cambia.

## Superfici UI aggiunte in v1.0

| Componente | Dove | Cosa fa |
|---|---|---|
| `ObjectPanel` | Right pane, tab "Oggetto" | Mostra properties schema + relazioni inverse della nota corrente |
| `TypesSection` | Sidebar | Sezione collapsible con counts per tipo; click filtra la file tree |
| `TypeFilterDropdown` | DatabaseView header | Filtro per `type:` applicato prima della query |
| `TypeChips` | GlobalGraph overlay | Chips per tipo visibile; toggle per mostrare/nascondere gli hull |
| `KindFilterDropdown` | GlobalGraph toolbar | Multi-select per kind di relazione nel grafo |
| `Legend` | GlobalGraph overlay | Legenda colori tipo + kind |
| `HullsLayer` | GlobalGraph canvas | Convex hull SVG colorati per tipo, disegnati sotto i nodi |

## Fonti di verità per le timing constants

Tutti i debounce / throttle UI vivono in `apps/desktop/src/lib/timings.ts` con un commento sul *perché* di quel valore. Cambiare un timing → cambiare un solo file.

## Cosa NON c'è (per ora)

Per evitare di reinventare la ruota:
- **Niente plugin system.** v1.x. L'object model fornisce ora la base strutturale.
- **Niente sync server.** v1.x. Per ora si usa Dropbox/iCloud/Drive sopra il vault.
- **Niente AI nativa.** v1.x. La struttura `packages/core` è pronta a ospitare embeddings.
- **Niente i18n.** L'app parla italiano. Quando serve i18n, apriamo una Discussion.
- **Niente filter unification.** v1.1. Sidebar, DatabaseView e GlobalGraph hanno `selectedType` store indipendenti — refactor pianificato.

## Decision log riassunto

Le decisioni grosse vissute durante v0.1-v1.0, riassunte:

**v0.1**
- **Electron, non Tauri.** Ecosistema npm completo, AI futura facile via Node, contributor pool ampio. Costo accettato: binary più grande.
- **Tiptap, non CodeMirror.** Block editor da subito → niente rewrite quando arriva il `/`-menu in v0.2. Tiptap supporta markdown shortcut nativi (`# `, `**`) quindi la UX è "Notion + Obsidian fusi", non una scelta forzata fra i due.
- **better-sqlite3 sync, non async.** Siamo nel main process, una query è < 1ms, async aggiunge solo overhead. Le interfacce di core sono comunque async per non legare core a SQLite.
- **Wikilink come Tiptap node, non Decoration.** Roundtrip markdown perfetto via custom serialize, click delegation pulita su `[data-wikilink]`, atomic delete con Backspace. Un po' più di codice ma gestibile.

**v0.2**
- **FTS5, non FTS3/4 o ricerca custom.** SQLite FTS5 ha snippet() built-in con highlight, scoring rank decente, sintassi booleana familiare. Il query escaping richiede un piccolo helper.
- **Tag come Decoration, non Mark.** Markdown sul disco resta `#tag` plain — niente custom serialize nel markdown roundtrip. Solo un decoration plugin che applica `.ziba-tag` ai pattern matchati.
- **Property editor con detection lazy.** Il tipo è derivato dal valore (boolean → number → date → URL → string-array → text) con override manuale per row. Salvataggio su disco resta YAML standard — nessun lock-in al nostro modello.

**v0.3**
- **Property index in colonne tipizzate, non JSON.** `note_properties` ha `text_value`/`number_value`/`boolean_value`/`date_value`/`array_value` separate. Permette query veloci tramite indici dedicati per tipo. JSON sarebbe più flessibile ma forzerebbe scan O(n) su query range.
- **Database view come overlay sul mainView, non come "view file".** Niente file `.ziba/views/*.json` — la query è in-memory nel renderer. Più semplice per v0.3; salvabili come "saved queries" in v1.x se serve.
- **Global graph riusa MiniGraph layout, non Barnes-Hut.** Il simulatore O(n²) basta fino a ~1000 nodi. Sopra emette `console.warn`. Quando un vault reale lo richiede, sostituiamo con BH dietro la stessa interfaccia `simulateLayout`.
- **Callout markdown roundtrip via markdown-it core ruler.** Convertiamo `> [!kind]\n> body` ↔ Tiptap node senza modificare il body markdown stesso. Compatibilità completa con Obsidian e GitHub (entrambi rendono `> [!tip]`).

**v1.0**
- **`relations` sostituisce `wikilinks`, non la affianca.** Un'unica tabella con `kind = ''` per i wikilink generici è più pulita di due tabelle + join. La migration è uno drop + reindex — la cache è ricostruibile, nessun dato perso.
- **Schema soft, non hard.** Gli schemi descrivono l'intenzione + guidano la UI ma non bloccano il salvataggio. Rifiutare un salvataggio per schema invalido romperebbe il principio "source of truth = filesystem".
- **Object types come YAML, non come note speciali.** `.ziba/schema/book.yml` è separato dal vault content — un file `.md` con `type: schema` avrebbe creato ambiguità nell'indexer e nella search.
- **Seed schemas copiati su prima apertura, non hardcoded nel binary.** L'utente può editarli, cancellarli o sostituirli liberamente. Il binary non li "sa" — li legge da disco come qualsiasi altro schema.
- **Hull convex nel grafo, non clustering algoritmico.** Il convex hull sui nodi dello stesso tipo è O(n log n) e visivamente chiaro. Un clustering algoritmico (k-means, DBSCAN) aggiungerebbe complessità senza benefici apprezzabili a scala vault.

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
- "Come funzionano gli oggetti tipizzati (v1.0)?" → `packages/core/src/types/schema.ts` (forma YAML) + `apps/desktop/electron/ipc/types.ts` (IPC handlers) + `stores/tags.ts` (cache renderer)
- "Come si popola la tabella relations?" → `apps/desktop/electron/adapters/index-store-relations.ts` + `packages/core/src/markdown/relations.ts` (extractor)
- "Come funziona il grafo constellation (v1.0)?" → `apps/desktop/src/components/GlobalGraph/HullsLayer.tsx` (hull SVG) + `Canvas.tsx` (cluster bias nel layout) + `KindFilterDropdown.tsx`
- "Dove vivono le decisioni di sicurezza?" → `apps/desktop/electron/security.ts`
- "Dove sono i tipi del contratto IPC?" → `apps/desktop/shared/ipc.ts`
