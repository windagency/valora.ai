# Metrics System Architecture

> Architecture of the workflow metrics collection, extraction, and reporting system in VALORA.

## What Metrics Are Collected

### Optimisation Metrics (per command)

| Field                  | Type                                    | Description                                |
| ---------------------- | --------------------------------------- | ------------------------------------------ |
| `complexity_score`     | `number`                                | Task complexity (0–10 scale)               |
| `early_exit_triggered` | `boolean`                               | Whether review confidence skipped stages   |
| `initial_confidence`   | `number`                                | Confidence score that triggered early exit |
| `pattern_detected`     | `string`                                | Detected planning pattern (e.g. REST_API)  |
| `pattern_confidence`   | `number`                                | Confidence in pattern detection            |
| `planning_mode`        | `'express' \| 'template' \| 'standard'` | Which planning path was taken              |
| `template_used`        | `string`                                | Template identifier if mode is `template`  |
| `time_saved_minutes`   | `number`                                | Estimated minutes saved vs baseline        |

### Quality Metrics (per command)

| Field                   | Type      | Description                                        |
| ----------------------- | --------- | -------------------------------------------------- |
| `auto_fixes_applied`    | `number`  | Linter errors fixed automatically                  |
| `files_generated`       | `number`  | Files created or modified                          |
| `iterations`            | `number`  | Review/implementation iteration count              |
| `lint_errors_assert`    | `number`  | Linter errors found at assert phase                |
| `lint_errors_realtime`  | `number`  | Linter errors caught in real-time during implement |
| `plan_approved`         | `boolean` | Whether the plan passed review                     |
| `review_score`          | `number`  | Numeric review quality score                       |
| `test_failures`         | `number`  | Test failures in assert phase                      |
| `test_passes`           | `number`  | Tests passing in assert phase                      |
| `tool_failures`         | `number`  | Total tool call failures across all stages         |
| `tool_loop_exhaustions` | `number`  | Stages that hit the 20-iteration tool loop ceiling |

### Pipeline Resilience Metrics (per stage)

| Counter/Event           | Labels      | Emitted When                                                 |
| ----------------------- | ----------- | ------------------------------------------------------------ |
| `tool_execution_failed` | `{ tool }`  | A tool call exception is caught in `executeToolWithSpan`     |
| `tool_loop_exhausted`   | `{ stage }` | The 20-iteration ceiling is reached in `callLLMWithToolLoop` |

The dashboard **Metrics Summary** panel shows:

```plaintext
Loop Exhausted: N   ← yellow if > 0, green if 0
Tool Failures:  N   ← red if > 0, green if 0
```

For detailed per-stage and per-tool breakdown, switch to the **Performance** tab.

---

## How to Access Metrics

```bash
# View spending summary
valora monitoring spending

# Extract metrics JSON (last 30 days)
pnpm tsx scripts/extract-metrics.ts 30d

# Extract metrics JSON (last 7 days)
pnpm tsx scripts/extract-metrics.ts 7d

# Generate markdown dashboard report
pnpm tsx scripts/extract-metrics.ts 30d | pnpm tsx scripts/generate-dashboard.ts
```

The `SpendingTracker` (`src/utils/spending-tracker.ts`) provides four query methods:

| Method              | Returns                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `getRecords(opts?)` | Raw records, optionally filtered by command or date                        |
| `getByEndpoint()`   | Per-command summaries, sorted by total cost descending                     |
| `getExpensive(n)`   | Top N records sorted by `costUsd` descending                               |
| `getTotals()`       | Aggregate `totalCostUsd`, `cacheSavingsUsd`, `requestCount`, `totalTokens` |

These methods back both `valora monitoring spending` and the dashboard **Spending** sub-tab.

---

## System Architecture

