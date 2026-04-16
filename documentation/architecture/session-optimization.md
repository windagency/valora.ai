# Session Optimisation

> How VALORA uses sessions to reduce token consumption, avoid redundant LLM calls, and speed up execution.

## What Session Optimisation Does

Sessions persist state across command executions, enabling several optimisation strategies that activate automatically:

| Optimisation                  | Impact                                 | When Active                              |
| ----------------------------- | -------------------------------------- | ---------------------------------------- |
| **Persistent stage caching**  | **2–3 min saved per context load**     | **Unchanged source documents**           |
| **Prompt caching**            | **Up to 90% input token savings**      | **Tool-loop iterations (all providers)** |
| **Output compression**        | **Reduces tool-result size by 40–80%** | **Shell commands ≥ 500 chars output**    |
| **Proactive history pruning** | **Prevents context growth mid-loop**   | **Stages reaching iteration 8 of 20**    |
| **Tool-result deduplication** | **Eliminates repeated results**        | **Repeated tool calls within a stage**   |
| Loader cache reuse            | 90%+ faster agent loading              | Session resume with fresh cache          |
| Stage output reference        | Eliminates redundant execution         | Multi-command workflows                  |
| Context filtering             | ~40% token reduction                   | Pipelines with `$CONTEXT_*` refs         |
| Snapshot resume               | 2–5× faster startup                    | Session resume with `--session-id`       |
| Debounced persistence         | 80% fewer disk writes                  | Rapid command sequences                  |
| Token tracking                | Full visibility (incl. cache metrics)  | All sessions                             |

---

## How to Use It

### Resuming a Session

```bash
# Resume a specific session for optimised execution
valora implement plan.md --session-id my-feature

# Session caches and context are automatically restored
```

### Multi-Command Workflow Example

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

### Session Mode Indicator

The status bar shows whether running from a resumed session:

```plaintext
⟳ Session ⠴ Processing | claude-3-5-sonnet | analyze | 5s | 1200 tokens
● Live ⠴ Processing | claude-3-5-sonnet | analyze | 5s | 1200 tokens
```

---

## Prompt Caching

Prompt caching is a provider-side optimisation that avoids re-processing identical prefixes across API calls within a tool loop. Each provider handles this differently:

| Provider      | Mechanism                                                            | Config Flag            | Discount |
| ------------- | -------------------------------------------------------------------- | ---------------------- | -------- |
| **Anthropic** | Explicit `cache_control` breakpoints on system, tools, last user msg | `prompt_caching: true` | 90% off  |
| **OpenAI**    | Automatic — reads `prompt_tokens_details.cached_tokens`              | None needed            | 50% off  |
| **Google**    | Automatic — reads `usageMetadata.cachedContentTokenCount`            | None needed            | 75% off  |

Cache metrics (`cache_creation_input_tokens`, `cache_read_input_tokens`) are extracted from all provider responses and displayed in the CLI token usage summary.

---

## Output Compression

Three complementary strategies reduce the token cost of tool results within every tool loop, automatically and without configuration.

### Command-filter compression

Every shell command result passes through a content-aware filter before being appended to the conversation. Outputs below 500 characters are returned unchanged (after ANSI stripping). Above that threshold, per-command filters remove structural noise while preserving meaningful content:

| Command family                  | What is removed                                       |
| ------------------------------- | ----------------------------------------------------- |
| `git diff` / `log` / `status`   | Metadata lines, redundant section headers             |
| `pnpm` / `npm` / `yarn` / `npx` | Progress spinners, peer-dep and audit warnings        |
| `vitest` / `jest`               | Passing test lines (collapsed to a count summary)     |
| `tsc` / `eslint`                | Duplicate diagnostics (grouped by error code or rule) |
| `rg` / `grep`                   | Identical duplicate lines                             |
| `docker`                        | Layer-pull progress lines                             |
| `make`                          | Directory entry/exit banners                          |
| `cargo`                         | Consecutive `Compiling` lines (collapsed to a count)  |
| `python` / `pytest`             | Passing test lines (collapsed to a count summary)     |

