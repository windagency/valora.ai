---
updated: 2026-05-11
---

# ADR-013: Memory Vault — Per-Memory Markdown Files with Embeddings

> **Decision**: Extend the biological memory system with a per-memory Markdown vault and optional content embeddings computed via the existing `LLMProvider` abstraction, replacing the three flat JSON stores introduced in ADR-011.

> **Note (2026-05):** This ADR describes the on-disk format, embedding pipeline, and retrieval semantics of the **bundled vault plugin**. Since [ADR-016](./016-memory-as-plugin.md), the implementation lives in `packages/valora-plugin-memory-vault/` and is reached via the `MemoryProvider` contract. Other memory plugins are free to use a different on-disk layout — the format documented here is specific to `'vault'`.

## Status

Accepted

> Implementation landed in Valora 2.6.0 and moved into `packages/valora-plugin-memory-vault/` in 2.7.0 ([ADR-016](./016-memory-as-plugin.md)). See `packages/valora-plugin-memory-vault/src/vault/`, `.../embeddings/`, `.../retrieval/`, `.../consolidation/`, and `.../migration/`. The legacy JSON `MemoryStore` is retained only as a migration source and is no longer instantiated by production code paths (enforced by arch-unit tests in `__tests__/architecture/vault-memory.arch.test.ts` and `__tests__/architecture/memory-plugin.arch.test.ts`).

## Consequences

### Positive

- Each memory is a self-contained, human-readable Markdown file — inspectable, diffable, and recoverable without tooling
- The vault directory (`.valora/memory/`) is openable in Obsidian or any text editor as a linked knowledge wiki; `[[id|kind]]` links make associations explicit
- Content embeddings (when an embedding-capable provider is configured) enable semantic recall and cosine-based consolidation, addressing ADR-011's acknowledged weak point: "Jaccard tag similarity is a coarse proxy for semantic similarity"
- Spreading-activation recall propagates through the in-memory association graph, delivering the biological associativity goal without any graph database
- Zero new runtime dependencies — the vault is pure TypeScript with file I/O; the embedding side file (`embeddings.bin`) is a packed `Float32Array`; no native binaries, no install scripts
- Graceful degradation: if no provider implements `embed()`, the system falls back to today's lexical/Jaccard path without any code path change
- The vault is the authoritative state; the in-memory index is always derivable from it, so corruption is recoverable by deleting and rebuilding the index
- The Markdown format is future-proof: a later migration to a graph database (e.g. Kuzu) is a straightforward export step from the vault

### Negative

- Many small `.md` files (one per memory) place more pressure on the file system than three JSON blobs — relevant for projects synchronised to network drives or cloud-sync tools
- Boot-time vault scan (~150–300 ms for 5,000 entries on first cold start) is slower than reading three pre-parsed JSON files; an opportunistic snapshot (`.index-snapshot.bin`) mitigates subsequent boots to under 100 ms
- Embedding model identity is pinned to the vault; switching embedding models requires an explicit `valora memory reembed` operation

### Neutral

- The `co_access` edge (Hebbian co-retrieval strengthening) is stored as a frontmatter map rather than inline wikilinks to avoid rewriting file bodies on every recall
- Per-memory files are written atomically via a tmp-file rename, so crashes between write and rename leave at most one stale `.md.tmp` file
- The ANN (approximate nearest-neighbour) step is a linear cosine scan over a packed `Float32Array`; this is within the 50 ms p95 budget for up to ~50,000 memories at 768 dimensions and requires no additional index structure

<details>
<summary><strong>Context</strong></summary>

ADR-011 introduced a biologically-inspired memory system backed by three flat JSON stores and Jaccard-on-tags as the sole similarity primitive. ADR-011 explicitly acknowledged: "Jaccard tag similarity is a coarse proxy for semantic similarity — fine-grained deduplication requires embeddings."

The reference model for this extension is the Obsidian + Karpathy LLM Knowledge Base pattern: a vault of plain Markdown files linked by `[[wiki-links]]`, where an LLM evolves the vault over time. Combined with the four goals for this extension (semantic recall, smarter consolidation, spreading activation, pattern discovery), the correct primitive is an embedding-augmented Markdown vault — not a graph database.

Kuzu (an embedded property graph DB) was evaluated and rejected (see Alternatives Considered). The four goals require embeddings plus an adjacency map plus the existing decay mathematics, not a graph query language.

</details>

## Decision

Extend ADR-011's memory system with the following refinements. The biological model (exponential decay, retrieval strengthening, consolidation lifecycle, git invalidation) is preserved unchanged.

### 1. File format — per-memory Markdown vault

Replace the three JSON stores with one Markdown file per memory under `.valora/memory/{episodic,semantic,decisions}/<id>.md`. Each file consists of:

- **YAML frontmatter** (a constrained subset where every value is a JSON literal, parseable without a YAML library) carrying all metadata: `id`, `category`, `created_at`, `last_accessed_at`, `agent_role`, `session_id`, `source`, `confidence`, `tags`, `related_paths`, `half_life_days`, `access_count`, `content_hash`, `embedding_model`, `embedding_dim`, and `co_access` (a map of `{id: count}` for Hebbian co-retrieval edges).
- **Markdown body** — free-form content, same as today's `content` field.
- **Inline `[[id|kind]]` links** in the body expressing typed associations: `related`, `supersedes`, `decays_from`.

