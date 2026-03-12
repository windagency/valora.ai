# Pipeline Resilience — Operations Guide

This guide covers the observable failure modes in the pipeline executor, how the system
responds to each, and how to diagnose and tune the behaviour.

## Failure modes

### Tool execution failure

A tool call (e.g. `run_terminal_cmd`, `read_file`, `write`) throws an exception during
execution.

**What happens:**

1. The exception is caught inside `executeToolWithSpan`.
2. The error message is returned to the LLM as a normal tool result (`"Error: <message>"`).
3. The LLM sees the error on the next iteration and can decide how to react — retry,
   use a different approach, or continue with partial information.
4. A `tool:execution:failed` pipeline event is emitted with `toolName` and `errorMessage`.
5. A `tool_execution_failed` counter is incremented (label: `{ tool: "<toolName>" }`).
6. If the failure count for the stage reaches **5**, the stage is
   [hard-stopped](#hard-stop-threshold).

**What the user sees:**

In the terminal log:

```
✗ Tool run_terminal_cmd failed
```

In the dashboard **Overview** tab:

```
Tool Failures: 3   (shown in red when > 0)
```

In the dashboard **Performance** tab, the `tool_execution_failed` counter appears per
tool name, letting you see which tools fail most.

---

### Tool loop exhaustion

The LLM does not produce a tool-call-free response within the stage's iteration limit
(default: **20**, configurable via `max_tool_iterations` in the stage definition).

**What happens:**

1. `callLLMWithToolLoop` exits the loop after reaching the stage's `max_tool_iterations`
   limit (default: 20).
2. `extractExecutionSummary` scans the conversation history to build a verified record:
   - **`verifiedModifiedFiles`** — paths from successful `write`, `search_replace`,
     and `delete_file` calls (files whose matching tool result did **not** start with
     `"Error:"`).
   - **`toolFailureCount`** — count of tool result messages that started with `"Error:"`.
3. A `tool:loop:exhausted` pipeline event is emitted with `stage`, `iterationsUsed`,
   `lastToolsInvoked`, and `messageDepth`.
4. A `tool_loop_exhausted` counter is incremented (label: `{ stage: "<stage>.<prompt>" }`).
5. A final LLM call is made **without tools** (forced output), with the verified file list
   and failure count injected into the prompt.
6. `StageOutput.metadata.executionQuality` is set with `wasLoopExhausted: true`.

**What the user sees:**

In the terminal log:

```
⚠ Tool loop exceeded maximum iterations (stage: review.code.validate-prerequisites)
⚠ Requesting final structured output (tool loop exhausted) (stage: review.code.validate-prerequisites)
```

In the dashboard **Overview** tab:

```
Loop Exhausted: 1   (shown in yellow when > 0)
```

---

### Guidance vs failure

Not every non-success tool result is counted as a failure. Tools distinguish between
**genuine failures** and **guidance** responses:

- **Genuine failure** — the tool result content starts with `"Error:"`. This increments
  `toolFailureCount` and may eventually trigger the hard-stop. Examples: a shell command
  exits with code ≥ 2, an unknown tool name is invoked.
- **Guidance** — the tool result is a plain string with no `"Error:"` prefix. The LLM
  receives actionable instructions and can self-correct on the next iteration. Guidance
  does **not** increment `toolFailureCount`.

Common guidance situations (do not count as failures):

| Tool               | Situation                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `read_file`        | File not found, line count > 100, byte size > 1 MB, structured file (.json/.yaml)                   |
| `search_replace`   | `old_str` not found in file, file not found                                                         |
| `delete_file`      | File not found (idempotent — nothing to delete)                                                     |
| `list_dir`         | Directory not found, path is a file                                                                 |
| `run_terminal_cmd` | `rg`/`grep` exits with code 1 (no matches found)                                                    |
| `run_terminal_cmd` | Exploratory commands exit with code 1 (`which`, `test`, `[`, `command -v`, `type`, `fd`, `cd && …`) |
| All tools          | Missing required arguments                                                                          |

This distinction matters because the LLM frequently reads large source files during
documentation or test-writing stages. Without it, every "File too large" redirect would
have consumed one of the stage's five allowed failures.

---

### Degraded stage output

A stage completes but with `toolFailureCount > 0` or `wasLoopExhausted: true`. It still
returns `success: true` unless the [hard-stop threshold](#hard-stop-threshold) is crossed.

**How to detect it:**

Check `StageOutput.metadata.executionQuality` in the pipeline result:

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

---

## Hard-stop threshold

If a stage accumulates too many tool call failures, it is hard-stopped:

- `StageOutput.success` is set to `false`.
- `StageOutput.error` contains a human-readable explanation.
- `StageOutput.metadata.executionQuality.hardStopped` is `true`.
- A `STAGE_ERROR` pipeline event is emitted.

**Downstream effect:**

- Required stages (`required: true`) trigger `ExecutionError`, which halts the pipeline.
- Optional stages (`required: false`) allow the pipeline to continue.

### Failure severity

Not all tool failures carry the same weight. Each failure is classified as either
**fatal** or **recoverable**:

| Severity        | Tools                                                                                                | Meaning                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Fatal**       | `write`, `search_replace`, `delete_file`                                                             | Mutating operation failed — state may be corrupted         |
| **Recoverable** | All others (`read_file`, `run_terminal_cmd`, `grep`, `list_dir`, `codebase_search`, MCP tools, etc.) | Read-only / exploratory operation failed — no side-effects |

`ExecutionSummary` tracks both counts:

```typescript
interface ExecutionSummary {
	toolFailureCount: number; // total (fatal + recoverable)
	fatalFailureCount: number; // mutating tools only
	recoverableFailureCount: number; // read-only / exploratory tools
	verifiedModifiedFiles: string[];
	wasLoopExhausted: boolean;
}
```

### Failure policy

The `failure_policy` setting controls **which** failures count toward the hard-stop
threshold:

| Policy     | Failures that count     | Default for stage types                                              |
| ---------- | ----------------------- | -------------------------------------------------------------------- |
| `strict`   | All failures            | `code`, `test`, `refactor`, `deployment`, `maintenance`              |
| `tolerant` | Fatal failures only     | `context`, `review`, `plan`, `breakdown`, `onboard`, `documentation` |
| `lenient`  | None (never hard-stops) | _(none by default)_                                                  |

The policy is resolved as: explicit `failure_policy` on the stage → default for the
stage type (see `DEFAULT_FAILURE_POLICY` in `stage-executor.ts`) → `strict`.

**Configure per stage in command YAML:**

```yaml
- stage: context
  prompt: context.load-implementation-context
  required: true
  failure_policy: tolerant # only fatal (mutating) failures trigger hard-stop

- stage: code
  prompt: code.implement-changes
  required: true
  failure_policy: strict # all failures count (this is the default for code stages)
```

### Read-only grace

Even under `strict` policy, there is a final safety net: if a stage would hard-stop but

1. no files were modified (`verifiedModifiedFiles` is empty), and
2. no fatal failures occurred (`fatalFailureCount` is 0),

then tool failures cannot have left corrupted state. The hard-stop is downgraded to
degraded and the stage completes with `success: true`. A warning is logged:

```
Read-only stage grace: downgrading hard-stop to degraded
```

This protects stages that happen to be read-only in practice (e.g. a `code` stage that
only explored the codebase but did not write any files before hitting the failure
threshold).

### Tuning the threshold

The global default (`MAX_TOOL_FAILURES_BEFORE_HARD_STOP = 5`) is defined in
`src/executor/stage-executor.ts`. Override it for individual stages in the command YAML:

```yaml
- stage: documentation
  prompt: documentation.update-inline-docs
  required: true
  max_tool_failures: 10 # tolerate more failures in doc-heavy stages
```

Setting `max_tool_failures` to a very high number effectively disables the hard-stop for
that stage (not recommended). The global constant acts as a fallback for any stage that
does not declare its own limit.

---

## Per-stage retry

Sequential stages can be configured to retry on failure:

```yaml
# In your command's pipeline definition
- stage: code
  prompt: implement-feature
  required: true
  retry:
    maxAttempts: 3 # try up to 3 times total (default: 1 = no retry)
    delay_ms: 2000 # wait 2 s between attempts (default: 0)
```

**Behaviour:**

1. The stage executes normally.
2. If it returns `success: false`, it is retried up to `maxAttempts - 1` additional times.
3. A warning is logged on each retry:
   ```
   Stage failed, retrying (attempt 2/3): code.implement-feature
   ```
4. The final result (success or failure) is recorded once.

**When to use retry:**

| Scenario                                                     | Recommended?                             |
| ------------------------------------------------------------ | ---------------------------------------- |
| `run_terminal_cmd` fails due to a port conflict or lock file | Yes                                      |
| Network timeout hitting an external API                      | Yes                                      |
| Consistent prompt or configuration bug                       | No — fix the root cause                  |
| Hard-stop due to ≥ 5 tool failures                           | Only if you expect transient tool errors |

**Limitations:**

- Retry applies only to sequential stages. Parallel stages are not retried at the stage
  level.
- Each retry re-executes the full stage, including all LLM calls and tool calls. Idempotent
  tools (write, delete) cache their results, but shell commands and MCP tools do not.

---

## Per-stage iteration and failure limits

Control the tool loop budget and hard-stop sensitivity independently per stage:

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
| `max_tool_failures`   | 5              | Failures before hard-stop                               |
| `failure_policy`      | per stage type | Which failures count: `strict` / `tolerant` / `lenient` |

Only genuine failures (`"Error:"` prefix) count toward `max_tool_failures`. Guidance
responses (file-not-found hints, no-matches, too-large redirects, exploratory command
exit-code-1) do not. Under `tolerant` policy, only fatal (mutating) failures count.

---

## Dashboard

The dashboard **Overview** tab Metrics Summary panel shows two new counters:

| Field              | Colour         | Meaning                                                                 |
| ------------------ | -------------- | ----------------------------------------------------------------------- |
| **Loop Exhausted** | Yellow / Green | Stages that hit the 20-iteration ceiling (current session + historical) |
| **Tool Failures**  | Red / Green    | Total tool call failures (current session + historical)                 |

The dashboard **Performance** tab shows the raw counters with per-label breakdowns:

- `tool_execution_failed { tool: "run_terminal_cmd" }` — which specific tools fail most
- `tool_loop_exhausted { stage: "code.implement-feature" }` — which stages exhaust the loop

Counters in the Performance tab reflect only the **current process lifetime**. The
Overview panel combines them with historical data read from session files.

---

## Session history

After each command, tool failure and exhaustion totals are persisted to
`SessionCommand.quality_metrics`:

```json
{
	"command": "implement",
	"quality_metrics": {
		"tool_failures": 3,
		"tool_loop_exhaustions": 1
	}
}
```

You can query past sessions with the standard session CLI or by reading
`.valora/sessions/<id>/session.json` directly.

---

## Diagnosing a loop exhaustion

When you see the `⚠ Tool loop exceeded maximum iterations` warning, use the following
steps:

1. **Check `lastToolsInvoked`** in the `tool:loop:exhausted` event or log entry. A
   repeated tool name indicates the LLM was stuck in a retry loop on a failing tool.

2. **Check `toolFailureCount`**. If it is high (≥ 3), look for the corresponding
   `tool:execution:failed` events to find which tool was failing and why.
   Note that guidance responses (file-not-found, file-too-large, no-matches) are
   **not** counted. If `toolFailureCount` is 0 but the loop still exhausted, the LLM
   was navigating correctly but the stage simply required more than 20 iterations.
   Raise `max_tool_iterations` in the stage definition.

3. **Check `messageDepth`**. A very high message depth (> 60) suggests the stage prompt
   asks for too much work in a single stage. Consider splitting it.

4. **Check `verifiedModifiedFiles`** in `StageOutput.metadata.executionQuality`. Compare
   with what the stage was supposed to produce. A mismatch reveals that the LLM's forced
   summary diverged from reality.

5. **Enable retry** if the failure is transient. Add `retry: { maxAttempts: 2 }` to the
   stage definition.

6. **Reduce stage scope** if the same stage consistently exhausts the loop. Fewer
   expected changes per stage reduces the number of tool calls needed.

---

## Relationship between failure modes

Tool failures and loop exhaustion are often correlated:

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

The `lastToolsInvoked` field makes this chain visible: if the same tool appears many
times at the end of the list, a failing tool drove the exhaustion.

If `toolFailureCount >= 5` before the loop exhausts, the stage is [hard-stopped](#hard-stop-threshold)
rather than falling through to a forced output, cutting the loop short and surfacing the
error explicitly.