```plaintext
┌─────────────────────────────────────────────────────────────┐
│                    COLLECTION LAYER                          │
├─────────────────────────────────────────────────────────────┤
│  Workflow Commands (/plan, /review-plan, /implement, /assert)│
│          │                                                   │
│          ↓                                                   │
│  Command Executor (command-executor.ts)                      │
│     ├─ Extract optimization_metrics from outputs             │
│     ├─ Extract quality_metrics from outputs                  │
│     └─ Pass to Session Context Manager                       │
│          │                                                   │
│          ↓                                                   │
│  Session Context Manager (context.ts)                        │
│     └─ addCommand(..., optimization_metrics, quality_metrics)│
│          │                                                   │
│          ↓                                                   │
│  Session Lifecycle (lifecycle.ts) → debounced disk write     │
│          │                                                   │
│          ↓                                                   │
│  Session Store → .valora/sessions/<id>/session.json          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   EXTRACTION LAYER                           │
├─────────────────────────────────────────────────────────────┤
│  extract-metrics.ts                                          │
│     ├─ Scan .valora/sessions/*/*.json                        │
│     ├─ Filter by date range (7d/30d)                         │
│     ├─ Parse Session or SessionLog format                    │
│     ├─ Aggregate metrics by type                             │
│     ├─ Calculate averages and percentages                    │
│     └─ Output JSON summary                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  PRESENTATION LAYER                          │
├─────────────────────────────────────────────────────────────┤
│  generate-dashboard.ts                                       │
│     ├─ Read metrics JSON                                     │
│     ├─ Generate ASCII visualisations                         │
│     ├─ Create markdown report                                │
│     ├─ Add recommendations based on targets                  │
│     └─ Write .valora/METRICS_REPORT.md                       │
└─────────────────────────────────────────────────────────────┘
```

---

<details>
<summary><strong>Data Model: TypeScript Type Definitions</strong></summary>

Defined in `src/types/session.types.ts`:

```typescript
export interface OptimizationMetrics {
	complexity_score?: number;
	early_exit_confidence?: number;
	early_exit_triggered?: boolean;
	initial_confidence?: number;
	pattern_detected?: string;
	pattern_confidence?: number;
	planning_mode?: 'express' | 'template' | 'standard';
	template_used?: string;
	time_saved_minutes?: number;
}

export interface QualityMetrics {
	auto_fixes_applied?: number;
	files_generated?: number;
	iterations?: number;
	lint_errors_assert?: number;
	lint_errors_realtime?: number;
	plan_approved?: boolean;
	review_score?: number;
	test_failures?: number;
	test_passes?: number;
	/** Total tool call failures across all stages in this command */
	tool_failures?: number;
	/** Number of stages that hit the 20-iteration tool loop ceiling */
	tool_loop_exhaustions?: number;
}

export interface SessionCommand {
	args: string[];
	command: string;
	duration_ms: number;
	error?: string;
	flags: Record<string, boolean | string | undefined>;
	optimization_metrics?: OptimizationMetrics;
	outputs: Record<string, unknown>;
	quality_metrics?: QualityMetrics;
	success: boolean;
	timestamp: string;
	tokens_used?: number;
}

export interface Session {
	session_id: string;
	created_at: string;
	updated_at: string;
	status: 'active' | 'completed' | 'failed' | 'paused';
	commands: SessionCommand[];
	context: SessionContext;
	total_tokens_used?: number;
}
```

</details>

<details>
<summary><strong>Collection Flow: How Metrics Are Emitted</strong></summary>

### Command Execution

After each command, `command-executor.ts` aggregates metrics and records them:

```typescript
private updateSessionState(...): void {
  const optimizationMetrics = result.outputs['optimization_metrics'] as OptimizationMetrics | undefined;
  const baseQualityMetrics  = result.outputs['quality_metrics']      as QualityMetrics      | undefined;

  // Aggregate tool failure and loop exhaustion counts from per-stage metadata
  const toolFailures = result.stages.reduce((sum, s) => {
    const eq = s.metadata?.['executionQuality'] as Record<string, unknown> | undefined;
    return sum + (typeof eq?.['toolFailureCount'] === 'number' ? eq['toolFailureCount'] : 0);
  }, 0);
  const toolLoopExhaustions = result.stages.reduce((sum, s) => {
    const eq = s.metadata?.['executionQuality'] as Record<string, unknown> | undefined;
    return sum + (eq?.['wasLoopExhausted'] === true ? 1 : 0);
  }, 0);

  const qualityMetrics = toolFailures > 0 || toolLoopExhaustions > 0
    ? { ...baseQualityMetrics, tool_failures: toolFailures || undefined, tool_loop_exhaustions: toolLoopExhaustions || undefined }
    : baseQualityMetrics;

  sessionManager.addCommand(
    commandName, options.args, options.flags, result.outputs,
    result.success, duration, result.error, tokenBreakdown.total,
    optimizationMetrics, qualityMetrics
  );

  this.sessionLifecycle.persist();
}
```

