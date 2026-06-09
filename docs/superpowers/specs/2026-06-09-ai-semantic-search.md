# Spec — Semantic Search (AI-native, milestone 1)

## Context

Ziba's differentiator vs Obsidian is **local-first + open-source + AI-native**: a second brain that reasons with you. Milestone 1 is **semantic search** — find notes by meaning, not keywords. It is the foundation for later milestones (ask-your-notes/RAG, AI-suggested links & properties).

**Stance (decided with the user):** *Hybrid.* Embeddings are computed **locally** (notes never leave the machine); the heavy LLM layer (later milestones) is BYO-key. For embeddings v1 we use a **provider interface** so the concrete backend is swappable.

- **v1 provider:** local **Ollama** embeddings endpoint (`POST {baseUrl}/api/embeddings`, default `http://localhost:11434`, model e.g. `nomic-embed-text` / `bge-m3`). HTTP-only, no native deps, fully local/private, easy to test.
- **Next provider (separate follow-up):** bundled `transformers.js` (ONNX) local model for zero-setup — isolates the heavy electron-builder native-binary integration.

## Architecture

### Storage (`packages/core` schema + electron adapter)
New table in `<vault>/.ziba/index.db`:
```
note_embeddings(
  source_path TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,   -- skip re-embed when unchanged
  model_id TEXT NOT NULL,       -- provider+model; reindex on change
  dim INTEGER NOT NULL,
  vector BLOB NOT NULL,         -- Float32 little-endian
  mtime INTEGER NOT NULL
)
```
Keep `packages/core` pure TS: put the vector math (cosine, blob<->Float32) and the provider interface there; the SQLite adapter + Ollama HTTP live in `apps/desktop/electron`.

### Provider interface (pure core)
```
interface EmbeddingProvider {
  readonly id: string;            // e.g. "ollama:nomic-embed-text"
  embed(texts: string[]): Promise<Float32Array[]>;
}
```
- Core exports `cosineSimilarity`, `float32ToBlob`/`blobToFloat32`, `hashContent`, and a deterministic **fake provider** for tests.

### Indexing pipeline (electron main)
- On note create/save/rename/delete (same hooks as the existing indexer in `electron/adapters/index-store.sqlite.ts` + `reindexVault`), enqueue (re)embedding. Skip when `content_hash` + `model_id` unchanged. Delete embedding on note delete.
- Debounced, batched, background; emit progress events (`{indexed, total, running}`) to the renderer.
- For v1, embed a **truncated** note (title + first ~2k chars) — chunking is a RAG-milestone concern.
- Initial full pass on vault open / on enabling the feature, with progress + cancellation.

### IPC
- `semanticSearch({query, limit}) -> [{path, title, score, snippet}]` — embed query, brute-force cosine over stored vectors (fine for thousands of notes), top-K.
- `getEmbeddingStatus() -> {enabled, indexed, total, running, providerOk, modelId}`.
- `reindexEmbeddings()` — force full rebuild.
- Settings: enable/disable, provider base URL + model, status/progress, reindex button.

### Search UI
- Extend the existing palette (`stores/search.ts` `runSearch` → `ipc.searchFullText`): add a **semantic mode** (toggle, or a blended keyword+semantic ranking). Show score + snippet. Reuse `SearchPalette` UI + `EmptyView`/no-results.
- Clear states: feature disabled, provider unreachable (Ollama not running) → actionable message, indexing in progress.

## Edge cases
- Provider unreachable / Ollama down → graceful, actionable error; never crash; degrade to keyword search.
- Large vault → batch + progress + cancel; don't block UI (main-process batching with yields; worker thread optional later).
- Multilingual (Italian) → choose a multilingual model in defaults.
- Empty/huge notes → truncate; skip empty.
- Vault switch → embeddings live in that vault's `.ziba`; reset in-memory state.
- Model change → `model_id` mismatch triggers reindex.
- First run / offline → no model download in v1 (Ollama path), clear setup hint.

## Milestones
1. **(this PR) Foundation, no fancy UI:** schema + core vector utils + provider interface + Ollama provider + indexing pipeline + IPC + status + minimal settings + tests (deterministic fake provider).
2. **Palette semantic mode + settings polish.**
3. **(follow-up) Bundled transformers.js provider** (zero-setup local model).
Later milestones: ask-your-notes (RAG), AI-suggested links/properties.

## Verification
- `pnpm -C packages/core test` (vector math, hashing, fake-provider search ranking) + `pnpm -C apps/desktop typecheck/lint/test`.
- Manual: run Ollama locally, enable feature, index the demo vault, search by meaning, confirm semantically-related notes rank above keyword matches; confirm graceful behavior with Ollama stopped.
