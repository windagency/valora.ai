# Session Optimisation Architecture

This document describes how VALORA uses sessions to optimise requests, reduce token consumption, and speed up execution.

## Overview

Sessions provide persistent state across command executions, enabling multiple optimisation strategies:

- **Loader Cache Reuse**: Avoid re-parsing agent and prompt files
- **Stage Output Caching**: Reference previous command outputs without re-execution
- **Context Filtering**: Pass only referenced context to LLM calls
- **Snapshot Resume**: Fast context restoration on session resume
- **Debounced Persistence**: Reduce disk I/O during intensive operations
- **Token Tracking**: Session-wide visibility for cost management

## Architecture Components

```plaintext
┌─────────────────────────────────────────────────────────────────┐
│                     Session Management                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │  SessionStore   │    │ SessionLifecycle│                    │
│  │  (Persistence)  │◄───│  (Operations)   │                    │
│  └────────┬────────┘    └────────┬────────┘                    │
│           │                      │                              │
│           ▼                      ▼                              │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │ Session Files   │    │ SessionContext  │                    │
│  │ + Snapshots     │    │    Manager      │                    │
│  └─────────────────┘    └────────┬────────┘                    │
│                                  │                              │
│                                  ▼                              │
│                         ┌─────────────────┐                    │
│                         │ CLISessionMgr   │                    │
│                         │ (Coordination)  │                    │
│                         └─────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

## Optimisation Mechanisms

### 1. Persistent Stage Output Caching

**File:** `src/executor/stage-output-cache.ts`

Context loading stages (like `context.load-specifications`) are expensive LLM operations that parse and analyse documents. The persistent stage output cache eliminates redundant execution when source files haven't changed.

**Cache configuration in pipeline stages:**

```yaml
# In command definition (e.g., create-prd.md)
- stage: context
  prompt: context.load-specifications
  required: true
  cache:
    enabled: true
    ttl_ms: 3600000  # 1 hour
    file_dependencies:
      - knowledge-base/FUNCTIONAL.md
      - knowledge-base/PRD.md
  inputs:
    specs_file_arg: $ARG_specs_file
```

**Cache key generation:**

```typescript
generateCacheKey(stageId, inputs, config): string {
  // Hash includes:
  // 1. Stage identifier (stage.prompt)
  // 2. Resolved inputs
  // 3. File dependency content hashes
  return sha256({ stageId, inputs, fileHashes }).substring(0, 24);
}
```

**Cache invalidation triggers:**

| Trigger             | Description                                           |
| ------------------- | ----------------------------------------------------- |
| File content change | Any monitored file in `file_dependencies` is modified |
| TTL expiration      | Cache entry older than `ttl_ms` (default: 1 hour)     |
| Input change        | Different inputs produce different cache key          |
| Manual invalidation | `stageOutputCache.invalidate()` or `clear()`          |

**Cache storage location:**

```plaintext
.ai/cache/stages/
├── a3e79d3e2e16a1e6.json    # Cached stage output
├── b7c45f2a1d8c3e9f.json
└── ...
```

**Cache entry structure:**

```typescript
interface StageCacheEntry {
  stageId: string;              // "context.load-specifications"
  inputHash: string;            // Hash of inputs at cache time
  createdAt: number;            // Timestamp
  ttl_ms: number;               // Time-to-live
  outputs: Record<string, unknown>;  // Cached outputs
  originalDuration_ms: number;  // For metrics
}
```

**Integration with stage executor:**

```typescript
// In stage-executor.ts
async executeStage(stage, context, stageIndex, options) {
  // Check cache first
  if (stage.cache?.enabled) {
    const cachedResult = await this.checkStageCache(stage, executionContext);
    if (cachedResult) {
      return cachedResult;  // Skip LLM call entirely
    }
  }

  // Execute stage normally
  const result = await this.performStageExecution(stage, ...);

  // Cache successful results
  if (stage.cache?.enabled && result.success) {
    await this.storeInCache(stage, executionContext, result);
  }

  return result;
}
```

**Commands with caching enabled:**

| Command          | Stage                                | File Dependencies                 | Estimated Savings |
| ---------------- | ------------------------------------ | --------------------------------- | ----------------- |
| `create-prd`     | `context.load-specifications`        | FUNCTIONAL.md, PRD.md             | 2-3 minutes       |
| `create-backlog` | `context.load-prd`                   | PRD.md                            | 1-2 minutes       |
| `generate-docs`  | `context.load-documentation-context` | PRD.md, FUNCTIONAL.md, BACKLOG.md | 2-3 minutes       |

**Impact:** 2-3 minutes saved per command execution when source documents haven't changed.

### 2. Loader Cache Storage & Restoration

**Files:** `src/cli/command-executor.ts`, `src/executor/agent-loader.ts`

When a command executes successfully, loaded agents and prompts are cached in the session:

```typescript
// Export cache after command execution
saveLoaderCachesToSession(sessionManager) {
  const cachedAgents = this.agentLoader.exportCache();
  sessionManager.updateContext('_loaderCache', {
    agents: cachedAgents,
    savedAt: Date.now()
  });
}
```

On session resume, caches are restored if still fresh (5-minute TTL):

```typescript
// Restore cache on resume
restoreLoaderCachesFromSession(sessionContext) {
  const loaderCache = sessionContext['_loaderCache'];
  const cacheAge = Date.now() - loaderCache.savedAt;

  if (cacheAge < 5 * 60 * 1000) {  // 5-minute TTL
    for (const [role, data] of Object.entries(loaderCache.agents)) {
      this.agentLoader.injectCachedAgent(role, data);
    }
  }
}
```

**Impact:** 90%+ faster agent loading by eliminating file I/O and markdown parsing.

### 2. Stage Output Caching Between Commands

**File:** `src/cli/command-executor.ts:470-494`

Each command's successful stage outputs are saved to the session:

```typescript
saveStageOutputsToSession(sessionManager, result) {
  const stageOutputs = {};
  for (const stage of result.stages) {
    if (stage.success && stage.outputs) {
      const stageKey = `${stage.stage}_${stage.prompt}`;
      stageOutputs[stageKey] = stage.outputs;
    }
  }

  // Merge with existing outputs
  const existing = sessionManager.getContext('_stageOutputs') ?? {};
  sessionManager.updateContext('_stageOutputs', { ...existing, ...stageOutputs });
}
```

Subsequent commands can reference previous outputs via variable resolution:

```yaml
# In pipeline stage definition
inputs:
  previous_analysis: $STAGE_analyze_context.summary
  target_files: $STAGE_plan.files