A vault schema version file (`.valora/memory/version`) records the current format revision.

### 2. Embeddings side file

Embedding vectors are stored separately from the `.md` files to avoid bloating human-readable content:

- `.valora/memory/embeddings.bin` — a contiguous `Float32Array` of all vectors
- `.valora/memory/embeddings.index.json` — maps `{ dim, model, entries: { id: byteOffset } }`

The side file is addressable by memory ID and appended-to on every new embedding. Fragmentation is compacted when it exceeds 25%.

### 3. In-memory index (throwaway)

On boot, the vault is scanned to build a `VaultIndex` in memory:

- `byId`, `byCategory`, `byTag`, `byPath`, `byAgent` maps
- Typed adjacency maps (`outEdges`, `inEdges`) derived from frontmatter (Hebbian `co_accessed`) and inline `[[id|kind]]` wikilinks (`related`, `supersedes`, `decays_from`)

Embedding vectors are loaded lazily on the recall path via `openVectorStore`, which streams the contents of `embeddings.bin` and aligns with the persisted `model`/`dim` in `embeddings.index.json`. Loading is deferred to the first `query()` to keep cold-start cost proportional to vault size, not embedding size.

The index is rebuilt from disk on every cold start. An opportunistic snapshot (`.valora/memory/.index-snapshot.bin`) accelerates subsequent boots by rescanning only files whose `mtime` is newer than the snapshot timestamp.

### 4. Embedder — LLMProvider extension

Extend the `LLMProvider` interface (ADR-005) with an optional `embed?()` method:

```ts
embed?(req: EmbeddingRequest): Promise<EmbeddingResult>;
```

The Ollama provider is the first to implement this, using Ollama's OpenAI-compatible `/v1/embeddings` endpoint with `nomic-embed-text` as the default model. The `EmbedderPort` DI port (`src/memory/embeddings/embedder.port.ts`) is the interface consumed by the vault subsystem; the concrete `LlmProviderEmbedder` adapter wraps the active `LLMProvider`.

Embedding model identity is pinned in `embeddings.index.json` and in configuration. A dimension mismatch on boot causes a fast, explicit failure with a remediation message (`valora memory reembed`).

### 5. Recall — ANN seeds and spreading activation

`MemoryManager.query()` gains a semantic path:

1. Embed the query string.
2. Linear cosine ANN top-K seeds (`seed_k: 12`).
3. BFS spreading activation over `related` and `co_accessed` edges to depth 2 with decay factor 0.6.
4. Score by `activation × decayStrength × confidenceWeight`; slice by `injection_token_budget`.
5. Strengthen returned entries; increment `co_access` counts between every pair (Hebbian rule).

When no provider supports `embed()`, the existing tag/path filter and decay-strength sort path is used unchanged.

### 6. Consolidation — cosine clustering

`MemoryConsolidationService` replaces Jaccard-on-tags with cosine similarity clustering (threshold 0.82) over recent episodics. Each cluster is promoted to a new `semantic/*.md` with `[[memberId|decays_from]]` links. The Jaccard path remains as the offline fallback.

<details>
<summary><strong>Alternatives considered</strong></summary>

### Kuzu (embedded property graph DB)

**Rejected.** Kuzu would provide real Cypher queries and a built-in HNSW index, but at the cost of: (a) a binary `.kz` store with no human readability or recoverability, (b) a native `.node` binding in C++ (contradicts ADR-011's "pure TypeScript with file I/O only"), (c) a large per-platform binary bundle, and (d) schema migration concerns on every Valora upgrade. The four goals (semantic recall, consolidation, spreading activation, pattern discovery) are all achievable without Cypher. Kuzu remains a valid future migration target from the Markdown vault if scale demands it.

### SQLite with sqlite-vec

**Rejected.** Requires a native binary dependency, directly contradict ADR-009's `onlyBuiltDependencies: []`. Also explicitly rejected in ADR-011.

### sql.js WASM

**Rejected.** Would be compatible with ADR-009 but adds a dependency we do not need — pure-TS linear cosine is within the performance budget.

### Raw adjacency-list JSON (single graph.json)

**Rejected.** Loses the per-memory file inspectability story and is not openable in Obsidian. The Markdown vault delivers the same structure with better human ergonomics.

### External embedding API (without LLMProvider abstraction)

**Rejected.** Contradicts ADR-005. All LLM-adjacent calls must flow through the provider abstraction to keep the local-first (Ollama) story intact.

</details>

## References

- [ADR-011: Biologically-Inspired Agent Memory System](./011-biologically-inspired-memory.md) — extended by this ADR
- [ADR-005: LLM Provider Abstraction](./005-llm-provider-abstraction.md) — `embed?()` is a new optional method on `LLMProvider`
- [ADR-009: Supply Chain Hardening](./009-supply-chain-hardening.md) — no new native dependencies introduced
- [ADR-012: Plugin Architecture](./012-plugin-architecture.md) — embedding providers ship as plugins via the existing `providers` namespace
- [ADR-003: Session-Based State Management](./003-session-based-state.md) — vault persists under `.valora/memory/`, same per-project convention
