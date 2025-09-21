# Synapsium — Il tuo Second Brain per Contenuti e Connessioni

Synapsium è un second brain ultra‑veloce per organizzare film, libri, serie TV, video online, eventi live, persone e idee in semplici file Markdown con YAML frontmatter. Tutto ruota attorno alle connessioni: ogni nota è un nodo, ogni riferimento `[[...]]` è una sinapsi nel grafo delle tue conoscenze.

> Dati tuoi, per sempre tuoi. Synapsium usa Markdown e metadati aperti: nessun lock‑in, perfetta portabilità.


## Caratteristiche principali (MVP)

- Editor Markdown con anteprima dal vivo in stile scheda
- Frontmatter YAML strutturato per categorie predefinite (Film, Libri, Serie TV, YouTube, Live, Persona, Idea)
- Autocompletamento dei link `[[...]]` verso note esistenti
- Drag‑and‑drop per copertine e asset (salvati in `assets/`)
- Dashboard con “In visione/lettura”, “Da vedere/leggere”, “Ultimi aggiunti”
- Viste per categoria: Gallery, Tabella, Timeline
- Grafo interattivo delle connessioni (Cytoscape)
- Temi e personalizzazione colori brand (direttamente da Impostazioni)
- Web app + Desktop app (Windows/macOS/Linux) via Tauri

> Nota: l’MVP salva i file in un vault locale. Nel browser viene usato uno storage locale interno al sito; nella versione desktop i file risiedono sul disco. La sincronizzazione con Dropbox/Google Drive/iCloud/OneDrive è nativa perché i dati sono Markdown.


## Architettura

- Frontend: Vite + React + TypeScript
- Editor: CodeMirror 6 con autocompletamento `[[...]]`
- Parser: gray‑matter + js‑yaml
- Stato: Zustand
- Grafo: Cytoscape (+ dagre)
- Desktop: Tauri v1 (Rust) per massima efficienza e footprint minimo

Struttura cartelle principale:

```
Synapsium/
├─ src/                  # App web
│  ├─ components/
│  ├─ pages/
│  ├─ lib/
│  │  ├─ parsers.ts     # YAML/Markdown parsing
│  │  ├─ graph.ts       # Costruzione grafo
│  │  └─ vault/         # Adapters (browser, tauri)
│  ├─ store/
│  ├─ main.tsx, App
│  └─ index.css
├─ src-tauri/            # Wrapper desktop (Tauri)
├─ index.html
├─ package.json
└─ README.md
```

Vault consigliato (organizzazione file e cartelle):

```
vault/
  film/
  libri/
  serie_tv/
  video_youtube/
  live_event/
  persone/
  idee_concetti/
  altri/         # tipi custom (es. podcast, videogiochi)
assets/          # immagini e allegati
```

Ogni nota è un file `.md` con YAML frontmatter. Esempio (Film):

```yaml
---
type: film
id: film-titolo-anno
titolo: Il Padrino
titolo_originale: The Godfather
anno: 1972
regista: [[Francis Ford Coppola]]
attori_principali:
  - [[Marlon Brando]]
  - [[Al Pacino]]
genere: Drammatico, Crime
voto: 5/5
data_visto: 2023-10-26
piattaforma: Prime Video
sinossi: "La storia epica della famiglia Corleone..."
copertina: assets/film/il_padrino_copertina.jpg
status: visto
tags: [mafia, capolavoro]
---

Recensione, riflessioni, citazioni... con link a [[idee]] o [[persone]].
```


## Requisiti

Web (sviluppo):
- Node.js 18+ o Bun 1.0+

Desktop (sviluppo):
- Rust toolchain stabile
- Tauri CLI: verrà installata come devDependency
- macOS: Xcode Command Line Tools
- Windows: Visual Studio Build Tools (con Desktop development with C++)
- Linux: librerie WebKit e GTK secondo guida Tauri


## Avvio rapido

Clona il repository e installa le dipendenze:

```
bun install   # oppure: npm i / pnpm i / yarn
```

Avvia la web app in sviluppo:

```
bun run dev   # http://localhost:5173
```

Avvia la desktop app (Tauri) in sviluppo:

```
bun run tauri:dev
```

Build web production:

```
bun run build
```

Build pacchetti desktop:

```
bun run tauri:build
```


## Utilizzo

- Nuova nota: dalla Home aggiungi “+ Film / + Libro / + Idea”. Verrà generato un frontmatter di base.
- Editor: a sinistra scrivi in Markdown; a destra vedi la scheda/anteprima con copertina, voto, metadati.
- Link `[[...]]`: scrivendo `[[` compaiono suggerimenti con le note già presenti.
- Copertine/asset: usa “Carica copertina” nella nota; i file finiscono in `assets/`.
- Viste: Gallery, Tabella, Timeline. La ricerca è disponibile nella vista Tabella.
- Grafo: pagina “Grafo” per navigare le connessioni tra note e persone/idee.
- Impostazioni: configura colori brand primario/secondario e API key (TMDB, YouTube) per import automatici.


## Importazione intelligente (stato attuale)

- Libri: supporto pronto per Open Library (ISBN o ricerca). UI arriverà a breve nel pannello Import.
- Film/Serie: previsto TMDB (richiede API key). Inserisci la tua chiave in Impostazioni.
- YouTube: previsto tramite YouTube Data API (richiede API key).

L’MVP include i campi e i punti di estensione necessari. Le chiamate saranno abilitate progressivamente nelle prossime iterazioni.


## Temi e brand

- Logo: aggiungi il tuo file in `public/logo.svg` (verrà usato come favicon e nel brand).
- Colori: cambia i colori primari in Impostazioni oppure modifica le CSS vars in `src/index.css`:

```
:root{
  --brand: #7c5cff;     /* primario */
  --brand-2: #00e0ff;   /* secondario */
}
```

Se disponi di brand assets ufficiali (palette, logotipo, lockup), copiali in `public/brand/`.


## Perché Tauri per Desktop

- Startup rapidissimo e footprint minimo
- Integrazione diretta con il filesystem
- Consegna nativa per Windows, macOS e Linux


## Roadmap

- Import wizard completo (TMDB/Open Library/YouTube)
- Ricerca avanzata per metadati YAML (query salvabili)
- Esportazione/Importazione vault (ZIP) su web
- Editor di schemi per “Altri” tipi personalizzati
- Statistiche approfondite e dashboard evolute
- Sincronizzazione opzionale con provider esterni via cartella del vault


## Sviluppo

Script utili:

- `bun run dev` — server di sviluppo
- `bun run build` — build produzione web
- `bun run tauri:dev` — desktop dev
- `bun run tauri:build` — pacchetti desktop
- `bun run lint` — typecheck

Strumenti principali: React 19, Vite 5, TypeScript 5, Zustand, CodeMirror 6, Cytoscape, gray‑matter, js‑yaml.


## FAQ

- Posso usare Synapsium solo su web?
  Sì. L’MVP è una SPA performante. Per accesso file nativo e sincronizzazione cartelle consigliamo la versione desktop.

- Dove sono i miei dati sul web?
  Nel browser storage (locale al sito). Il desktop usa il filesystem. Presto arriveranno import/export ZIP.

- Come collego Dropbox/iCloud/OneDrive?
  Scegli la cartella del vault sincronizzata dal tuo servizio preferito quando usi la versione desktop.


## Contributi

Issue e proposte sono benvenute. Apri una issue con idee, feedback o bug.


## Crediti

Creato con ❤️ per trasformare la dispersione in connessioni significative.
