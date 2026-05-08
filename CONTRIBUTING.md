# Contribuire a synapsium

Grazie per l'interesse. synapsium è un progetto open-source in fase **alpha** — ogni contributo conta, dalle correzioni di typo nel README alle implementazioni di feature della roadmap.

## Indice

- [Codice di condotta](#codice-di-condotta)
- [Tipi di contributo](#tipi-di-contributo)
- [Setup ambiente](#setup-ambiente)
- [Workflow di sviluppo](#workflow-di-sviluppo)
- [Convenzioni di codice](#convenzioni-di-codice)
- [Convenzioni dei commit](#convenzioni-dei-commit)
- [Apertura di una PR](#apertura-di-una-pr)
- [Decisioni architetturali](#decisioni-architetturali)

## Codice di condotta

Sii rispettoso, costruttivo e paziente. Critica il codice, non le persone. Le PR e le discussioni che violano questo principio possono essere chiuse senza ulteriore discussione.

## Tipi di contributo

| Tipo | Come |
|---|---|
| 🐛 Bug fix | Apri una issue prima per i fix non triviali, una PR diretta è ok per typo o piccoli bug ovvi |
| ✨ Nuova funzionalità | Apri una [Discussion](https://github.com/metaforismo/Synapsium/discussions) per discutere il design prima di codare |
| 📝 Documentazione | PR diretta benvenuta |
| 🎨 Design / UX | Mockup in una Discussion per feedback prima di codare |
| 🧪 Test | Sempre benvenuti, soprattutto per `packages/core` |
| 🌍 Traduzioni | Per ora l'app è in italiano. Se vuoi proporre i18n, apri una Discussion |

## Setup ambiente

### Prerequisiti

- **Node.js** ≥ 20 (verifica con `node -v`)
- **pnpm** ≥ 9 (`corepack enable && corepack use pnpm@9`)
- Sistema operativo: macOS, Linux, o Windows. Lo sviluppo principale è su macOS; gli altri OS sono testati meno frequentemente — segnala se incontri problemi specifici della piattaforma.

### Clone e installazione

```bash
git clone https://github.com/metaforismo/Synapsium.git synapsium
cd synapsium
pnpm install
```

`pnpm install` compila il modulo nativo `better-sqlite3` contro l'ABI di Electron tramite `electron-builder` (postinstall hook). Su macOS arm64 o se hai più versioni di Node installate, può essere necessario rieseguire:

```bash
pnpm --filter synapsium-desktop exec electron-builder install-app-deps
```

### Avvio in dev

```bash
pnpm --filter synapsium-desktop run dev
```

HMR sul renderer è attivo. Modifiche al main process richiedono un reload (electron-vite riavvia l'app automaticamente).

### Verifica prima di pushare

```bash
pnpm typecheck   # tipi su tutto il monorepo
pnpm lint        # ESLint su tutto il codice
pnpm build       # build di produzione
```

Tutti e tre devono passare prima di aprire una PR. La CI li esegue automaticamente.

## Workflow di sviluppo

### 1. Branch

Usa un branch descrittivo:

```bash
git checkout -b feat/slash-menu
git checkout -b fix/wikilink-roundtrip-with-aliases
git checkout -b docs/readme-screenshots
```

Prefissi accettati: `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`.

### 2. Sviluppo

- Mantieni il PR focalizzato: una PR = una preoccupazione. Refactor non correlati in PR separate.
- Aggiungi test per la logica in `packages/core` (è platform-agnostic e facile da testare). I test per UI possono essere più scarsi.
- Aggiorna la documentazione contestualmente al codice (README, JSDoc, commenti dove la "ragione" non è ovvia dal codice).

### 3. Test manuale

Per qualsiasi cambiamento UI:

- Apri un vault con almeno 5-10 note `.md` (puoi crearti uno vault di test con dati Lorem)
- Verifica il flow toccato dalla tua modifica
- Verifica che tutti gli altri flow continuino a funzionare (regressioni sono facili in app stateful)

### 4. Test automatici

Per `packages/core`, scrivi test (Vitest, in arrivo). Per ora siamo prevalentemente type-driven + manual smoke testing. Le PR di test setup sono benvenute.

## Convenzioni di codice

### TypeScript

- **Strict mode obbligatorio.** No `any` esplicito senza `// eslint-disable` con commento giustificativo.
- **Niente default exports.** Solo named exports — più facili da renominare e fare grep.
- **Imports relativi** dentro lo stesso package. **Imports `@synapsium/core`** per attraversare i package.
- **Type-only imports** quando applicabili: `import type { Note } from '...';`.

### React

- Solo functional components. Hooks > class components.
- Niente prop drilling profondo: usa Zustand store o composizione.
- `useEffect` con array di dipendenze esplicito. Mai `[]` senza giustificazione (fai il `useEffectOnce` o accetta che dipendenze esistono).
- Componenti grandi (>200 righe) → splitta.

### Filesystem e path

- I path utente arrivano in vari formati. **Sempre normalizza a forward-slash** prima di metterli nei tipi `NotePath`.
- Path assoluti vivono solo dentro gli adapter Electron. La logica `packages/core` lavora SOLO con path relativi al vault.
- Mai concatenare path con stringhe — usa `path.join`/`path.resolve` (negli adapter).

### IPC (Electron)

- Ogni nuovo channel deve passare per `apps/desktop/shared/ipc.ts`. Aggiungi al `IpcChannels`, ai tipi `IpcRequests`/`IpcResponses`, all'API `SynapsiumApi`.
- Handler in `apps/desktop/electron/ipc/<dominio>.ts`. Validano gli input prima di toccare il filesystem.
- Errori loggati nel main, propagati al renderer come messaggi descritti (italiano per ora).

### Stile

ESLint + Prettier sono configurati. Esegui `pnpm lint --fix` e `pnpm format` prima di committare.

## Convenzioni dei commit

Stile [Conventional Commits](https://www.conventionalcommits.org/) leggero:

```
<type>(<scope>): <subject>

<body opzionale>

<footer opzionale>
```

Esempi:

```
feat(editor): add slash menu for inserting blocks

fix(wikilinks): preserve aliases through markdown roundtrip

docs(readme): add screenshots and roadmap detail

refactor(core): extract wikilink parser state machine into pure function
```

Tipi accettati: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `style`, `build`, `ci`.

Non c'è automated changelog ancora — verrà aggiunto quando le release inizieranno.

## Apertura di una PR

1. Push del branch e apertura PR contro `main`.
2. Compila il PR template (descrizione, checklist).
3. La CI deve passare (typecheck + lint + build).
4. Almeno un maintainer revisiona — può richiedere modifiche.
5. Il merge è "squash and merge" di default per mantenere `main` lineare.

Tempi di risposta: facciamo del nostro meglio per rispondere entro 7 giorni. Se non senti niente dopo una settimana, fai un ping cortese sulla PR.

## Decisioni architetturali

Le decisioni di alto livello (es. cambio framework, cambio storage layer) vanno prima discusse in [Discussion](https://github.com/metaforismo/Synapsium/discussions). Possiamo introdurre un formato ADR (Architecture Decision Record) in `docs/adr/` quando il progetto cresce.

### Principi di design

1. **Local-first sempre.** I dati utente sono file `.md` sul disco. Niente cloud obbligato.
2. **Source of truth = filesystem.** Cache (SQLite) è ricostruibile in qualsiasi momento.
3. **Adapter pattern.** Logica in `packages/core` non sa nulla di Electron / Node / Web / Mobile.
4. **YAGNI.** Niente feature speculative. La roadmap è una lista di "se", non di "quando".
5. **Open source friendly.** Stack mainstream (TypeScript, React), barriera d'ingresso bassa per contributor.

---

Domande? Apri una [Discussion](https://github.com/metaforismo/Synapsium/discussions) o pinga in una issue esistente. Grazie per voler contribuire 💚
