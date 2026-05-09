#!/usr/bin/env node
// Seed a sample vault for testing and demos.
//
// Usage:
//   node scripts/seed-vault.mjs [target-dir]
//
// If `target-dir` is omitted, creates `./sample-vault` in the current
// working directory. The vault is intentionally small (5-7 notes with
// crossing wikilinks) so it exercises the file tree, the wikilink
// autocomplete, and the backlinks panel without overwhelming a fresh
// installation.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const target = path.resolve(process.argv[2] ?? 'sample-vault');

const notes = [
  {
    path: 'index.md',
    body: `---
title: Index
tags: [meta]
---

# Index

Benvenuto in ziba. Questo vault di esempio dimostra le funzionalità principali:

- Apri una nota dalla sidebar (es. [[Idee]]).
- Le wikilink ti portano in giro: [[Progetti/ziba]] è la nota su questo progetto.
- Scrivi \`[[\` mentre digiti per vedere l'autocomplete.
- Apri il pannello backlink a destra per vedere chi linka una nota.

> Cancella questo vault quando hai finito di esplorare. I tuoi dati restano sempre file \`.md\` sul disco.
`,
  },
  {
    path: 'Idee.md',
    body: `---
title: Idee
tags: [brainstorming]
---

# Idee

Posto dove appunto idee in disordine. Le organizzo dopo.

- [[Progetti/ziba]] — un second brain locale + Notion + Obsidian.
- Esperimento: scrivere una recensione di [[Libri/Sapiens]] usando il formato Zettelkasten.
- Da approfondire: confronto fra capture rapido e capture strutturato.

Vedi anche [[Persone/Andrea]] per discussioni recenti.
`,
  },
  {
    path: 'Progetti/ziba.md',
    body: `---
title: ziba
tags: [progetto, work-in-progress]
status: alpha
---

# ziba

Second brain open-source che fonde Notion (database, viste) e Obsidian (local-first markdown, grafo).

## Stato

In sviluppo, v0.1. Vedi il [README](https://github.com/metaforismo/Ziba) sul repo.

## Note correlate

- [[Idee]] per brainstorm
- [[Persone/Andrea]] è coinvolto come tester
- Riferimento mentale: [[Libri/Sapiens]] per la prospettiva "narrazioni come storage"
`,
  },
  {
    path: 'Persone/Andrea.md',
    body: `---
title: Andrea
tags: [persona]
relation: collaboratore
---

# Andrea

Contatto: andrea@example.com

Ha contribuito a [[Progetti/ziba]] facendo testing iniziale. Mi ha consigliato [[Libri/Sapiens]] dopo una conversazione su rappresentazioni della conoscenza.
`,
  },
  {
    path: 'Libri/Sapiens.md',
    body: `---
title: Sapiens
author: Yuval Noah Harari
year: 2011
tags: [libro, antropologia]
status: letto
---

# Sapiens — Yuval Noah Harari

## Tema centrale

Le narrazioni condivise sono lo storage che permette a Homo sapiens di cooperare in gruppi grandi. Mito, religione, denaro, stato — tutto fiction utile.

## Connessioni

- Suggerito da [[Persone/Andrea]] in una chiacchierata su come gli esseri umani archiviano la conoscenza
- Rilevante per [[Progetti/ziba]]: i second brain sono fiction utili
- Collegato a [[Idee]] per la sezione su narrazioni come storage
`,
  },
  {
    path: 'Daily/2026-05-08.md',
    body: `---
title: 2026-05-08
date: 2026-05-08
type: daily
---

# 2026-05-08

Note del giorno.

- Provato [[Progetti/ziba]] per la prima volta. Funziona la cattura veloce con \`[[\`.
- Letto un capitolo di [[Libri/Sapiens]].
- Chiamata con [[Persone/Andrea]] su roadmap v0.2.
`,
  },
];

async function main() {
  await mkdir(target, { recursive: true });
  for (const note of notes) {
    const fullPath = path.join(target, note.path);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, note.body, 'utf8');
  }
  console.log(`Vault di esempio creato in: ${target}`);
  console.log('');
  console.log('Apri questa cartella in ziba dal pulsante "Apri vault".');
  console.log('Note create:');
  for (const note of notes) {
    console.log(`  - ${note.path}`);
  }
}

main().catch((err) => {
  console.error('Errore creando il vault di esempio:', err);
  process.exit(1);
});
