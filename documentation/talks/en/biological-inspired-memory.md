# Teaching Machines to Remember

### A Biologically-Inspired Persistent Memory for AI Agent Orchestration

> Valora orchestrates 11 AI agents, but every session starts with amnesia. This talk traces the evolution of Valora's memory system: from a first version backed by three flat JSON stores and Jaccard tag similarity, to a full Markdown vault — one file per memory, linked by `[[id|kind]]` wikilinks, with optional content embeddings, spreading-activation retrieval, and Hebbian co-access strengthening. No native binaries. No vector database. Just per-memory Markdown files, an Obsidian-compatible graph, and a biological model that now includes Hebbian plasticity and spreading activation alongside the Ebbinghaus forgetting curve.

---

## Table of Contents

| #   | Section                                                                                                                                                            | Duration |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1   | **The Amnesia Problem** — how ephemeral agents repeat mistakes, rediscover patterns, and lose architectural decisions between sessions                             | 3 min    |
| 2   | **Inspiration from Neuroscience** — the Ebbinghaus forgetting curve, spaced repetition, error amplification, hippocampal consolidation, Hebbian plasticity         | 4 min    |
| 3   | **v1: The First Attempt** — three JSON stores, decay engine, confidence tiers; the model that shipped                                                              | 4 min    |
| 4   | **Where v1 Fell Short** — Jaccard coarseness, isolated memories, bucket-scan retrieval                                                                             | 3 min    |
| 5   | **The Vault Insight** — biology isn't just storage, it's a graph; Hebbian plasticity and spreading activation                                                      | 3 min    |
| 6   | **v2 Architecture** — per-memory Markdown files, YAML frontmatter, typed wikilinks, optional embeddings, ANN + BFS recall, Hebbian co-access, cosine consolidation | 9 min    |
| 7   | **Context Injection** — where `AGENT MEMORY` lands in the system prompt, the 2 000-token budget, vault as recall source                                            | 3 min    |
| 8   | **Design Trade-offs & What's Next** — what was rejected for v2, what was preserved from v1, and future directions                                                  | 4 min    |

**Total: ~33 min**

---

## 1. The Amnesia Problem

_3 min_

**Key message:** Valora's agents are capable but forgetful. Every pipeline run starts from zero.

Valora orchestrates 11 specialised AI agents — architect, lead, QA, security, and more — through multi-stage pipelines. Each agent is good at its job. But the moment a session ends, everything learned is gone.

Concretely, this manifests in three ways:

- **Repeated mistakes.** An agent flags the same anti-pattern in sprint 1, sprint 5, and sprint 12. Each time it is a fresh discovery. No one told it this was already known.
- **Rediscovered patterns.** The codebase evolves. Conventions emerge. Agents reverse-engineer them on every run instead of building on accumulated knowledge.
- **Lost decisions.** The team chooses an architectural direction. The agents are not aware of it. They propose alternatives that were already evaluated and rejected.

The `feedback` command analyses pipeline outcomes — but analysis without persistence is noise. The `knowledge-base/` directory existed in the project before this feature. It was empty.

The root cause is simple: the system had no memory.

---

## 2. Inspiration from Neuroscience

_4 min_

**Key message:** The human brain solved this problem 600 million years ago. We borrowed the solution — twice.

In 1885, Hermann Ebbinghaus published the first empirical study of human memory. He memorised nonsense syllables, then measured how quickly he forgot them. The result was the **forgetting curve**: memory strength decays exponentially over time, at a rate that depends on the nature of the memory.

```
Strength
  1.0 |*
      | *
  0.5 |   *          ← half-life
      |      *
  0.1 |          * * * *
      +------------------→ Time
```

Three biological mechanisms compound this baseline:

1. **Spaced repetition.** The act of retrieving a memory strengthens it. Each recall pushes the forgetting curve further into the future. This is why flashcards work.

2. **Error amplification.** The amygdala tags emotionally salient events — particularly mistakes and failures — with extra durability. We remember embarrassments longer than trivia.

3. **Hippocampal consolidation.** Short-term episodic memories are slowly consolidated into long-term semantic memories during low-activity periods (sleep). Individual observations compress into generalisable knowledge.

These three mechanisms are captured in v1. But the brain does something more that v1 missed entirely:

4. **Hebbian plasticity.** "Neurons that fire together wire together." Each time two memories are co-activated, the synaptic connection between them strengthens. Recall is not isolated lookups — it is activation _propagating through an associative graph_.

The biological model is not a metaphor here. It is the specification — for both versions.

---

