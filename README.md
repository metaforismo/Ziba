# synapsium

> Un second brain open-source: Notion DB + Obsidian local-first markdown + grafo connessioni + futuro AI native.

synapsium fonde i punti di forza di Notion (block editor con `/`-menu, database con property strutturate, viste multiple) e Obsidian (local-first markdown, wikilinks, knowledge graph) in un'unica app pensata per crescere verso un futuro AI-native: semantic search, auto-linking, agent organizzativi, sempre con i tuoi file `.md` come source of truth sul disco.

## Stato

Stato: in sviluppo, v0.1 in costruzione.

## Architettura

- Monorepo Turborepo + pnpm workspaces
- Desktop app: Electron + React + TypeScript
- Editor: Tiptap (ProseMirror) con markdown input rules e `tiptap-markdown`
- Storage: file markdown puri sul disco, source of truth = filesystem
- Index: SQLite cache (`<vault>/.synapsium/index.db`) ricreabile, alimentata da `better-sqlite3`
- Styling: Tailwind CSS
- State management: Zustand
- Logica condivisa platform-agnostic in `packages/core` (pronta per web e mobile in futuro)

## Roadmap

- v0.1 — MVP desktop: vault opening, sidebar file tree, Tiptap editor, wikilinks + autocomplete, backlinks panel, file watcher
- v0.2 — Search full-text, slash menu `/`, drag handles, frontmatter UI, mini-graph locale, tag system, theme support
- v0.3 — Database views (table/board/kanban/calendar), graph globale del vault, blocchi avanzati (callout, embed, table)
- v1.0 — Web app, plugin system base, sync semplice via filesystem-based cloud drive
- v1.x — AI native: embeddings, semantic search, auto-link suggestions, Q&A sul vault
- v1.5+ — Mobile app (Expo), sync server custom

## Quickstart

In arrivo.

## License

MIT
