# ADR-010: Pipeline Resilience and Tool-Failure Observability

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
  applies globally. Per-stage overrides are not yet supported.
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