## 3. v1: The First Attempt

_4 min_

**Key message:** Three stores, three timescales, one coherent model — and one coarse similarity primitive.

In v1, the memory system lived under `.valora/memory/` (gitignored) and comprised three flat JSON stores, each with a distinct semantic purpose and default half-life:

```
.valora/memory/
├── episodic.json    ← timestamped observations        half-life: 7 days
├── semantic.json    ← consolidated patterns           half-life: 30 days
└── decisions.json   ← architectural decisions         half-life: 21 days
```

**`episodic`** entries — raw observations written during pipeline execution. Decay quickly: noisy, context-specific, short-lived by design.

**`semantic`** entries — distilled patterns. "This repository uses named exports exclusively", "integration tests always use Testcontainers". Decay slowly: validated, reusable knowledge.

**`decisions`** entries — architectural choices with rationale. Middle decay rate: decisions age, but the reasoning matters longer than raw observations.

Every entry shared a common structure (`MemoryEntry`):

```typescript
interface MemoryEntry {
	id: string; // mem-{nanoid(12)}
	category: 'episodic' | 'semantic' | 'decisions';
	content: string; // free-form text, may be Markdown
	tags: string[]; // lowercase, kebab-case
	confidence: ConfidenceTier; // 'verified' | 'observed' | 'inferred' | 'stale'
	halfLifeDays: number; // effective half-life, updated on each retrieval
	relatedPaths: string[]; // repo-relative paths (git invalidation)
	isError: boolean; // triggers error amplification
	accessCount: number; // drives spaced-repetition boost
	agentRole: string;
	sessionId: string;
	createdAt: string; // ISO 8601
	lastAccessedAt: string; // ISO 8601
}
```

The **decay engine** (`decay.ts`) implemented the Ebbinghaus model directly:

```typescript
export function computeStrength(referenceAt: string, halfLifeDays: number, now = Date.now()): number {
	const elapsedDays = (now - new Date(referenceAt).getTime()) / MS_PER_DAY;
	return Math.pow(0.5, elapsedDays / halfLifeDays);
}

export function computeEffectiveHalfLife(
	base: number,
	accessCount: number,
	isError: boolean,
	retrievalBoostDays = 2,
	errorMultiplier = 2
): number {
	const b = isError ? base * errorMultiplier : base; // amygdala effect
	return b + accessCount * retrievalBoostDays; // spaced repetition
}
```

The **confidence tier** (`verified → observed → inferred → stale`) was the trust signal injected with every memory into agent prompts. Stale entries were never injected.

The decay engine is storage-agnostic and was carried forward unchanged into v2.

---

## 4. Where v1 Fell Short

_3 min_

**Key message:** The decay model was sound. The similarity primitive and retrieval path were not.

Three limitations drove the v2 redesign:

**1. Jaccard tag similarity is a coarse proxy.**

Consolidation merged episodic entries pairwise using Jaccard overlap on their tag sets:

```
Jaccard(A, B) = |A ∩ B| / |A ∪ B|   →   merge when ≥ 0.6
```

Two entries about the same topic but tagged differently would never merge. ADR-011 itself acknowledged this explicitly: "Jaccard tag similarity is a coarse proxy for semantic similarity — fine-grained deduplication requires embeddings."

**2. Memories were isolated — no associations.**

The JSON stores were flat lists. There was no concept of two memories being _related_. Two entries that were always retrieved together had no way to express that relationship. The system had no associative structure.

**3. Retrieval was a full bucket scan.**

Every query iterated all entries in a category, computed `computeStrength`, and sorted. No semantic search. No graph traversal. No notion that recalling one memory should make associated memories easier to find.

---

## 5. The Vault Insight

_3 min_

**Key message:** Biology isn't just storage. It's a graph. Neurons that fire together wire together.

The insight that drove the v2 design: the Ebbinghaus model captures _individual_ memory dynamics. Hebbian plasticity and spreading activation capture _associative_ dynamics. Both are needed.

**Hebbian co-access.** In v2, every time two memories are co-retrieved in the same query, the system increments `co_access[otherId]` in each entry. This is stored as a frontmatter map — not inline wikilinks — to avoid rewriting file bodies on every recall. Over time, frequently co-activated pairs develop strong `co_accessed` edges. The synapse strengthens.

**Spreading activation.** When retrieval starts at a set of cosine-similarity seed memories, activation propagates outward through the `[[id|kind]]` link graph — along `related` and `co_accessed` edges — to depth 2, with decay factor γ = 0.6. The final score of each candidate is `activation × decayStrength × confidenceWeight`. A pattern you frequently think about together with another becomes mutually easier to recall.