### Metrics Emitted by Each Command

**Plan command** — emits in `optimization_metrics`:

```typescript
{
  complexity_score: 4.2,
  pattern_detected: "REST_API",
  pattern_confidence: 0.85,
  planning_mode: "template",
  template_used: "PATTERN_REST_API",
  time_saved_minutes: 8.5
}
```

**Review-plan command** — emits in both:

```typescript
optimization_metrics: { early_exit_triggered: true, initial_confidence: 9.2, time_saved_minutes: 12.0 }
quality_metrics: { plan_approved: true, review_score: 92, iterations: 1 }
```

**Implement command** — emits in `quality_metrics`:

```typescript
{ lint_errors_realtime: 5, auto_fixes_applied: 4, files_generated: 2 }
```

**Assert command** — emits in `quality_metrics`:

```typescript
{ lint_errors_assert: 1, test_failures: 0, test_passes: 12 }
```

### Session Persistence Example

```json
{
	"session_id": "wf-001",
	"created_at": "2026-02-02T10:00:00.000Z",
	"status": "completed",
	"commands": [
		{
			"command": "plan",
			"timestamp": "2026-02-02T10:00:00.000Z",
			"duration_ms": 240000,
			"optimization_metrics": {
				"template_used": "PATTERN_REST_API",
				"planning_mode": "template",
				"time_saved_minutes": 8.5
			},
			"success": true,
			"outputs": {},
			"args": [],
			"flags": {}
		}
	],
	"context": {},
	"total_tokens_used": 12500
}
```

</details>

<details>
<summary><strong>Spending Ledger Collection</strong></summary>

In addition to in-process counters and session-level metrics, VALORA maintains a per-request cost ledger at `.valora/spending.jsonl`.

`CommandExecutor.execute()` calls `calculateActualCost()` immediately after `calculateTokenUsage()`, then records a spending entry:

```typescript
const costResult = calculateActualCost(
	{
		cache_creation_input_tokens: tokenBreakdown.cache_write ?? 0,
		cache_read_input_tokens: tokenBreakdown.cache_read ?? 0,
		completion_tokens: tokenBreakdown.generation,
		prompt_tokens: tokenBreakdown.context,
		total_tokens: tokenBreakdown.total
	},
	resolvedCommand.command.model
);

getSpendingTracker().record({
	id: `${Date.now()}-${commandName}`,
	command: commandName,
	stage: result.stages.map((s) => s.stage).join('+'),
	model: model ?? 'unknown',
	promptTokens: tokenBreakdown.context,
	completionTokens: tokenBreakdown.generation,
	cacheReadTokens: tokenBreakdown.cache_read ?? 0,
	cacheWriteTokens: tokenBreakdown.cache_write ?? 0,
	totalTokens: tokenBreakdown.total,
	costUsd: costResult.totalCost,
	cacheSavingsUsd: costResult.cacheSavings,
	durationMs: duration,
	timestamp: new Date().toISOString(),
	batchDiscounted: options.flags['batch'] === true
});
```

`ProcessingFeedback` also calls `calculateActualCost()` on every `LLM_RESPONSE` pipeline event, displaying the accumulating cost in the status bar (`~$0.0124`) and on each stage-completion line.

</details>

<details>
<summary><strong>Extraction and Aggregation Algorithm</strong></summary>

### Scanning Sessions

`extract-metrics.ts` scans session directories:

