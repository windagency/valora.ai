# ADR-010: Pipeline Resilience and Tool-Failure Observability

> **Decision**: Pipeline stages now emit typed events and metrics counters for tool failures and loop exhaustions, hard-stop after configurable failure thresholds, use verified filesystem state for forced outputs, and support per-stage retry — making previously silent degraded states measurable and controllable.

## Status

Accepted

## Context

The pipeline executor runs each stage through an LLM tool loop (up to 20 iterations).
Two failure modes were identified where the system continued silently in a degraded state:

1. **Tool execution failure** — when a built-in or MCP tool throws an exception the error
   is caught inside `executeToolWithSpan`, converted to the string `"Error: <message>"`,
   and returned to the LLM as an ordinary tool result. The LLM may work around the failure
   without reporting it, producing output that appears valid but is based on incomplete
   information.

2. **Tool loop exhaustion** — when the LLM uses all 20 iterations without producing a
   tool-call-free response, a final LLM call is made with no tools available, asking the
   model to summarise what it did. Because this summary is constructed from LLM memory
   rather than verified state, it can diverge from actual filesystem changes.

Neither failure mode was measurable (no counters, no events, no persistent record) and
neither was represented in the dashboard or session history.

## Decision

We address these gaps with four coordinated changes:

### 1. Typed pipeline events and metrics counters

Two new `PipelineEventType` values are emitted whenever a failure occurs:

| Event                   | Emitted when                                                 |
| ----------------------- | ------------------------------------------------------------ |
| `tool:execution:failed` | A tool call throws and is caught in `executeToolWithSpan`    |
| `tool:loop:exhausted`   | The 20-iteration ceiling is reached in `callLLMWithToolLoop` |

Each emission also increments a named counter in the global `MetricsCollector`:

| Counter                 | Labels                          |
| ----------------------- | ------------------------------- |
| `tool_execution_failed` | `{ tool: "<toolName>" }`        |
| `tool_loop_exhausted`   | `{ stage: "<stage>.<prompt>" }` |

The exhaustion event payload (`ToolLoopExhaustedData`) includes:

- `stage` — which stage hit the limit
- `iterationsUsed` — always 20
- `lastToolsInvoked` — last ≤ 10 tool names (for diagnosing retry loops)
- `messageDepth` — conversation length at exhaustion

The failure event payload (`ToolExecutionFailedData`) includes:

- `toolName`
- `errorMessage`

### 2. Execution summary and grounded forced output

Before falling back to the forced final prompt, `handleMaxIterationsExceeded` calls
`extractExecutionSummary` which scans the full conversation history to produce an
`ExecutionSummary`:

```typescript
interface ExecutionSummary {
	toolFailureCount: number; // role:'tool' messages starting with "Error:"
	verifiedModifiedFiles: string[]; // paths from successful write/search_replace/delete_file
	wasLoopExhausted: boolean;
}
```

The summary is injected into the forced prompt:

- A `VERIFIED files your tools actually wrote` section constrains `files_modified` to
  confirmed results rather than the model's memory.
- A `WARNING: N tool call(s) failed` section requires the model to include failures in
  `implementation_notes.decisions`.

The `ExecutionSummary` is also attached to `StageOutput.metadata.executionQuality` for
downstream inspection.

### 3. Hard-stop threshold

If `toolFailureCount >= MAX_TOOL_FAILURES_BEFORE_HARD_STOP` (default: **5**), the stage
returns `success: false` instead of a degraded completion. A `STAGE_ERROR` event is
emitted with an explanation.

Because the sequential pipeline executor already throws `ExecutionError` for any
`!result.success && stage.required`, a hard-stopped required stage halts the pipeline
immediately. Optional stages let the pipeline continue.

The `executionQuality` metadata gains a `hardStopped: true` flag when this path is taken.

### 4. Per-stage retry

`PipelineStage` gains an optional `retry` field:

```typescript
interface StageRetryConfig {
	maxAttempts?: number; // default 1 (no retry)
	delay_ms?: number; // default 0
}
```

Retry is handled by a new `executeStageWithRetry` wrapper in `PipelineExecutor` that is
used for all sequential stages. On each failed attempt it logs a warning with attempt
number, delay, and error. Parallel stages are **not** retried at the stage level because
their interdependencies are not tracked.

