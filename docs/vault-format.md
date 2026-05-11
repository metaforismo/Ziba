# Formato vault

Questa guida descrive la struttura locale di un vault Ziba: directory, naming dei file, forma del frontmatter e file schema che guidano il modello a oggetti tipizzati introdotto in v1.0.

## Struttura del vault

Un vault Ziba è una directory di file markdown. Ziba aggiunge una sola sottodirectory `.ziba/` per i propri dati:

```
my-vault/
├── tolkien.md
├── the-hobbit.md
├── projects/
│   └── ziba.md
├── people/
│   └── tolkien.md
└── .ziba/
    ├── index.db          # cache SQLite (rigenerabile, mai autoritativa)
    └── schema/
        ├── note.yml
        ├── person.yml
        ├── book.yml
        ├── project.yml
        ├── idea.yml
        ├── daily.yml
        └── meeting.yml
```

- **File `.md`**: la fonte unica di verità. Editabili in qualsiasi editor. Ziba non aggiunge sintassi proprietaria al corpo della nota — solo frontmatter YAML standard.
- **`.ziba/index.db`**: cache SQLite. Cancellabile senza perdere dati — Ziba la ricostruisce all'apertura del vault.
- **`.ziba/schema/*.yml`**: definizioni dei tipi di oggetto. Opzionali ma consigliati. Al primo avvio di un vault vuoto, Ziba copia i sette schemi seed — editabili, cancellabili, sostituibili liberamente.

## Frontmatter delle note

Il frontmatter segue il formato YAML standard di Obsidian. Ziba riconosce i campi seguenti:

```yaml
---
title: Titolo della nota        # opzionale — se assente, Ziba usa il primo H1 o il basename
tags:
  - filosofia
  - lettura
type: book                      # v1.0 — slug del tipo (referenzia .ziba/schema/book.yml)
relations:
  author: "[[Tolkien]]"         # v1.0 — relazione scalare
  genres:                       # v1.0 — relazione multipla (lista)
    - "[[Fantasy]]"
    - "[[Adventure]]"
# ...qualsiasi altra property...
year: 1937
status: letto
---
```

### Campi standard

| Campo | Tipo | Descrizione |
|---|---|---|
| `title` | text | Titolo della nota. Se assente, derivato dal primo H1 nel body o dal filename (senza estensione). |
| `tags` | string[] | Tag associati alla nota. Equivalenti ai `#tag` nel body. |
| `type` | text | Slug del tipo di oggetto (v1.0). Referenzia `.ziba/schema/<type>.yml`. |
| `relations` | mapping | Relazioni tipizzate verso altri oggetti (v1.0). Le chiavi sono i `kind` definiti nello schema. |

### Campi property (liberi)

Qualsiasi altro campo nel frontmatter viene trattato come property della nota. Il tipo viene rilevato automaticamente:

| Valore YAML | Tipo rilevato |
|---|---|
| `true` / `false` | `boolean` |
| Numero intero o decimale | `number` |
| Stringa ISO `YYYY-MM-DD` | `date` |
| Stringa che inizia con `http://` o `https://` | `url` |
| Lista di stringhe | `string-array` |
| Qualsiasi altra stringa | `text` |

Il rilevamento è lo stesso usato dal PropertyEditor nel renderer — nessuna differenza tra ciò che vedi nella UI e ciò che Ziba indicizza.

## Relazioni tipizzate (v1.0)