Savings are tracked by the `compression.terminal.saved_chars` counter and the `compression.terminal.ratio` gauge, visible in the dashboard Optimisation panel. The dashboard also displays approximate token and cost savings derived from the character count — see below.

### Proactive history pruning

At iteration 8 of a tool loop (40% of the 20-iteration ceiling), old tool-result messages are replaced with:

```
[Tool result omitted to reduce context length]
```

The four most recent messages are always preserved. This prevents context growth from compounding across long-running stages, without waiting for a provider "prompt too long" error.

### Tool-result deduplication

Repeated identical results within a single stage are detected via a fast hash (`toolName:djb2(content)`). The second and subsequent occurrences are replaced with a back-reference:

```
[Same result as message #7 — omitted]
```

This is most effective when the LLM reads the same file or runs the same diagnostic command multiple times in a loop.

---

<details>
<summary><strong>Implementation Details: Command-Filter Compression</strong></summary>

**Files:** `src/executor/output-compression.service.ts`, `src/executor/tool-execution.service.ts`

The filter is dispatched via the `TOOL_FILTERS` dictionary, keyed on the first token of the command string:

```typescript
const TOOL_FILTERS: Record<string, (output: string, command: string) => string> = {
	cargo: filterCargo,
	docker: filterDocker,
	eslint: filterEslint,
	git: filterGit,
	grep: filterRg,
	jest: filterTestRunner,
	make: filterMake,
	npm: filterPackageManager,
	npx: filterPackageManager,
	pnpm: filterPackageManager,
	pytest: filterPython,
	python: filterPython,
	rg: filterRg,
	tsc: filterTsc,
	vitest: filterTestRunner,
	yarn: filterPackageManager
};
```

Unknown commands fall back to an identity function (no-op). The call site uses a stats delta to measure only filter savings, not ANSI-stripping savings:

```typescript
const statsBefore = getCompressionStats();
const compressed = compressTerminalOutput(command, output);
const statsAfter = getCompressionStats();
const filterSavedChars =
	statsAfter.inputChars - statsBefore.inputChars - (statsAfter.outputChars - statsBefore.outputChars);
if (filterSavedChars > 0) {
	getMetricsCollector().incrementCounter('compression.terminal.saved_chars', filterSavedChars);
}
```

Threshold constant: `OUTPUT_COMPRESSION_THRESHOLD = 500` (characters, post ANSI-strip).

</details>

<details>
<summary><strong>Implementation Details: Token and Cost Estimation</strong></summary>

**File:** `src/executor/stage-executor.ts` — `emitCompressionMetrics`

Exact token counts are only available from the provider after a request completes; they cannot be measured for text that was removed before the call. Instead, saved characters are converted to approximate tokens using `⌈savedChars / 4⌉` (4 chars/token is the standard heuristic for English prose and code, as used throughout Valora). Cost is derived from the model's input price via `getModelPricing(model)`, falling back to $3.00/M tokens when the model is unknown.

```typescript
const savedChars = compressionStats.inputChars - compressionStats.outputChars;
const savedTokens = Math.ceil(savedChars / 4); // 4 chars/token heuristic
const pricing = getModelPricing(modelOverride ?? '');
const costPerToken = (pricing?.input ?? 3.0) / 1_000_000; // per-token rate
```

The `~` prefix in the dashboard signals that these values are approximations. For exact per-request costs, see the **Spending** tab, which records actual billed token counts from provider responses.

</details>

<details>
<summary><strong>Implementation Details: Proactive History Pruning</strong></summary>

**File:** `src/executor/stage-executor.ts`

```typescript
const PROACTIVE_COMPRESS_AFTER_ITERATIONS = 8;

// Inside callLLMWithToolLoop:
if (iterations === PROACTIVE_COMPRESS_AFTER_ITERATIONS) {
	prunedCount += this.compressToolResults(messages);
}
```

