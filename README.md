# Synapsium — Il tuo Second Brain per Contenuti e Connessioni

Synapsium è un second brain ultra‑veloce per organizzare film, libri, serie TV, video online, eventi live, persone e idee in semplici file Markdown con YAML frontmatter. Tutto ruota attorno alle connessioni: ogni nota è un nodo, ogni riferimento `[[...]]` è una sinapsi nel grafo delle tue conoscenze.

> Dati tuoi, per sempre tuoi. Synapsium usa Markdown e metadati aperti: nessun lock‑in, perfetta portabilità.


## Caratteristiche principali

- Editor Markdown con anteprima dal vivo in stile scheda
- Frontmatter YAML strutturato per categorie predefinite (Film, Libri, Serie TV, YouTube, Live, Persona, Idea) + tipologia `highlight`
- Autocompletamento dei link `[[...]]` e dei `#tag` suggeriti
- Drag‑and‑drop per copertine e asset (salvati in `assets/`)
- Dashboard con “In visione/lettura”, “Da vedere/leggere”, “Ultimi aggiunti”
- Viste per categoria: Gallery, Tabella, Timeline
- Grafo interattivo delle connessioni (Cytoscape) con colori/icone per tipo e etichette connessioni configurabili
- Libreria Highlights + Quick Capture per catturare frammenti da web/libri/pdf/tweet
- AI integrata (OpenRouter): riassunti 1‑click, suggerimenti collegamenti, Q&A sul vault
- Temi e personalizzazione colori brand (Impostazioni)
- Web app + Desktop app (Windows/macOS/Linux) via Tauri

> Nota: l’MVP salva i file in un vault locale. Nel browser viene usato uno storage locale interno al sito; nella versione desktop i file risiedono sul disco. La sincronizzazione con Dropbox/Google Drive/iCloud/OneDrive è nativa perché i dati sono Markdown.


## Architettura

- Frontend: Vite + React + TypeScript
- Editor: CodeMirror 6 con autocompletamento `[[...]]` e `#tag`
- Parser: gray‑matter + js‑yaml
- Stato: Zustand
- Config in vault: `vault/config/synapsium.config.json` (tipi, icone, colori, edge rules, tag iniziali)
- Grafo: Cytoscape (+ dagre)
- AI: OpenRouter (modello configurabile da Impostazioni)
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
- Editor: a sinistra scrivi in Markdown; a destra vedi la scheda/anteprima con copertina, voto, metadati e corpo Markdown (con card YouTube/link).
- Link `[[...]]`: scrivendo `[[` compaiono suggerimenti con le note già presenti.
- Tag: scrivendo `#` compaiono suggerimenti dai tag iniziali e dalla tua libreria.
- Copertine/asset: usa “Carica copertina” nella nota; i file finiscono in `assets/`.
- Viste: Gallery, Tabella, Timeline. La ricerca è disponibile nella vista Tabella.
- Highlights: pagina “Highlights” con cattura rapida “+ Cattura”.
- Grafo: pagina “Grafo” per navigare le connessioni con colori/icone per tipo.
- Chat: pagina “Chat” per porre domande al vault (retrieval semplice) con risposta AI.
- Impostazioni: tema, AI (OpenRouter), schemi, grafo (icone/colore/etichette), tag iniziali, Readwise token.


## Importazione e Integrazioni

- Readwise: inserisci il token in Impostazioni → Readwise e lancia l’import (Tauri consigliato per evitare CORS). Gli highlight diventano note `type: highlight`.
- Libri: Open Library (ISBN o ricerca) — in arrivo.
- Film/Serie: TMDB (API key) — in arrivo.
- YouTube: YouTube Data API (API key) — in arrivo.


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
- Editor di schemi visuale più ricco (UI dedicata oltre al JSON editor)
- Statistiche approfondite e dashboard evolute
- Sincronizzazione opzionale con provider esterni via cartella del vault
- Web Clipper (estensione browser) per cattura pagine/articoli


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