### 5. Persistent quality metrics

`QualityMetrics` gains two new fields:

```typescript
tool_failures?: number;          // total failed tool calls across all stages
tool_loop_exhaustions?: number;  // stages that hit the 20-iteration ceiling
```

`command-executor.ts` aggregates these from `result.stages[].metadata.executionQuality`
after each command and persists them into `SessionCommand.quality_metrics`.

The dashboard's `buildMetricsSummary` combines in-memory counters (current session) with
the persisted session totals (historical) so both panels reflect cross-session history.

## Consequences

### Positive

- **Measurable failures** — tool failures and loop exhaustions are now counted, emitted as
  events, shown in the dashboard, and persisted in session history.
- **Trustworthy forced output** — the exhaustion prompt is grounded in verified filesystem
  state rather than LLM memory.
- **Controlled degradation** — stages with too many failures hard-stop instead of silently
  producing invalid output.
- **Recoverable stages** — command authors can configure per-stage retry for transient
  failures (e.g. shell commands that fail due to race conditions or network timeouts).
- **Cross-session visibility** — engineers can query past sessions to see which stages
  routinely exhaust their iteration budget or accumulate tool failures.

### Negative

- **Hard-stop can be surprising** — a stage that previously limped through 6 failures and
  produced degraded output will now hard-stop. Commands that relied on this behaviour
  must either reduce the failure root cause or raise the threshold.
- **Retry can mask problems** — retrying a stage that consistently fails due to a
  prompt or configuration bug delays diagnosis. The retry log warning must be monitored.
- **Memory overhead** — `extractExecutionSummary` scans the full conversation history at
  exhaustion time (O(n) over messages). For a 20-iteration loop with multiple tools per
  iteration this is at most a few hundred messages, which is negligible.

### Neutral

- The `MAX_TOOL_FAILURES_BEFORE_HARD_STOP` constant is defined in `stage-executor.ts` and
  applies globally. Override per stage via `PipelineStage.max_tool_failures` in the command
  YAML (see Amendment 2026-03-09 below).
- The forced-output JSON template is hardcoded to the `code_changes` shape, which suits
  `code` stages but may not match other stage types. The verified-files injection still
  improves accuracy regardless of the template shape.

## Configuration

### Per-stage retry (command YAML)

```yaml
pipeline:
  - stage: code
    prompt: implement-feature
    required: true
    retry:
      maxAttempts: 3
      delay_ms: 2000
```

### Hard-stop threshold

Defined as a module-level constant in `src/executor/stage-executor.ts`:

```typescript
const MAX_TOOL_FAILURES_BEFORE_HARD_STOP = 5;
```

Raise this value to tolerate more tool failures before stopping. Setting it to a very
high number effectively disables the hard-stop, reverting to the old behaviour.

## Implementation References

- `src/executor/stage-executor.ts` — `handleMaxIterationsExceeded`, `extractExecutionSummary`, `handleNormalCompletion`, `MAX_TOOL_FAILURES_BEFORE_HARD_STOP`
- `src/executor/tool-execution.service.ts` — `executeToolWithSpan` catch block
- `src/executor/pipeline.ts` — `executeStageWithRetry`
- `src/types/pipeline.types.ts` — `ToolLoopExhaustedData`, `ToolExecutionFailedData`, `PipelineEventType`
- `src/types/command.types.ts` — `StageRetryConfig`, `PipelineStage.retry`
- `src/types/session.types.ts` — `QualityMetrics.tool_failures`, `QualityMetrics.tool_loop_exhaustions`
- `src/cli/command-executor.ts` — `updateSessionState` aggregation
- `src/ui/dashboard/panels/metrics-summary-panel.tsx` — "Loop Exhausted" and "Tool Failures" display

---

## Amendment — 2026-03-09: Per-stage limits and guidance-vs-failure distinction

### Context

Two problems were observed in production use of the `implement` command:

1. The `test.code.implement-tests` stage (10 steps: unit tests, integration tests, E2E,
   security, etc.) consistently hit the 20-iteration ceiling.
2. The `documentation.documentation.update-inline-docs` stage both hit the ceiling _and_
   triggered the hard-stop because "File too large" read attempts on source files were
   each counted as tool failures.

### Changes

#### Per-stage iteration and failure limits

