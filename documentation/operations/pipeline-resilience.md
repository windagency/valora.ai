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

The LLM does not produce a tool-call-free response within 20 iterations.

**What happens:**

1. `callLLMWithToolLoop` exits the loop after iteration 20.
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

### Degraded stage output

A stage completes but with `toolFailureCount > 0` or `wasLoopExhausted: true`. It still
returns `success: true` unless the [hard-stop threshold](#hard-stop-threshold) is crossed.

**How to detect it:**

Check `StageOutput.metadata.executionQuality` in the pipeline result:

```typescript
const quality = stageOutput.metadata?.executionQuality as
	| {
			degraded: boolean;
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

If a stage accumulates **5 or more** tool call failures, it is hard-stopped:

- `StageOutput.success` is set to `false`.
- `StageOutput.error` contains a human-readable explanation.
- `StageOutput.metadata.executionQuality.hardStopped` is `true`.
- A `STAGE_ERROR` pipeline event is emitted.

**Downstream effect:**

- Required stages (`required: true`) trigger `ExecutionError`, which halts the pipeline.
- Optional stages (`required: false`) allow the pipeline to continue.

**Tuning the threshold:**

The constant `MAX_TOOL_FAILURES_BEFORE_HARD_STOP` is defined in
`src/executor/stage-executor.ts`. Raise it to tolerate more failures; set it very high
to restore the old always-continue behaviour (not recommended).

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
Tool fails (returns "Error: ...")
         ↓
LLM retries the same operation
         ↓  (repeated N times)
Iteration budget exhausted
         ↓
Forced output based on partial state
```

The `lastToolsInvoked` field makes this chain visible: if the same tool appears many
times at the end of the list, a failing tool drove the exhaustion.

If `toolFailureCount >= 5` before the loop exhausts, the stage is [hard-stopped](#hard-stop-threshold)
rather than falling through to a forced output, cutting the loop short and surfacing the
error explicitly.
