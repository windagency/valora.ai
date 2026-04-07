# Pipeline Resilience — Operations Guide

This guide covers the observable failure modes in the pipeline executor, how the system responds to each, and how to diagnose and tune the behaviour.

## Failure Scenarios at a Glance

| Failure Mode           | Trigger                                                     | System Response                                                   | Visible Signal                                                                     |
| ---------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Tool execution failure | Tool call throws an exception                               | Error returned to LLM as tool result; counter incremented         | `✗ Tool <name> failed` in terminal; red counter in dashboard                       |
| Tool loop exhaustion   | LLM exceeds `max_tool_iterations` (default: 20)             | Forced final output without tools; stage marked degraded          | `⚠ Tool loop exceeded maximum iterations` in terminal; yellow counter in dashboard |
| Hard stop              | `toolFailureCount` reaches `max_tool_failures` (default: 5) | Stage returns `success: false`; required stages halt the pipeline | `STAGE_ERROR` event emitted                                                        |
| Degraded completion    | Stage completes but with failures or loop exhaustion        | `success: true` with `executionQuality.degraded = true`           | Visible in dashboard Performance tab                                               |

## Retry Configuration

```yaml
# In your command's pipeline definition
- stage: code
  prompt: implement-feature
  required: true
  retry:
    maxAttempts: 3 # try up to 3 times total (default: 1 = no retry)
    delay_ms: 2000 # wait 2 s between attempts (default: 0)
```

When to use retry:

| Scenario                                                     | Recommended?                             |
| ------------------------------------------------------------ | ---------------------------------------- |
| `run_terminal_cmd` fails due to a port conflict or lock file | Yes                                      |
| Network timeout hitting an external API                      | Yes                                      |
| Consistent prompt or configuration bug                       | No — fix the root cause                  |
| Hard stop due to accumulated tool failures                   | Only if you expect transient tool errors |

## Per-Stage Iteration and Failure Limits

```yaml
- stage: test
  prompt: code.implement-tests
  required: true
  max_tool_iterations: 40 # default 20 — increase for multi-file stages
  max_tool_failures: 10 # default 5  — increase when guidance responses are expected

- stage: documentation
  prompt: documentation.update-inline-docs
  required: true
  max_tool_iterations: 30
  max_tool_failures: 10
```

| Field                 | Default        | Effect                                                  |
| --------------------- | -------------- | ------------------------------------------------------- |
| `max_tool_iterations` | 20             | Iterations before forced output                         |
| `max_tool_failures`   | 5              | Failures before hard stop                               |
| `failure_policy`      | per stage type | Which failures count: `strict` / `tolerant` / `lenient` |

## Failure Policy

| Policy     | Failures that count     | Default for stage types                                              |
| ---------- | ----------------------- | -------------------------------------------------------------------- |
| `strict`   | All failures            | `code`, `test`, `refactor`, `deployment`, `maintenance`              |
| `tolerant` | Fatal failures only     | `context`, `review`, `plan`, `breakdown`, `onboard`, `documentation` |
| `lenient`  | None (never hard stops) | _(none by default)_                                                  |

```yaml
- stage: context
  prompt: context.load-implementation-context
  required: true
  failure_policy: tolerant # only fatal (mutating) failures trigger hard stop

- stage: code
  prompt: code.implement-changes
  required: true
  failure_policy: strict # all failures count (this is the default for code stages)
```

## Guidance vs Failure

Not every non-success tool result is counted as a failure. Tools distinguish between **genuine failures** (prefixed `"Error:"`) and **guidance** (plain strings the LLM can act on):

| Tool               | Situation                                                                                   | Treated as |
| ------------------ | ------------------------------------------------------------------------------------------- | ---------- |
| `read_file`        | File not found, line count > 100, byte size > 1 MB, structured file (.json/.yaml)           | Guidance   |
| `search_replace`   | `old_str` not found in file, file not found                                                 | Guidance   |
| `delete_file`      | File not found (idempotent)                                                                 | Guidance   |
| `list_dir`         | Directory not found, path is a file                                                         | Guidance   |
| `run_terminal_cmd` | `rg`/`grep` exits with code 1 (no matches found)                                            | Guidance   |
| `run_terminal_cmd` | Exploratory commands exit with code 1 (`which`, `test`, `[`, `command -v`, `fd`, `cd && …`) | Guidance   |
| `run_terminal_cmd` | Exit code ≥ 2                                                                               | Failure    |

Only genuine failures (`"Error:"` prefix) count toward `max_tool_failures`.

## Dashboard Counters

| Counter            | Colour         | Meaning                                                              |
| ------------------ | -------------- | -------------------------------------------------------------------- |
| **Loop Exhausted** | Yellow / Green | Stages that hit the iteration ceiling (current session + historical) |
| **Tool Failures**  | Red / Green    | Total tool call failures (current session + historical)              |

The Performance tab shows per-label breakdowns: which specific tools fail most and which stages exhaust the loop.

---

<details>
<summary><strong>Implementation Internals</strong></summary>

## Failure Modes in Detail

### Tool Execution Failure

A tool call (e.g. `run_terminal_cmd`, `read_file`, `write`) throws an exception during execution.

**What happens:**