`PipelineStage` gains two optional tuning fields:

```typescript
interface PipelineStage {
	/** Override the default 20-iteration ceiling for this stage. */
	max_tool_iterations?: number;
	/** Override the default hard-stop threshold of 5 failures for this stage. */
	max_tool_failures?: number;
}
```

Command YAML usage:

```yaml
- stage: test
  prompt: code.implement-tests
  required: true
  max_tool_iterations: 40 # 10-step prompt needs more room

- stage: documentation
  prompt: documentation.update-inline-docs
  required: true
  max_tool_iterations: 30
  max_tool_failures: 10 # large-file guidance was inflating failure count
```

#### Guidance vs failure: tools now return strings for correctable mistakes

Previously, every "File too large", "File not found", "Text not found in file", etc.
threw a JavaScript `Error`, which was caught by `executeToolWithSpan`, serialised as
`"Error: <message>"`, and therefore counted as a failure by `processToolResult`.

The hard-stop was firing because the LLM routinely reads source files while documenting
code — source files regularly exceed the 100-line limit — so each read attempt burned one
failure token.

The fix: tools distinguish between **genuine failures** (system faults that warrant an
`"Error:"` prefix and increment the counter) and **guidance** (correctable LLM mistakes
that should redirect the LLM without burning a failure token).

**Genuine failures (still throw / return `"Error:"`):**

- `executeToolByName` — unknown tool name (configuration bug)
- `run_terminal_cmd` — exit code ≥ 2 (actual command error)
- OS-level exceptions from `fs` operations

**Guidance (now return plain strings, no `"Error:"` prefix):**

| Tool               | Situation                       | Guidance returned                           |
| ------------------ | ------------------------------- | ------------------------------------------- |
| `read_file`        | Missing `path` arg              | Usage hint                                  |
| `read_file`        | Blocked path                    | Policy explanation                          |
| `read_file`        | File not found                  | Hint to use `list_dir` / `glob_file_search` |
| `read_file`        | Byte size > 1 MB                | Use `head`, `sed -n`, `rg`                  |
| `read_file`        | Line count > 100                | Selective extraction examples               |
| `read_file`        | Structured file (.json/.yaml/…) | Use `jq`/`yq`                               |
| `search_replace`   | Missing args                    | Usage hint                                  |
| `search_replace`   | File not found                  | Hint to verify path first                   |
| `search_replace`   | `old_str` not in file           | Hint to read file first                     |
| `write`            | Missing args                    | Usage hint                                  |
| `write`            | Protected file not yet read     | Hint to read first                          |
| `delete_file`      | Missing `path` arg              | Usage hint                                  |
| `delete_file`      | File not found                  | `"(nothing to delete)"` — idempotent        |
| `list_dir`         | Directory not found             | Hint to verify path                         |
| `list_dir`         | Path is a file                  | Hint to use `read_file`                     |
| `web_search`       | Missing `query` arg             | Usage hint                                  |
| `glob_file_search` | Missing `pattern` arg           | Usage hint                                  |
| `grep`             | Missing `pattern` arg           | Usage hint                                  |
| `codebase_search`  | Missing `query` arg             | Usage hint                                  |
| `query_session`    | Missing / invalid args          | Usage hint with valid actions               |
| `query_session`    | Session not found               | Hint to `list` sessions first               |
| `run_terminal_cmd` | `rg`/`grep` exit code 1         | `"No matches found for: …"`                 |

The `processToolResult` failure-detection rule is unchanged: any tool result whose
content starts with `"Error:"` is a failure; all others are not.

### Updated Neutral consequences

- `MAX_TOOL_FAILURES_BEFORE_HARD_STOP` can now be overridden per stage via
  `PipelineStage.max_tool_failures`.
- The default value of 5 remains appropriate for stages that do not involve heavy
  read-navigation patterns. Stages with large codebases should raise it or the
  "File too large" guidance responses will never accumulate to the threshold anyway.

### Implementation references