```typescript
const sessionsDir = join(projectRoot, '.valora', 'sessions');
const workflows = await readdir(sessionsDir);

for (const workflowId of workflows) {
	const workflowDir = join(sessionsDir, workflowId);
	const files = await readdir(workflowDir);

	for (const file of files) {
		if (!file.endsWith('.json')) continue;

		const content = await readFile(join(workflowDir, file), 'utf-8');
		const data = JSON.parse(content);

		// Handles both Session format and SessionLog format
		const sessionLogs = extractSessionLogs(data);
		for (const session of sessionLogs) {
			processSession(session, metrics);
		}
	}
}
```

### Aggregation Logic

```typescript
if (opt.template_used && opt.planning_mode === 'template') {
	metrics.templateUsage.total++;
	metrics.templateUsage.totalTimeSaved += opt.time_saved_minutes || 0;
	// ... per-pattern breakdown
}

if (opt.early_exit_triggered) {
	metrics.earlyExit.triggered++;
	metrics.earlyExit.totalTimeSaved += opt.time_saved_minutes || 0;
	// ... confidence distribution bucketing
}
```

### Recommendations Engine

The dashboard generates recommendations based on configurable targets:

```typescript
// Template usage below target (40%)
if (metrics.templateUsage.rate < 40) {
	recommendations.push('⚠️ **Template usage below target** - Consider creating more templates for common patterns');
}

// Early exit rate below target (30%)
if (metrics.earlyExit.rate < 30) {
	recommendations.push('⚠️ **Early exit rate below target** - Review confidence thresholds');
}

// Express planning underutilised (15%)
if (metrics.expressPlanning.rate < 15) {
	recommendations.push('⚠️ **Express planning underutilised** - Ensure trivial tasks are routed correctly');
}
```

</details>

<details>
<summary><strong>Per-Stage Execution Quality Metadata</strong></summary>

`StageOutput.metadata.executionQuality` is set on every stage that ran through the tool loop:

```typescript
{
  degraded: boolean;            // true if any failures or exhaustion occurred
  hardStopped?: boolean;        // true if toolFailureCount >= MAX_TOOL_FAILURES_BEFORE_HARD_STOP
  toolFailureCount: number;
  verifiedModifiedFiles: string[];
  wasLoopExhausted: boolean;
}
```

`verifiedModifiedFiles` is computed from the conversation history: only files whose `write`/`search_replace`/`delete_file` tool call produced a non-error result are included. It is injected into the forced final prompt when the loop exhausts.

After each command, `command-executor.ts` aggregates `toolFailureCount` and `wasLoopExhausted` from all stage metadata entries and writes the totals into `SessionCommand.quality_metrics.tool_failures` and `SessionCommand.quality_metrics.tool_loop_exhaustions`.

The dashboard `buildMetricsSummary` combines in-memory counters (current process) with these persisted values (historical sessions) so the Overview panel always reflects the full history.

</details>

<details>
<summary><strong>Adding New Metrics</strong></summary>

1. **Update Session Types** (`src/types/session.types.ts`):

```typescript
export interface OptimizationMetrics {
	// ...existing fields
	new_metric?: number;
}
```

2. **Emit from Command** (in the command's `.md` definition):

```typescript
optimization_metrics: {
	new_metric: calculated_value;
}
```

3. **Extract in Metrics Script** (`scripts/extract-metrics.ts`):

```typescript
if (opt.new_metric !== undefined) {
	metrics.newMetric.total += opt.new_metric;
}
```

4. **Display in Dashboard** (`scripts/generate-dashboard.ts`):

```typescript
### New Metric
- **Value**: ${metrics.newMetric.total}
```

</details>

---

## Related Documentation

- [Metrics Dashboard](./metrics-dashboard.md) — Dashboard views and query commands
- [Pipeline Resilience Operations Guide](../operations/pipeline-resilience.md)
- [ADR-010: Pipeline Resilience and Tool-Failure Observability](../adr/010-pipeline-resilience-and-tool-failure-observability.md)
- [Session Types](../../src/types/session.types.ts) — TypeScript definitions