1. The exception is caught inside `executeToolWithSpan`.
2. The error message is returned to the LLM as a normal tool result (`"Error: <message>"`).
3. The LLM sees the error on the next iteration and can decide how to react — retry, use a different approach, or continue with partial information.
4. A `tool:execution:failed` pipeline event is emitted with `toolName` and `errorMessage`.
5. A `tool_execution_failed` counter is incremented (label: `{ tool: "<toolName>" }`).
6. If the failure count for the stage reaches **5**, the stage is hard stopped.

**Terminal output:**

```
✗ Tool run_terminal_cmd failed
```

### Tool Loop Exhaustion

The LLM does not produce a tool-call-free response within the stage's iteration limit.

**What happens:**

1. `callLLMWithToolLoop` exits the loop after reaching `max_tool_iterations`.
2. `extractExecutionSummary` scans the conversation history:
   - **`verifiedModifiedFiles`** — paths from successful `write`, `search_replace`, and `delete_file` calls
   - **`toolFailureCount`** — count of tool result messages starting with `"Error:"`
3. A `tool:loop:exhausted` event is emitted with `stage`, `iterationsUsed`, `lastToolsInvoked`, and `messageDepth`.
4. A final LLM call is made **without tools** (forced output), with the verified file list and failure count injected.
5. `StageOutput.metadata.executionQuality` is set with `wasLoopExhausted: true`.

**Terminal output:**

```
⚠ Tool loop exceeded maximum iterations (stage: review.code.validate-prerequisites)
⚠ Requesting final structured output (tool loop exhausted) (stage: review.code.validate-prerequisites)
```

### Degraded Stage Output

A stage completes but with `toolFailureCount > 0` or `wasLoopExhausted: true`. Check via:

```typescript
const quality = stageOutput.metadata?.executionQuality as
	| {
			degraded: boolean;
			fatalFailureCount: number;
			recoverableFailureCount: number;
			toolFailureCount: number;
			verifiedModifiedFiles: string[];
			wasLoopExhausted: boolean;
			hardStopped?: boolean;
	  }
	| undefined;

if (quality?.degraded) {
	console.warn('Stage completed in degraded state', quality);
}
```

## Hard Stop Threshold

If a stage accumulates too many tool call failures:

- `StageOutput.success` is set to `false`.
- `StageOutput.error` contains a human-readable explanation.
- `StageOutput.metadata.executionQuality.hardStopped` is `true`.
- A `STAGE_ERROR` pipeline event is emitted.

**Downstream effect:**

- Required stages (`required: true`) trigger `ExecutionError`, halting the pipeline.
- Optional stages (`required: false`) allow the pipeline to continue.

### Failure Severity

| Severity        | Tools                                                                                                | Meaning                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Fatal**       | `write`, `search_replace`, `delete_file`                                                             | Mutating operation failed — state may be corrupted         |
| **Recoverable** | All others (`read_file`, `run_terminal_cmd`, `grep`, `list_dir`, `codebase_search`, MCP tools, etc.) | Read-only / exploratory operation failed — no side-effects |

```typescript
interface ExecutionSummary {
	toolFailureCount: number; // total (fatal + recoverable)
	fatalFailureCount: number; // mutating tools only
	recoverableFailureCount: number; // read-only / exploratory tools
	verifiedModifiedFiles: string[];
	wasLoopExhausted: boolean;
}
```

### Read-Only Grace

Even under `strict` policy, if a stage would hard stop but:

1. no files were modified (`verifiedModifiedFiles` is empty), and
2. no fatal failures occurred (`fatalFailureCount` is 0),

then the hard stop is downgraded to degraded and the stage completes with `success: true`:

```
Read-only stage grace: downgrading hard-stop to degraded
```

## Session History

After each command, tool failure and exhaustion totals are persisted:

```json
{
	"command": "implement",
	"quality_metrics": {
		"tool_failures": 3,
		"tool_loop_exhaustions": 1
	}
}
```

Query past sessions via the session CLI or by reading `.valora/sessions/<id>/session.json`.

## Diagnosing a Loop Exhaustion

When you see `⚠ Tool loop exceeded maximum iterations`:

1. **Check `lastToolsInvoked`** in the `tool:loop:exhausted` event. A repeated tool name indicates the LLM was stuck in a retry loop.

2. **Check `toolFailureCount`**. If high (≥ 3), look for `tool:execution:failed` events to find which tool was failing and why. If `toolFailureCount` is 0 but the loop still exhausted, the LLM was navigating correctly but the stage simply required more than 20 iterations. Raise `max_tool_iterations`.

3. **Check `messageDepth`**. A very high depth (> 60) suggests the stage asks for too much work in a single stage. Consider splitting it.

4. **Check `verifiedModifiedFiles`** in `StageOutput.metadata.executionQuality`. A mismatch with what the stage was supposed to produce reveals that the LLM's forced summary diverged from reality.

5. **Enable retry** if the failure is transient. Add `retry: { maxAttempts: 2 }`.

6. **Reduce stage scope** if the same stage consistently exhausts the loop.

## Relationship Between Failure Modes

```
Tool fails (returns "Error: ...")     ← genuine failure, counted
         ↓
LLM retries the same operation
         ↓  (repeated N times)
Iteration budget exhausted
         ↓
Forced output based on partial state

Tool returns guidance string           ← not counted as failure
(file-not-found hint, no-matches, …)
         ↓
LLM adjusts approach and continues
         ↓
Stage completes normally (or hits max_tool_iterations)
```

If `toolFailureCount >= 5` before the loop exhausts, the stage is hard stopped rather than falling through to a forced output.

</details>