- `src/types/command.types.ts` — `PipelineStage.max_tool_iterations`, `PipelineStage.max_tool_failures`
- `src/executor/stage-executor.ts` — `callLLMWithToolLoop`, `handleMaxIterationsExceeded`, `handleNormalCompletion`
- `src/executor/tool-execution.service.ts` — full guidance-vs-failure policy (see file-level JSDoc)
- `src/executor/tools/search-tools.service.ts` — `executeGlobSearch`, `executeGrep`, `executeCodebaseSearch`
- `src/executor/tools/session-tools.service.ts` — `executeQuerySession`, `getSessionDetails`
- `data/commands/implement.md` — `max_tool_iterations` and `max_tool_failures` on `test` and `documentation` stages

---

## Amendment — 2026-03-11: Failure severity, failure policy, and exploratory command guidance

### Context

Pipelines hard-stopped and aborted when exploratory tool failures accumulated during
read-only stages. In the observed case, the `validate-prerequisites` stage ran `which`,
`cd workspace && pwd`, `rg` on non-existent directories, etc. — all returning exit code 1.
Each became an `"Error: Command failed: ..."` result, counted as a failure. After 6
failures (threshold: 5), the stage hard-stopped. Since it was `required: true`, the entire
pipeline aborted before any code was written.

Root causes:

1. `executeTerminalCmd` only converted `rg`/`grep` exit-code-1 to guidance; all other
   commands threw → `"Error:"` → counted as a failure.
2. All tool failures were weighted equally — a failed `which` counted the same as a
   failed `write`.
3. No stage-level policy to distinguish read-only exploration from mutating operations.

### Changes

#### Expanded exploratory command guidance

`isExploratoryExitCode` recognises common exploratory commands that exit with code 1 to
signal "not found" rather than an error:

- `which`, `command -v`, `type` — command existence checks
- `test`, `[`, `[[` — file/condition tests
- `fd` — file finder (same convention as `rg`)
- `cd`-prefixed commands — directory probing

These now return `"Command returned no results: ..."` (guidance) instead of throwing,
so they are not counted as failures.

#### Failure severity classification

`ExecutionSummary` gains two new fields:

```typescript
interface ExecutionSummary {
	toolFailureCount: number; // total (unchanged)
	fatalFailureCount: number; // write/search_replace/delete_file failures
	recoverableFailureCount: number; // all other tool failures
	verifiedModifiedFiles: string[];
	wasLoopExhausted: boolean;
}
```

`processToolResult` now looks up the tool name via a `tool_call_id → tool_name` map
built from assistant messages. Fatal tools (`write`, `search_replace`, `delete_file`)
increment `fatalFailureCount`; all others increment `recoverableFailureCount`.

#### Failure policy (`failure_policy`)

`PipelineStage` gains an optional `failure_policy` field:

```typescript
type FailurePolicy = 'strict' | 'tolerant' | 'lenient';
```

| Policy     | Failures that count toward hard-stop |
| ---------- | ------------------------------------ |
| `strict`   | All failures (total)                 |
| `tolerant` | Fatal failures only                  |
| `lenient`  | None (never hard-stops)              |

Default policies per stage type (`DEFAULT_FAILURE_POLICY`):

| Tolerant (read-only)                                                 | Strict (mutating)                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------- |
| `context`, `review`, `plan`, `breakdown`, `onboard`, `documentation` | `code`, `test`, `refactor`, `deployment`, `maintenance` |

#### Read-only grace (safety net)

Even under `strict` policy, if a stage would hard-stop but has zero modified files and
zero fatal failures, the hard-stop is downgraded to degraded. This protects stages that
are read-only in practice from being killed by recoverable failures.

### Updated Neutral consequences

- `failure_policy` defaults are chosen so that existing `code` and `test` stages retain
  their strict behaviour. Only read-only stage types benefit from the relaxed policy.
- The read-only grace is a conservative safety net — it can never cause harm because no
  files were modified and no mutating operations failed.

### Implementation references

- `src/types/command.types.ts` — `FailurePolicy`, `PipelineStage.failure_policy`
- `src/executor/stage-executor.ts` — `FATAL_TOOLS`, `DEFAULT_FAILURE_POLICY`, `shouldHardStopStage`, updated `processToolResult` and `extractExecutionSummary`
- `src/executor/tool-execution.service.ts` — `isExploratoryExitCode`, `exitCodeOneGuidance`
- `data/commands/_meta/schema.json` — `failure_policy` in pipeline stage schema
- `data/commands/implement.md` — explicit `failure_policy: tolerant` on `context` and `review` stages
