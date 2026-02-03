# ADR-007: Persistent Stage Output Caching

## Status

Accepted

## Context

Context loading stages (such as `context.load-specifications`, `context.load-prd`, and `context.load-documentation-context`) are expensive LLM operations that:

1. Parse and analyse large documents (PRD, FUNCTIONAL, BACKLOG)
2. Extract structured data for subsequent pipeline stages
3. Consume 2-3 minutes of LLM processing time per execution
4. Generate significant token usage costs

When developers iterate on the same project, these context loading stages execute repeatedly even when the source documents haven't changed. This creates unnecessary delays and token consumption.

The existing session-based caching (ADR-003) caches stage outputs within a session, but:

- Requires explicit session resumption (`--session-id`)
- Is limited to in-memory or session-scoped persistence
- Doesn't survive between unrelated command executions

We need a more robust caching mechanism that:

- Persists across command executions without explicit session management
- Invalidates automatically when source documents change
- Integrates seamlessly with the existing pipeline execution model

## Decision

Implement **file-based persistent stage output caching** with the following characteristics:

### 1. Stage-Level Cache Configuration

Add a `cache` property to `PipelineStage` allowing per-stage cache configuration:

```yaml
- stage: context
  prompt: context.load-specifications
  cache:
    enabled: true
    ttl_ms: 3600000  # 1 hour
    file_dependencies:
      - knowledge-base/FUNCTIONAL.md
      - knowledge-base/PRD.md
```

### 2. Content-Based Cache Key Generation

Cache keys are generated from:

- Stage identifier (`stage.prompt`)
- Resolved inputs (excluding large content fields)
- SHA-256 hashes of monitored file contents

This ensures cache invalidation when:

- Different inputs are provided
- Any monitored file is modified

### 3. File-Based Persistence

Cache entries are stored as JSON files in `.ai/cache/stages/`:

- Each entry contains the stage outputs and metadata
- Automatic eviction of oldest entries when capacity is reached
- TTL-based expiration (default: 1 hour)

### 4. Transparent Integration

The stage executor checks the cache before LLM execution:

- On cache hit: Returns cached outputs immediately (0ms execution)
- On cache miss: Executes stage normally, then caches the result

## Consequences

### Positive

- **2-3 minutes saved** per context loading stage when source documents unchanged
- **Reduced token consumption** by eliminating redundant LLM calls
- **No workflow changes required** - caching is transparent to users
- **Automatic invalidation** when source files change
- **Configurable per stage** - can enable/disable for specific stages
- **Works without session management** - benefits all command executions

### Negative

- **Additional disk I/O** for cache reads/writes (mitigated by async operations)
- **Cache management overhead** - eviction, TTL checks, file monitoring
- **Potential stale data** if file monitoring misses an update (mitigated by TTL)
- **Cache directory growth** - requires periodic cleanup (automatic eviction handles this)

### Neutral

- **Cache location** (`.ai/cache/stages/`) is project-specific, not shared across projects
- **TTL default of 1 hour** balances freshness with performance
- **File dependency monitoring** relies on content hashing, not filesystem events

## Alternatives Considered

### Alternative 1: In-Memory LRU Cache

Store cached outputs in memory with LRU eviction.

**Rejected because:**

- Cache lost on process exit
- Limited by Node.js memory constraints
- Doesn't survive between CLI invocations

### Alternative 2: SQLite-Based Cache

Use SQLite for cache storage with indexed lookups.

**Rejected because:**

- Additional dependency (better-sqlite3 or similar)
- Overkill for simple key-value caching
- JSON files are sufficient and easily inspectable

### Alternative 3: Session-Scoped Caching Only

Extend existing session caching to handle context loading stages.

**Rejected because:**

- Requires explicit session management (`--session-id`)
- Adds cognitive overhead for developers
- Doesn't help with first command execution in a session

### Alternative 4: Redis/External Cache

Use Redis or another external cache service.

**Rejected because:**

- Requires external infrastructure
- Overkill for single-developer CLI tool
- Adds deployment complexity

## Implementation Details

### New Files

- `src/executor/stage-output-cache.ts` - `StageOutputCache` service

### Modified Files

- `src/types/command.types.ts` - Added `PipelineStageCacheConfig` interface
- `src/executor/stage-executor.ts` - Integrated cache lookup and storage
- `src/executor/index.ts` - Exported new module

### Commands Enabled

| Command          | Stage                                | File Dependencies                 |
| ---------------- | ------------------------------------ | --------------------------------- |
| `create-prd`     | `context.load-specifications`        | FUNCTIONAL.md, PRD.md             |
| `create-backlog` | `context.load-prd`                   | PRD.md                            |
| `generate-docs`  | `context.load-documentation-context` | PRD.md, FUNCTIONAL.md, BACKLOG.md |

## References

- [ADR-003: Session-Based State Management](./003-session-based-state.md)
- [ADR-004: Pipeline Execution Model](./004-pipeline-execution-model.md)
- [Session Optimisation Architecture](../architecture/session-optimization.md)