```

**Impact:** Eliminates redundant LLM calls by referencing cached analysis.

### 3. Context Filtering for Token Reduction

**Files:** `src/cli/execution-coordinator.ts:603-620`, `src/session/context.ts:246-297`

Before execution, the system scans pipeline stages for `$CONTEXT_*` references:

```typescript
extractPipelineContextReferences(prompts): Set<string> {
  const references = new Set<string>();

  for (const stage of prompts.pipeline) {
    if (stage.inputs) {
      const refs = SessionContextManager.extractContextReferences(stage.inputs);
      refs.forEach(ref => references.add(ref));
    }
  }

  return references;
}
```

Only referenced context is passed to the execution:

```typescript
// Filter context to only what's needed
const referencedKeys = extractPipelineContextReferences(command.prompts);
const filteredContext = sessionManager.getFilteredContext([...referencedKeys]);
```

**Impact:** ~40% token reduction by avoiding full session history in prompts.

### 4. Variable Resolution with Session Data

**File:** `src/executor/variable-resolution.service.ts`

The variable resolver integrates multiple data sources:

| Pattern      | Source               | Description                 |
| ------------ | -------------------- | --------------------------- |
| `$ARG_*`     | Command arguments    | `$ARG_1`, `$ARG_specs_file` |
| `$STAGE_*`   | Cached stage outputs | `$STAGE_plan.files`         |
| `$CONTEXT_*` | Session context      | `$CONTEXT_targetFiles`      |
| `$ENV_*`     | Environment          | `$ENV_HOME`                 |

Resolution priority ensures fresh data takes precedence:

```typescript
resolve(template: string): string {
  // 1. Stage outputs (most recent)
  // 2. Session context (persisted)
  // 3. Arguments (command-specific)
  // 4. Environment (system)
}
```

**Impact:** Seamless cross-command data sharing without re-fetching.

### 5. Session Snapshot for Fast Resume

**File:** `src/session/store.ts:23-40, 427-495`

Lightweight snapshots enable fast context restoration:

```typescript
interface SessionSnapshot {
  recent_commands: SessionCommand[];  // Last 3 only
  essential_context: {
    _loaderCache?: unknown;
    _stageOutputs?: unknown;
  };
  full_command_count: number;
  snapshot_version: number;
}
```

Dual-file storage strategy:

| File Type            | Content                             | Purpose        |
| -------------------- | ----------------------------------- | -------------- |
| `{id}.json`          | Full session, encrypted             | Complete state |
| `{id}.snapshot.json` | Recent commands + essential context | Fast resume    |

Resume flow:

```typescript
async resume(options: SessionResumeOptions) {
  // 1. Load snapshot first (fast, essential context)
  const snapshot = await this.store.loadSnapshot(options.sessionId);

  // 2. Load full session (complete history)
  const session = await this.store.loadSession(options.sessionId);

  // Snapshot provides early context while full session loads
}
```

**Impact:** 2-5x faster context restoration on session resume.

### 6. Debounced Persistence

**File:** `src/session/lifecycle.ts:40-194`

Adaptive debouncing reduces disk I/O:

```typescript
// Configuration (from config/constants.ts)
SESSION_PERSIST_DEBOUNCE_MS = 1000          // Standard: 1 second
SESSION_PERSIST_EXTENDED_DEBOUNCE_MS = 5000 // Extended: 5 seconds
SESSION_RAPID_COMMAND_THRESHOLD_MS = 10000  // Detection window: 10 seconds
```

Detection logic for rapid command sequences:

```typescript
shouldUseExtendedDebounce(): boolean {
  const currentSessionId = this.currentSession.getSession().session_id;
  const timeSinceLastPersist = Date.now() - this.lastPersistTime;

  // Use extended debounce if same session and recent persist
  return this.lastPersistSessionId === currentSessionId
      && timeSinceLastPersist < RAPID_COMMAND_THRESHOLD_MS;
}
```

Persistence modes:

| Mode      | Delay | Use Case                        |
| --------- | ----- | ------------------------------- |
| Debounced | 1-5s  | Normal command execution        |
| Immediate | 0ms   | Critical: complete, fail, pause |

**Impact:** 80%+ reduction in disk writes during intensive batches.

### 7. Session Mode Indicator

**File:** `src/output/processing-feedback.ts`

The status bar indicates whether running from a resumed session:

```plaintext
⟳ Session ⠴ Processing | claude-3-5-sonnet | analyze | 5s | 1200 tokens
● Live ⠴ Processing | claude-3-5-sonnet | analyze | 5s | 1200 tokens
```

This helps users understand when session optimisations are active.

## Integration Flow

```plaintext
┌─────────────────────────────────────────────────────────────────┐
│ Command Execution with Session Optimisation                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Session Acquisition                                         │
│     ├─ --session-id provided? → Resume existing session         │
│     ├─ Load snapshot (fast, essential context)                  │
│     └─ Load full session (complete history)                     │
│                                                                 │
│  2. Cache Restoration (if fresh, <5 min)                        │
│     ├─ Inject cached agents → skip file parsing                 │
│     └─ Import stage outputs → enable $STAGE_* resolution        │
│                                                                 │
│  3. Context Preparation                                         │
│     ├─ Scan pipeline for $CONTEXT_* references                  │
│     └─ Filter context to only referenced keys                   │
│                                                                 │
│  4. Pipeline Execution                                          │
│     ├─ Variable resolution uses session data                    │
│     ├─ Session mode indicator shown (Live/Session)              │
│     └─ LLM calls with minimal context payload                   │
│                                                                 │
│  5. Post-Execution Persistence                                  │
│     ├─ Merge outputs → session.context                          │
│     ├─ Save stage outputs → session._stageOutputs               │
│     ├─ Export loader caches → session._loaderCache              │
│     ├─ Accumulate tokens → session.total_tokens_used            │
│     └─ Persist (debounced, 1-5s delay)                          │
│                                                                 │
│  Next Command: All optimisations transparently applied          │
└─────────────────────────────────────────────────────────────────┘
```

## Performance Summary

| Optimisation                 | Impact                             | When Active                        |
| ---------------------------- | ---------------------------------- | ---------------------------------- |
| **Persistent stage caching** | **2-3 min saved per context load** | **Unchanged source documents**     |
| Loader cache reuse           | 90%+ faster agent loading          | Session resume with fresh cache    |
| Stage output reference       | Eliminates redundant execution     | Multi-command workflows            |
| Context filtering            | ~40% token reduction               | Pipelines with `$CONTEXT_*` refs   |
| Snapshot resume              | 2-5x faster startup                | Session resume with `--session-id` |
| Debounced persistence        | 80% fewer disk writes              | Rapid command sequences            |
| Token tracking               | Full visibility                    | All sessions                       |

## Usage

### Resuming a Session

```bash
# Resume specific session for optimized execution
valora implement plan.md --session-id my-feature

# Session caches and context automatically restored
```

### Workflow Example

```bash
# Command 1: Plan (creates session context)
valora plan "Add user authentication" --session-id auth-feature

# Command 2: Implement (uses cached agents, references plan output)
valora implement plan.md --session-id auth-feature

# Command 3: Test (references implementation output)
valora test --session-id auth-feature
```

Each subsequent command benefits from:

- Cached agent definitions (no re-parsing)
- Previous stage outputs (no re-analysis)
- Accumulated context (progressive understanding)

## Configuration

Session optimisation settings in `src/config/constants.ts`:

```typescript
// Persistence timing
export const SESSION_PERSIST_DEBOUNCE_MS = 1000;
export const SESSION_PERSIST_EXTENDED_DEBOUNCE_MS = 5000;
export const SESSION_RAPID_COMMAND_THRESHOLD_MS = 10000;

// Session lifecycle
export const SESSION_ARCHIVE_DAYS = 30;
export const SESSION_CLEANUP_DAYS = 90;
```

## Related Documentation

- [System Architecture](./system-architecture.md) - Overall system design
- [Data Flow](./data-flow.md) - How data moves through the system
- [Components](./components.md) - Component responsibilities
