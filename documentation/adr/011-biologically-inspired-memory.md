# ADR-011: Biologically-Inspired Agent Memory System

> **Decision**: Implement a native exponential-decay memory system for Valora agents rather than adopting an external library dependency.

## Status

Accepted

## Context

Valora orchestrates 11 AI agents through multi-stage pipelines, but all learned knowledge is ephemeral — context exists only within a session run. Agents repeat the same mistakes, rediscover the same patterns, and lose architectural decisions between sessions. The `feedback` command analyses workflow outcomes but does not persist findings. The `knowledge-base/` directory exists but is empty.

The Hippo Memory library (github.com/kitfunso/hippo-memory) implements a biologically-inspired model with decay, retrieval strengthening, and consolidation — precisely the characteristics Valora needs. However, a direct dependency was evaluated and rejected (see Alternatives Considered).

## Decision

Build a native biologically-inspired memory system within Valora, comprising:

1. **Three JSON stores** persisted under `.valora/memory/` (gitignored):
   - `episodic.json` — timestamped observations, 7-day default half-life
   - `semantic.json` — consolidated patterns, 30-day default half-life
   - `decisions.json` — architectural decisions, 21-day default half-life

2. **Exponential decay** using the Ebbinghaus forgetting curve: `strength = 0.5^(elapsedDays / halfLifeDays)`

3. **Retrieval strengthening**: each memory access adds `retrieval_boost_days` (default: 2) to the entry's half-life

4. **Error amplification**: entries flagged `isError: true` receive `error_half_life_multiplier ×` (default: 2×) their base half-life, so repeated errors are remembered longer

5. **Confidence tiers**: `verified → observed → inferred → stale`, injected into agent prompts in that priority order

6. **Active git invalidation**: the consolidation cycle reads `git log --name-only` since the last run and weakens entries whose `relatedPaths` intersect with changed files

7. **Jaccard similarity merge**: episodic entries with tag-set overlap ≥ 0.6 are merged into semantic entries — no embeddings or external ML required

8. **Context injection**: the `AGENT MEMORY` section is inserted at step 5.25 of `MessageBuilderService.buildSystemMessage()`, between `projectKnowledge` (step 5) and `codebaseMap` (step 5.5)

9. **CLI command**: `valora consolidate` triggers a manual consolidation cycle; consolidation also runs automatically after a successful `feedback` pipeline

## Consequences

### Positive

- Agents accumulate verified patterns, error signatures, and architectural decisions across sessions without repeating work
- Zero new runtime dependencies — pure TypeScript with file I/O only
- Decay is tunable per category; the system self-prunes without manual intervention
- Git invalidation keeps memory consistent with code evolution (reverted decisions become stale automatically)
- Graceful degradation — all memory operations are non-fatal; if loading or saving fails, the pipeline continues unaffected

### Negative

- JSON stores are not encrypted (unlike session data); memory entries should contain only non-sensitive observations about code patterns
- Jaccard tag similarity is a coarse proxy for semantic similarity — fine-grained deduplication requires embeddings
- Consolidation must be triggered explicitly (or via post-feedback hook); there is no background scheduler

### Neutral

- Memory is stored per-project (`.valora/memory/`), not globally; teams sharing a repository share memory stores if `.valora/memory/` is committed (it is gitignored by default)
- The `injection_token_budget` (default: 2000 tokens) caps injected context; high-volume use may require tuning

## Alternatives Considered

### Hippo Memory (external dependency)

**Rejected.** Hippo Memory requires Node 22.5+ (Valora targets 20+), uses SQLite for persistence (adds a native binary dependency), is designed for single-agent workflows (not 11-agent orchestration), and its buffer-tier model overlaps with Valora's existing `SessionContextManager`. The biological concepts are sound; the implementation constraints are not compatible.

### SQLite with vector embeddings

**Rejected.** Adds a native binary dependency (better-sqlite3), requires an embedding model or external API for similarity search, and substantially increases cold-start time. The Jaccard tag-similarity approach achieves adequate deduplication with zero additional dependencies.

### In-memory only (no persistence)

**Rejected.** Defeats the purpose — cross-session learning requires persistence. In-memory state is already handled by `SessionContextManager`.

### Redis or external key-value store

**Rejected.** Introduces infrastructure dependency; contradicts Valora's "zero infrastructure" design principle (see ADR-001 and ADR-003).

## References

- [Memory System Configuration](../user-guide/configuration.md#memory-system-configuration)
- [ADR-003: Session-Based State Management](./003-session-based-state.md)
- [ADR-004: Pipeline Execution Model](./004-pipeline-execution-model.md)
- [Hippo Memory library](https://github.com/kitfunso/hippo-memory) (evaluated, not adopted)