`compressMessageHistory(messages, keepRecent = 4)` iterates from index 0 to `messages.length - keepRecent - 1`, replacing tool-role messages that have not already been replaced, and returns the count of actual replacements. It is idempotent — already-replaced messages are not double-counted.

The reactive fallback (provider "prompt too long" error) also calls `compressToolResults`, so both proactive and reactive paths share the same implementation. The accumulated `prunedCount` is emitted as `compression.history.pruned_messages` at the end of each tool loop.

</details>

<details>
<summary><strong>Implementation Details: Tool-Result Deduplication</strong></summary>

**File:** `src/executor/stage-executor.ts`

A hash map is initialised once per tool loop and passed into each `processToolCallsInLoop` call:

```typescript
const toolResultHashes = new Map<string, number>(); // toolName:hash → 1-based message index

// For each tool result:
const hashKey = `${toolName}:${djb2(sanitised)}`;
const existingIndex = toolResultHashes.get(hashKey);
if (existingIndex !== undefined) {
    messages.push({ content: `[Same result as message #${existingIndex} — omitted]`, ... });
    batchDedupHits++;
} else {
    toolResultHashes.set(hashKey, messages.length + 1);
    messages.push({ content: sanitised, ... });
}
```

The hash map is scoped to a single stage invocation and is not shared across stages. Accumulated `dedupHits` is emitted as `compression.dedup.hits` at the end of each tool loop.

</details>

---

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
│     └─ Persist (debounced, 1–5s delay)                          │
│                                                                 │
│  Next Command: All optimisations transparently applied          │
└─────────────────────────────────────────────────────────────────┘
```

---

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

---

<details>
<summary><strong>Implementation Details: Persistent Stage Output Caching</strong></summary>

**File:** `src/executor/stage-output-cache.ts`

Context loading stages (such as `context.load-specifications`) are expensive LLM operations that parse and analyse documents. The persistent stage output cache eliminates redundant execution when source files have not changed.

**Cache configuration in pipeline stages:**

```yaml
# In command definition (e.g., create-prd.md)
- stage: context
  prompt: context.load-specifications
  required: true
  cache:
    enabled: true
    ttl_ms: 3600000 # 1 hour
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
  // 1. Stage identifier (stage.stage — the stage name)
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

**Cache storage:**

```plaintext
.valora/cache/stages/
├── a3e79d3e2e16a1e6.json    # Cached stage output
├── b7c45f2a1d8c3e9f.json
└── ...
```

**Cache entry structure:**

```typescript
interface StageCacheEntry {
	stageId: string; // "context.load-specifications"
	inputHash: string; // Hash of inputs at cache time
	createdAt: number; // Timestamp
	ttl_ms: number; // Time-to-live
	outputs: Record<string, unknown>; // Cached outputs
	originalDuration_ms: number; // For metrics
}
```

**Integration with stage executor:**

```typescript
// In stage-executor.ts
async executeStage(stage, context, stageIndex, options) {
  if (stage.cache?.enabled) {
    const cachedResult = await this.checkStageCache(stage, executionContext);
    if (cachedResult) {
      return cachedResult;  // Skip LLM call entirely
    }
  }

  const result = await this.performStageExecution(stage, ...);

  if (stage.cache?.enabled && result.success) {
    await this.storeInCache(stage, executionContext, result);
  }

  return result;
}
```

**Commands with caching enabled:**

| Command          | Stage                                | File Dependencies                 | Estimated Savings |
| ---------------- | ------------------------------------ | --------------------------------- | ----------------- |
| `create-prd`     | `context.load-specifications`        | FUNCTIONAL.md, PRD.md             | 2–3 minutes       |
| `create-backlog` | `context.load-prd`                   | PRD.md                            | 1–2 minutes       |
| `generate-docs`  | `context.load-documentation-context` | PRD.md, FUNCTIONAL.md, BACKLOG.md | 2–3 minutes       |

</details>

<details>
<summary><strong>Implementation Details: Loader Cache Storage and Restoration</strong></summary>

**Files:** `src/cli/command-executor.ts`, `src/executor/agent-loader.ts`

When a command executes successfully, loaded agents and prompts are cached in the session:

```typescript
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

