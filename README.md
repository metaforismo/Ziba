<div align="center">

# Ziba

### A local-first, open-source knowledge workspace for markdown notes, typed objects, databases, and graphs.

Ziba brings together the best parts of Obsidian and Notion: plain markdown files
that stay on your machine, a structured database layer for properties and typed
objects, and a visual graph for seeing how ideas connect.

It is built for people who want a second brain they can inspect, extend, sync,
fork, automate, and keep forever.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-v1.0_alpha-blue)](#project-status)
[![Local-first](https://img.shields.io/badge/local--first-markdown%20%2B%20sqlite-2ea44f)](#why-ziba)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Why Ziba](#why-ziba) |
[Features](#features) |
[Quick Start](#quick-start) |
[Vault Format](#vault-format) |
[Architecture](#architecture) |
[Roadmap](#roadmap) |
[Contributing](CONTRIBUTING.md)

</div>

---

## Why Ziba

Most knowledge tools ask you to choose between power and ownership.

Notion gives you structured databases, rich editing, and polished workflows, but
your workspace lives inside a proprietary cloud product. Obsidian gives you
plain files, backlinks, and a thriving markdown ecosystem, but structured data
and object-level relationships are left mostly to plugins and conventions.

Ziba is an experiment in taking both ideas seriously:

| Capability | Notion | Obsidian | Ziba |
|---|---|---|---|
| Local markdown as source of truth | No | Yes | Yes |
| No proprietary data lock-in | No | Yes | Yes |
| Block-style editing | Yes | Limited | Yes |
| Typed properties | Yes | Limited | Yes |
| Table, board, and calendar views | Yes | Plugin-driven | Yes |
| Wikilinks and backlinks | Limited | Yes | Yes |
| Global knowledge graph | No | Yes | Yes |
| Typed objects and semantic relations | Limited | Convention-based | Yes |
| Open source | No | No | Yes |
| AI-ready knowledge model | Limited | Plugin-driven | In progress |

The long-term idea is simple: your knowledge base should be a folder of durable
files, not a subscription hostage. The app can be beautiful, structured, and
intelligent without taking ownership of your data.

## What Ziba Feels Like

Use it as a markdown-first notebook. Add properties when a note becomes more
structured. Turn notes into typed objects such as people, books, ideas, projects,
meetings, or daily logs. Link them with regular wikilinks or semantic relations.
Then move between an editor, database views, object panels, and a graph without
leaving your local vault.

Ziba is especially useful for:

- Personal knowledge management and research archives.
- Project notes with people, meetings, tasks, books, and references.
- Writers and founders mapping ideas across many documents.
- Developers who want a hackable local-first knowledge substrate.
- AI-native workflows where the graph and object model can later power semantic
  search, auto-linking, and local agents.

## Project Status

Ziba is in **v1.0 alpha**. The core desktop experience works in development mode
and the project has an end-to-end local vault model, but it is not yet a polished
signed installer for everyday non-technical users.

Current state:

- Local vaults backed by `.md` files and YAML frontmatter.
- Electron desktop app with React, Tiptap, Tailwind, Zustand, and SQLite.
- Full-text search, tags, backlinks, file tree, database views, and graph views.
- Typed objects and semantic relations via `.ziba/schema/*.yml`.
- Extensive unit and component coverage across the core and desktop app.
- MIT licensed and open to contributors.

## Features

### Local-first vaults

- Open any folder as a vault.
- Store notes as normal `.md` files with standard YAML frontmatter.
- Sync with anything you trust: git, iCloud, Dropbox, Syncthing, rsync, or an
  external editor.
- Rebuild the SQLite index at any time because the filesystem is the source of
  truth.

### Rich markdown editing

- Tiptap editor with markdown shortcuts.
- Wikilink autocomplete with `[[...]]`.
- Broken link highlighting and note creation flows.
- Slash menu for headings, lists, quotes, code, callouts, embeds, math, and
  typed relations.
- KaTeX math support for inline and block formulas.

### Structured knowledge

- Frontmatter property editor.
- Typed property indexing for fast queries.
- Tags from both frontmatter and inline `#tag` syntax.
- Database table view with typed filters, sorting, grouping, and column picking.
- Board and calendar views for property-driven workflows.

### Typed objects and semantic relations

Ziba can treat a note as an object:

```markdown
---
type: book
title: The Hobbit
year: 1937
relations:
  author: "[[J. R. R. Tolkien]]"
  in_series: "[[Middle-earth]]"
---

A compact fantasy novel that became the doorway into Middle-earth.
```

Object schemas live in `.ziba/schema/<type>.yml`:

```yaml
id: book
label: Book
icon: B
color: "#6366f1"
properties:
  title:
    type: text
    required: true
  year:
    type: number
relations:
  author:
    target: person
    label: Author
  in_series:
    target: book
    label: Series
```

Schemas are intentionally soft. They guide the UI, relation picker, object
panel, graph colors, and future automation, but they do not prevent you from
editing your files however you want.

### Graph-first exploration

- Local mini-graph around the current note.
- Global graph with pan, zoom, search, and node selection.
- Obsidian-style visual polish with dark canvas, subtle links, and hover focus.
- Constellation mode with type clusters, color groups, relation-kind filters,
  and graph settings.

### Desktop workflows

- File tree with nested folders.
- Context menus for file and folder actions.
- Recent vaults and starter vault generation.
- Typed IPC boundary between Electron main and renderer.
- Watcher-based updates when files change on disk.

## Quick Start

### Requirements

- Node.js 20 or newer.
- pnpm 9 or newer.
- macOS, Linux, or Windows. Development is currently most tested on macOS.

Enable pnpm with Corepack:

```bash
corepack enable
corepack use pnpm@9
```

### Run the desktop app

```bash
git clone https://github.com/metaforismo/Ziba.git ziba
cd ziba
pnpm install
pnpm --filter ziba-desktop run dev
```

On first launch, choose an empty folder or an existing folder of markdown files
as your vault.

### Create a sample vault

```bash
node scripts/seed-vault.mjs ./sample-vault
pnpm --filter ziba-desktop run dev
```

Then open `./sample-vault` from Ziba.

### Verify the repo

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

### Build desktop packages

```bash
pnpm --filter ziba-desktop run dist:mac
pnpm --filter ziba-desktop run dist:win
pnpm --filter ziba-desktop run dist:linux
```

Code signing is not set up yet. On macOS, unsigned builds may need to be opened
from Finder's context menu the first time.

## Vault Format

A Ziba vault is just a folder:

```text
my-vault/
|-- ideas/
|   `-- local-first-software.md
|-- people/
|   `-- ada-lovelace.md
|-- books/
|   `-- the-hobbit.md
`-- .ziba/
    |-- index.db
    `-- schema/
        |-- note.yml
        |-- person.yml
        |-- book.yml
        |-- project.yml
        |-- idea.yml
        |-- daily.yml
        `-- meeting.yml
```

- `.md` files are the durable user data.
- `.ziba/index.db` is a rebuildable SQLite cache.
- `.ziba/schema/*.yml` describes optional object types and relation kinds.

See [docs/vault-format.md](docs/vault-format.md) for the full vault format,
schema fields, property types, relation conventions, and slug rules.

## Architecture

Ziba is a TypeScript monorepo:

```text
ziba/
|-- apps/
|   `-- desktop/
|       |-- electron/         # Main process: IPC, fs, SQLite, watcher
|       |-- src/              # Renderer: React, Tiptap, Tailwind, Zustand
|       `-- shared/           # Typed IPC contract
`-- packages/
    |-- core/                 # Platform-agnostic TypeScript domain logic
    |   `-- src/
    |       |-- adapters/     # Filesystem, index store, watcher interfaces
    |       |-- markdown/     # Parser, serializer, wikilinks, tags
    |       |-- query/        # Database query model
    |       |-- vault/        # Scan, indexing, load/save notes
    |       |-- index-store/  # Shared SQLite schema
    |       |-- seed-schemas/ # Default object type schemas
    |       `-- types/        # Domain types
    `-- tsconfig/
```

The important architectural choice is the adapter pattern. `packages/core` does
not import React, Electron, Node APIs, or browser APIs. It defines interfaces;
platforms implement them.

That keeps the door open for:

- Electron desktop today.
- A web version using File System Access API and IndexedDB.
- A mobile client using Expo FileSystem and SQLite.
- Local AI and automation layers that can reason over a clean object graph.

Read [docs/architecture.md](docs/architecture.md) for the deeper walkthrough.

## Roadmap

Recently shipped:

- Local vault, markdown editor, wikilinks, backlinks, tags, full-text search.
- Database table, board, and calendar views.
- Global graph and local mini-graph.
- Typed objects, schemas, relation table, object panel, and type sidebar.
- Obsidian-style graph polish, graph settings, and improved file actions.

Next directions:

- Unified filtering across Sidebar, DatabaseView, and GlobalGraph.
- Better relation aliases and richer relation insertion flows.
- Plugin system foundations.
- Graph performance work, including worker-based layout.
- Web port experiments.
- Read-only mobile exploration.
- AI-native features: semantic search, auto-linking, vault-aware assistants,
  and local-first agent workflows.

The roadmap is a direction, not a delivery promise. Issues and discussions are
the best place to shape what happens next.

## Contributing

Ziba is open source because knowledge tools should be inspectable and
user-owned. Contributions are welcome across the whole project:

- Bug fixes and regression tests.
- Documentation improvements.
- UI and accessibility polish.
- Parser, indexing, and graph performance work.
- Design discussions for plugins, sync, web, mobile, and AI-native workflows.

Start with [CONTRIBUTING.md](CONTRIBUTING.md) for setup, conventions, and PR
workflow. For larger ideas, open a
[GitHub Discussion](https://github.com/metaforismo/Ziba/discussions) before
writing code.

## Philosophy

Ziba is built around a few durable beliefs:

- Your knowledge base should outlive the app you use to edit it.
- Files are a better long-term contract than an opaque database.
- Structure should be optional, gradual, and visible.
- Local-first software can still feel modern and powerful.
- AI should help you understand your own knowledge without requiring you to
  surrender it.

## License

[MIT](LICENSE) (c) 2026 Francesco Giannicola and contributors.
