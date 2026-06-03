# Contributing to Ziba

Thank you for wanting to contribute. Ziba is an open-source, local-first
knowledge workspace in alpha. Contributions are welcome at every level, from
small documentation fixes to deeper work on the editor, indexer, graph, and
object model.

This guide explains how to set up the project, how to keep changes reviewable,
and what maintainers expect before merging.

## Contents

- [Community Standards](#community-standards)
- [Ways to Contribute](#ways-to-contribute)
- [Before You Start](#before-you-start)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Guidelines](#code-guidelines)
- [Project Conventions](#project-conventions)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Checklist](#pull-request-checklist)
- [Architecture Decisions](#architecture-decisions)

## Community Standards

Be respectful, constructive, and patient. Critique code, design, and arguments,
not people. Assume good intent, explain tradeoffs clearly, and leave room for
maintainers and contributors to ask basic questions.

Harassing, insulting, or bad-faith behavior may lead to an issue, discussion, or
pull request being closed.

## Ways to Contribute

| Contribution | Best path |
|---|---|
| Bug fix | Open an issue first for non-trivial bugs. Direct PRs are fine for typos and obvious small fixes. |
| Feature | Start with a GitHub Discussion so the design can be shaped before code is written. |
| Documentation | Direct PRs are welcome. Keep docs concise, accurate, and linked from the right place. |
| Tests | Especially welcome for `packages/core`, parsers, index logic, and regression cases. |
| Design and UX | Share screenshots, notes, or a short proposal in a Discussion before implementation. |
| Performance | Include a reproduction, measurement, or benchmark when possible. |
| Internationalization | The app UI is currently Italian. Open a Discussion before proposing an i18n architecture. |

## Before You Start

For small changes, a focused PR is enough.

For larger work, please open a Discussion first. This is especially important
for changes that affect storage, sync, indexing, schemas, plugins, AI features,
or cross-platform architecture.

Good issues and PRs usually include:

- What problem is being solved.
- What behavior changes for users.
- What files or subsystems are affected.
- How the change was verified.
- Any known limitations or follow-up work.

## Development Setup

### Requirements

- Node.js 20 or newer.
- pnpm 9 or newer.
- macOS, Linux, or Windows. Development is currently most tested on macOS.

Enable pnpm with Corepack:

```bash
corepack enable
corepack use pnpm@9
```

### Clone and Install

```bash
git clone https://github.com/metaforismo/Ziba.git ziba
cd ziba
pnpm install
```

`pnpm install` prepares the workspace and installs the Electron desktop
dependencies. If the native SQLite dependency needs to be rebuilt for Electron,
run:

```bash
pnpm --filter ziba-desktop exec electron-builder install-app-deps
```

### Run the App

```bash
pnpm --filter ziba-desktop run dev
```

The renderer uses hot module replacement. Changes to the Electron main process
may trigger an app restart through electron-vite.

## Development Workflow

### Branches

Use a short, descriptive branch name:

```bash
git checkout -b feat/slash-menu
git checkout -b fix/wikilink-alias-roundtrip
git checkout -b docs/name-origin
```

Common prefixes: `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`,
`perf/`, `build/`, and `ci/`.

### Keep PRs Focused

A good PR does one thing well. Avoid mixing unrelated refactors, UI polish,
dependency upgrades, and feature work in the same review.

When a change touches code and docs, update both in the same PR. When a change
is documentation-only, keep it documentation-only.

### Manual Testing

For UI changes:

- Open a real or sample vault with several markdown notes.
- Test the exact workflow you changed.
- Check nearby workflows that share the same state or component.
- Mention any manual testing in the PR description.

You can create a sample vault with:

```bash
node scripts/seed-vault.mjs ./sample-vault
```

## Testing

Before opening a PR, run the checks that match your change. For broad or
user-facing changes, run the full set:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

For documentation-only changes, at minimum run:

```bash
pnpm exec prettier --check README.md CONTRIBUTING.md docs/**/*.md
```

The test suite uses Vitest across the monorepo:

- `packages/core` covers pure TypeScript logic such as markdown parsing,
  serialization, queries, schema handling, and vault behavior.
- `apps/desktop/electron` covers Electron adapters, IPC behavior, and SQLite
  integration patterns.
- `apps/desktop/src` covers React components, Zustand stores, and renderer
  helpers with jsdom and Testing Library.

End-to-end tests are not yet part of the stable workflow. For now, UI changes
should include focused automated tests where practical and a clear manual smoke
test note.

## Code Guidelines

### TypeScript

- Keep strict TypeScript clean.
- Avoid explicit `any`. If an exception is truly needed, add a narrow
  eslint-disable comment with a reason.
- Prefer named exports.
- Use type-only imports when appropriate.
- Keep platform-specific code out of `packages/core`.

### React

- Use function components and hooks.
- Avoid deep prop drilling. Prefer composition or the existing Zustand stores.
- Keep effects explicit about their dependencies.
- Split large components when a smaller boundary would make behavior easier to
  test or review.

### Filesystem and Paths

- Treat user paths carefully.
- Use vault-relative paths in domain logic.
- Keep absolute paths inside Electron adapters.
- Normalize note paths to forward slashes before storing or comparing them.
- Use `path.join` or `path.resolve` in Node code instead of string
  concatenation.

### IPC

Every new Electron IPC channel should go through
`apps/desktop/shared/ipc.ts`. Add the channel name, request type, response type,
and renderer API surface there first.

Handlers live under `apps/desktop/electron/ipc/`. Validate inputs before
touching the filesystem. Errors should be logged in the main process and
returned to the renderer as typed, user-readable messages.

## Project Conventions

### Language

- Documentation is written in English.
- Source comments should be English and explain why, not what.
- The app UI is currently Italian. Keep existing UI language consistent unless
  an i18n plan has been discussed.

### Local-first Principles

Ziba is built around a few invariants:

1. Markdown files are the source of truth.
2. SQLite is a rebuildable cache, not the canonical data store.
3. `packages/core` must remain platform-agnostic.
4. Electron, web, and mobile should be adapter implementations, not forks of
   the domain model.
5. User data should stay inspectable, portable, and editable outside the app.

### Feature Design

Large features should start with a design note or GitHub Discussion before
implementation. This is especially useful for storage format changes, relation
schema changes, plugin architecture, graph behavior, sync, or AI-native
features.

## Commit Guidelines

Use lightweight Conventional Commits:

```text
<type>(<scope>): <subject>
```

Examples:

```text
feat(editor): add slash menu relation insertion
fix(wikilinks): preserve aliases through markdown roundtrip
docs(readme): explain the project philosophy
refactor(core): extract relation parsing helpers
test(graph): cover relation-kind filtering
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`,
`style`, `build`, and `ci`.

## Pull Request Checklist

Before asking for review, please confirm:

- The PR has a clear title and focused scope.
- The description explains the user-visible change.
- Relevant docs were updated.
- Relevant tests were added or updated.
- The appropriate verification commands were run.
- Known limitations are called out honestly.
- The branch is up to date with `main` if needed.

Maintainers generally use squash merge to keep `main` readable.

## Architecture Decisions

Discuss major architecture changes before implementing them. Examples include a
new storage layer, schema migration strategy, plugin system, sync model, or
cross-platform runtime.

The current architecture is summarized in [docs/architecture.md](docs/architecture.md).
The vault format is described in [docs/vault-format.md](docs/vault-format.md).

## Questions

Open a [GitHub Discussion](https://github.com/metaforismo/Ziba/discussions) for
open-ended ideas, design questions, and roadmap proposals. Open an issue for
reproducible bugs with clear steps.