</details>

<details>
<summary><strong>Implementation Details: Stage Output Caching Between Commands</strong></summary>

**File:** `src/cli/command-executor.ts:470-494`

Each command's successful stage outputs are saved to the session:

```typescript
saveStageOutputsToSession(sessionManager, result) {
  const stageOutputs = {};
  for (const stage of result.stages) {
    if (stage.success && stage.outputs) {
      stageOutputs[stage.stage] = stage.outputs;
    }
  }

  const existing = sessionManager.getContext('_stageOutputs') ?? {};
  sessionManager.updateContext('_stageOutputs', { ...existing, ...stageOutputs });
}
```

Stage outputs are keyed by `stage.stage`. Subsequent commands can reference previous outputs via `$STAGE_<stageName>`:

```yaml
# In pipeline stage definition
inputs:
  previous_analysis: $STAGE_analyze.summary
  target_files: $STAGE_plan.files
```

**Impact:** Eliminates redundant LLM calls by referencing cached analysis.

</details>

<details>
<summary><strong>Implementation Details: Context Filtering for Token Reduction</strong></summary>

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
const referencedKeys = extractPipelineContextReferences(command.prompts);
const filteredContext = sessionManager.getFilteredContext([...referencedKeys]);
```

**Impact:** ~40% token reduction by avoiding full session history in prompts.

</details>

<details>
<summary><strong>Implementation Details: Variable Resolution</strong></summary>

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

</details>

<details>
<summary><strong>Implementation Details: Session Snapshot for Fast Resume</strong></summary>

**File:** `src/session/store.ts:23-40, 427-495`

Lightweight snapshots enable fast context restoration:

```typescript
interface SessionSnapshot {
	recent_commands: SessionCommand[]; // Last 3 only
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
| `{id}.json`          | Full session                        | Complete state |
| `{id}.snapshot.json` | Recent commands + essential context | Fast resume    |

Resume flow:

```typescript
async resume(options: SessionResumeOptions) {
  // 1. Load snapshot first (fast, essential context)
  const snapshot = await this.store.loadSnapshot(options.sessionId);

  // 2. Load full session (complete history)
  const session = await this.store.loadSession(options.sessionId);
}
```

**Impact:** 2–5× faster context restoration on session resume.

</details>

<details>
<summary><strong>Implementation Details: Debounced Persistence</strong></summary>

**File:** `src/session/lifecycle.ts:40-194`

Adaptive debouncing reduces disk I/O:

```typescript
SESSION_PERSIST_DEBOUNCE_MS = 1000; // Standard: 1 second
SESSION_PERSIST_EXTENDED_DEBOUNCE_MS = 5000; // Extended: 5 seconds
SESSION_RAPID_COMMAND_THRESHOLD_MS = 10000; // Detection window: 10 seconds
```

Detection logic for rapid command sequences:

```typescript
shouldUseExtendedDebounce(): boolean {
  const currentSessionId = this.currentSession.getSession().session_id;
  const timeSinceLastPersist = Date.now() - this.lastPersistTime;

  return this.lastPersistSessionId === currentSessionId
      && timeSinceLastPersist < RAPID_COMMAND_THRESHOLD_MS;
}
```

Persistence modes:

| Mode      | Delay | Use Case                        |
| --------- | ----- | ------------------------------- |
| Debounced | 1–5s  | Normal command execution        |
| Immediate | 0ms   | Critical: complete, fail, pause |

**Impact:** 80%+ reduction in disk writes during intensive batches.

</details>

---

## Related Documentation

- [System Architecture](./system-architecture.md) — Overall system design
- [Data Flow](./data-flow.md) — How data moves through the system
- [Components](./components.md) — Component responsibilities