Le relazioni tipizzate collegano una nota (l'origine) ad altre note (i target) con un `kind` semantico definito nello schema. Si dichiarano nel frontmatter sotto `relations:`.

### Relazione scalare (un solo target)

```yaml
relations:
  author: "[[Tolkien]]"
```

### Relazione multipla (lista di target)

```yaml
relations:
  genres:
    - "[[Fantasy]]"
    - "[[Adventure]]"
```

### Alias di visualizzazione

```yaml
relations:
  author: "[[J. R. R. Tolkien|Tolkien]]"
```

L'alias (`|Display`) è separato dal target (`[[Target]]`) nel parser — il target usato per la join nel grafo è `J. R. R. Tolkien`, il testo visualizzato è `Tolkien`.

### Wikilink generici nel body

I wikilink `[[...]]` nel corpo della nota vengono indicizzati come relazioni con `kind = ''` (untyped). Sono backward-compatible con i vault v0.x e restano visibili nel grafo globale. Non richiedono `type:` né `relations:` nel frontmatter.

## Schemi dei tipi (`.ziba/schema/*.yml`)

Gli schemi descrivono l'intenzione per un tipo di oggetto: quali property aspettarsi, quali relation kind hanno senso, quali relazioni inverse mostrare nel pannello. Sono **soft** — Ziba non rifiuta mai un salvataggio che diverge dallo schema.

### Forma completa di uno schema

```yaml
id: book            # slug, ^[a-z][a-z0-9-]*$, obbligatorio
label: Libro        # nome visualizzato (sidebar, dropdown), obbligatorio
icon: 📖            # emoji o stringa ≤ 2 char, opzionale
color: "#6366f1"    # hex CSS #RRGGBB, opzionale

properties:
  title:
    type: text        # text|number|boolean|date|url|string-array
    required: true    # opzionale — avvisa ma non blocca il salvataggio
    label: Titolo     # opzionale — label nel PropertyPanel
  year:
    type: number
  isbn:
    type: text

relations:
  author:
    target: person    # id del tipo atteso (soft — non validato)
    multiple: false   # default false
    label: Autore
  in_series:
    target: book
    label: Serie

inverse:
  cited_by:
    reverse_of: cites   # kind usato per la join inversa
    label: Citato da
```

### Campi dello schema

| Campo | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `id` | slug | sì | Identificatore univoco del tipo. Deve corrispondere al basename del file (es. `book.yml` → `id: book`). Pattern: `^[a-z][a-z0-9-]*$`. |
| `label` | text | sì | Nome visualizzato nei dropdown, nella sidebar TypesSection, e nel ObjectPanel. |
| `icon` | string | no | Emoji o glifo breve (≤ 2 char) mostrato accanto al nome del tipo. |
| `color` | string | no | Colore CSS hex `#RRGGBB` usato per gli hull nel grafo e per i chip di tipo in sidebar. |
| `properties` | mapping | no | Specifica delle property attese. Le chiavi sono i nomi delle property nel frontmatter. |
| `relations` | mapping | no | Specifica delle relazioni in uscita. Le chiavi diventano i `kind` validi in `relations:` nel frontmatter. |
| `inverse` | mapping | no | Specifica delle relazioni in entrata da mostrare nell'ObjectPanel. Non sono nel frontmatter — vengono derivate via join sul campo `reverse_of`. |

### Tipi di property

| Valore `type` | Corrisponde a |
|---|---|
| `text` | Stringa libera |
| `number` | Intero o decimale |
| `boolean` | `true` / `false` |
| `date` | Stringa ISO `YYYY-MM-DD` |
| `url` | URL (stringa con schema `http://` o `https://`) |
| `string-array` | Lista di stringhe |

### Relazioni in uscita (`relations`)

Ogni chiave in `relations:` dello schema definisce un `kind` ammesso. Lo schema permette di specificare:

- `target`: il tipo atteso del nodo di destinazione (soft).
- `multiple`: se `true`, il frontmatter accetta una lista di wikilink; se `false` (default), uno scalare.
- `label`: etichetta visualizzata nel RelationPickerPopup e nell'ObjectPanel.

### Relazioni in entrata (`inverse`)

Le relazioni inverse non vengono scritte nel frontmatter della nota corrente. Sono derivate cercando nel grafo tutte le note che hanno `relations.<reverse_of>: [[QuestaNota]]`.

Esempio: se `book.yml` dichiara `inverse: { cited_by: { reverse_of: cites } }`, l'ObjectPanel di ogni libro mostra automaticamente le note che hanno `relations.cites: [[Questo Libro]]`.

## Schemi seed

Al primo avvio di un vault senza `.ziba/schema/`, Ziba copia sette schemi predefiniti. Sono un punto di partenza — editali, cancellali, o aggiungine di nuovi.

| ID | Label | Icon | Relazioni chiave |
|---|---|---|---|
| `note` | Nota | 📝 | — (inverse: `cited_by`) |
| `person` | Persona | 👤 | `works_at` → project, `knows` → person |
| `book` | Libro | 📖 | `author` → person, `in_series` → book |
| `project` | Progetto | 🚀 | `owner` → person, `blocks` → project |
| `idea` | Idea | 💡 | `inspired_by` → idea, `related_to` → idea |
| `daily` | Daily | 🗓️ | `worked_on` → project, `met_with` → person, `read` → book |
| `meeting` | Meeting | 🤝 | `attended_by` → person, `for_project` → project |

## Convenzioni di authoring

### Slug dei tipi

Gli `id` negli schemi devono essere kebab-case minuscolo: `book`, `daily-log`, `reading-note`. Non `Book`, non `daily_log`, non `DailyLog`.

### Icone

Usa emoji standard (monoglifo preferito) oppure stringhe di max 2 caratteri. Evita sequence emoji lunghe — la resa nei pill e nei nodi del grafo dipende dal font di sistema.

### Colori

Usa hex `#RRGGBB` a 6 cifre. I colori degli schemi seed sono:

| Tipo | Colore |
|---|---|
| note | `#71717a` |
| person | `#f97316` |
| book | `#6366f1` |
| project | `#10b981` |
| idea | `#eab308` |
| daily | `#06b6d4` |
| meeting | `#a855f7` |

### Backward compatibility

Un vault v0.x (nessun `type:`, nessun `relations:`, nessuna directory `.ziba/schema/`) continua a funzionare senza modifiche. I wikilink nel body vengono indicizzati come relazioni `kind = ''` e sono visibili nel grafo globale esattamente come prima.

Aggiungere `type:` a note esistenti non richiede nessuna migrazione — Ziba riconosce il campo al prossimo salvataggio o reindex.