The implementation uses no graph database. The graph is implicit in the Markdown files: wikilinks in the body express typed associations; the `co_access` frontmatter map expresses Hebbian co-retrieval strength. An in-memory `VaultIndex` (adjacency maps `outEdges`, `inEdges`) is built from disk on cold start and discarded — the disk is always the authoritative state.

---

## 6. v2 Architecture

_9 min_

**Key message:** One Markdown file per memory, linked by wikilinks, openable in Obsidian as a living knowledge graph.

### Storage — the Markdown Vault

The three JSON files are replaced by one `.md` file per memory:

```
.valora/memory/
├── version                            ← schema version (integer)
├── meta.json                          ← consolidation timestamps per category
├── embeddings.bin                     ← packed Float32Array of all vectors
├── embeddings.index.json              ← { dim, model, entries: { id: byteOffset } }
├── episodic/
│   └── mem-abc123def456.md            ← half-life: 7 days
├── semantic/                          ← half-life: 30 days
│   └── ...
├── decisions/                         ← half-life: 21 days
│   └── ...
└── .obsidian/                         ← (optional) written by valora-plugin-obsidian
```

The vault is openable in Obsidian as a linked knowledge wiki — `valora-plugin-obsidian` writes `.obsidian/` config, and the `[[wikilink]]` format renders natively.

### File format

Each `.md` file is YAML frontmatter (every value a JSON literal — parseable without a YAML library) followed by free-form Markdown content and inline `[[id|kind]]` wikilinks:

```markdown
---
id: 'mem-abc123def456'
category: 'episodic'
created_at: '2026-04-12T14:32:01.000Z'
last_accessed_at: '2026-04-29T09:15:22.000Z'
updated_at: '2026-04-29T09:15:22.000Z'
agent_role: 'code-reviewer'
session_id: 'sess-xyz'
confidence: 'verified'
tags: ['typescript', 'vitest', 'esm']
related_paths: ['src/memory/vault-store.ts']
half_life_days: 7
access_count: 3
content_hash: 'sha256-abc...'
embedding_model: 'nomic-embed-text'
embedding_dim: 768
co_access: { 'mem-789xyz456abc': 4, 'mem-456pqr789stu': 1 }
is_error: false
---

When migrating ESM imports for vitest, `vite.config.ts` must
set `test.poolOptions.threads.singleThread = true`.

[[mem-789xyz456abc|related]] [[mem-456pqr789stu|decays_from]]
```

`EdgeKind` values: `'related' | 'co_accessed' | 'supersedes' | 'decays_from'`. Wikilink regex: `/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g`. Writes are atomic: write to `<file>.tmp`, then `renameSync`.

### Embeddings side file

Embedding vectors are stored separately to keep `.md` files human-readable:

- `embeddings.bin` — contiguous `Float32Array` of all vectors
- `embeddings.index.json` — maps `{ dim, model, entries: { id: byteOffset } }`

The embedder is optional: `LLMProvider` (ADR-005) gains an optional `embed?()` method, implemented first by the Ollama adapter with `nomic-embed-text`. When no provider implements `embed()`, the system falls back to lexical/Jaccard — **zero code-path changes**.

### Recall — ANN seeds + spreading activation

`MemoryManager.query()` follows a 5-step semantic path when an embedder is configured:

1. **Embed** the query string via `EmbedderPort`.
2. **Cosine ANN** — linear scan of `embeddings.bin` for top-K seeds (K = 12). O(N × dim) pure TypeScript; within 50 ms p95 for 50 000 × 768 dimensions. No HNSW index needed.
3. **BFS spreading activation** over `related` and `co_accessed` edges to depth 2, γ = 0.6. Propagates forward and in reverse — bidirectional traversal.
4. **Score**: `activation × decayStrength × confidenceWeight`. Weights: `verified = 1.0`, `observed = 0.7`, `inferred = 0.4`, `stale = 0.1`.
5. **Strengthen** retrieved entries (spaced repetition), then **increment `co_access`** between every co-retrieved pair (Hebbian rule). The synapse strengthens.

### Consolidation — cosine clustering

`MemoryConsolidationService` replaces Jaccard with cosine similarity clustering (threshold 0.82) over recent episodic embeddings:

