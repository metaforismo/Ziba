# Changelog

Tutte le modifiche notevoli a synapsium saranno documentate qui.

Il formato si basa su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e questo progetto aderisce a [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

### Added

- _Nulla finora — la v0.1 sarà la prima release taggata._

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