1. **Prune** — same as v1: remove entries below strength 0.05.
2. **Git invalidation** — same as v1: downgrade entries whose `relatedPaths` intersect changed files to `stale`.
3. **Cosine clustering** — cluster recent episodic entries at 0.82 threshold. Each cluster is promoted to a new `semantic/*.md` with `[[memberId|decays_from]]` links. Originating episodics are removed. The Jaccard path remains as the offline fallback when no embedder is configured.
4. **Auto-promote** — same as v1: high-access `verified` episodic entries not caught by clustering are promoted to semantic directly.

---

## 7. Context Injection

_3 min_

**Key message:** Memory reaches agents at exactly the right moment. The injection point and format are unchanged from v1.

Every agent receives a system message assembled by `MessageBuilderService.buildSystemMessage()`. Memory is inserted at **step 5.25**, between `projectKnowledge` and `codebaseMap`:

```
1    Project Guidance
2    Agent Profile
3    Prompt Content
4    Available Agents
5    Project Knowledge
5.25 ← AGENT MEMORY   (learned patterns & decisions)
5.5  Codebase Map
6    Output Format
7    Escalation
```

The injected block is formatted by `formatMemoryForInjection()`:

```markdown
## AGENT MEMORY (LEARNED PATTERNS & DECISIONS)

Memories from previous sessions, grouped by confidence.
Weight decisions accordingly: VERIFIED > OBSERVED > INFERRED.

### VERIFIED MEMORIES

- **[decisions]** Auth middleware rewritten for compliance, not tech debt _(files: src/auth/middleware.ts)_
  _Tags: auth, compliance, architecture_

### OBSERVED MEMORIES

- **[semantic]** All integration tests use Testcontainers; mock-based tests are forbidden
  _Tags: testing, integration, containers_
```

The formatter respects a **token budget** (default: 2 000 tokens) with a 90% safety margin. It fills the budget top-down: `verified` first, then `observed`, then `inferred`. Stale entries are excluded entirely. The source of retrieved memories is now the vault via spreading-activation recall, not a flat JSON bucket scan — but the format and priority order are identical.

All memory operations are wrapped in `SafeExecutor`: a failure to load or write memory is logged and ignored. The pipeline always continues unaffected.

---

## 8. Design Trade-offs & What's Next

_4 min_

**Key message:** Every alternative was evaluated against Valora's constraints. The biological model — and its core discipline — survived both versions.

### What was preserved from v1

- Exponential decay (Ebbinghaus) — unchanged in `decay.ts`
- Error amplification (amygdala) — `isError → halfLife × 2`, unchanged
- Spaced repetition — `halfLife += accessCount × retrievalBoostDays`, unchanged
- Confidence tiers (`verified → observed → inferred → stale`) — unchanged
- Git-based invalidation — unchanged
- Zero new runtime dependencies — maintained: pure TypeScript, file I/O, packed `Float32Array`
- Graceful degradation — extended: lexical fallback when no embedder is configured

### What was rejected for v2 (ADR-013)

| Alternative                        | Why Rejected                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Kuzu** (embedded property graph) | Native C++ `.node` binding; opaque binary `.kz` store; Cypher unnecessary — goals achievable with pure TS + BFS |
| **SQLite + sqlite-vec**            | Native binary; contradicts ADR-009 `onlyBuiltDependencies: []`; also rejected in ADR-011                        |
| **sql.js WASM**                    | ADR-009 compatible but unnecessary — pure-TS linear cosine scan is within the performance budget                |
| **Single `graph.json`**            | Loses per-memory file inspectability; not openable in Obsidian                                                  |
| **External embedding API**         | Contradicts ADR-005 provider abstraction; breaks local-first (Ollama) story                                     |

### Known trade-offs accepted

- Many small `.md` files place more pressure on the file system than three JSON blobs. Relevant for network-drive or cloud-sync environments.
- Cold-start vault scan: ~150–300 ms for 5 000 entries; mitigated by an opportunistic index snapshot (`.index-snapshot.bin`) for subsequent boots (< 100 ms).
- Embedding model identity is pinned to the vault; switching models requires `valora memory reembed`.

### What comes next

- Pattern discovery — identifying recurring structural patterns across consolidated semantic memories.
- Future Kuzu migration — the Markdown vault is a clean export target if scale demands a graph query language.
- Optional encrypted stores for security-sensitive projects.
- Global (cross-repository) memory for organisations sharing patterns across projects.

---

> **Tip:** Sections 5 and 6 are the technical heart — reserve time for questions there.
> Section 8's trade-offs land harder after the audience has seen the vault in action.
> If a live demo is available, swap the last 2 min of section 8 for a `valora consolidate` run and a before/after vault diff to make context injection tangible.
