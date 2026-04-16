# Metrics Dashboard

> The interactive dashboard for viewing workflow optimisation metrics, spending, and pipeline health in VALORA.

## Dashboard Overview

The dashboard (`valora dash`) provides a live view of metrics collected from session data. It is structured into six tabs navigated with keys `1`–`6`: **Overview**, **Performance**, **Agents**, **Cache**, **Audit**, and **Usage**.

### Key Metrics at a Glance

| Metric                        | Where to Find It                  | Source                                                |
| ----------------------------- | --------------------------------- | ----------------------------------------------------- |
| Average workflow time         | Overview tab — Executive Summary  | Session `duration_ms` aggregation                     |
| Template adoption rate        | Overview tab — Optimisation panel | `optimization_metrics.planning_mode`                  |
| Early exit rate               | Overview tab — Optimisation panel | `optimization_metrics.early_exit_triggered`           |
| Output compression ratio      | Overview tab — Optimisation panel | `compression.terminal.ratio` gauge                    |
| Estimated tokens saved        | Overview tab — Optimisation panel | `compression.terminal.estimated_saved_tokens` gauge   |
| Estimated cost saved          | Overview tab — Optimisation panel | `compression.terminal.estimated_saved_cost_usd` gauge |
| Tool results pruned           | Overview tab — Optimisation panel | `compression.history.pruned_messages` counter         |
| Tool results deduplicated     | Overview tab — Optimisation panel | `compression.dedup.hits` counter                      |
| Loop exhaustions              | Overview tab — Metrics Summary    | `quality_metrics.tool_loop_exhaustions`               |
| Tool failures                 | Overview tab — Metrics Summary    | `quality_metrics.tool_failures`                       |
| Per-request cost              | Spending tab                      | `.valora/spending.jsonl`                              |
| Cache savings                 | Spending tab / Usage tab          | `.valora/spending.jsonl`                              |
| Per-stage execution breakdown | Performance tab                   | `StageOutput.metadata.executionQuality`               |
| Cross-session cost by model   | Usage tab (key `6`)               | `UsageAnalytics` over `.valora/spending.jsonl`        |
| Cross-session cost by command | Usage tab (key `6`)               | `UsageAnalytics` over `.valora/spending.jsonl`        |
| Daily cost trend (7 days)     | Usage tab (key `6`)               | `UsageAnalytics` — sparkline + table                  |

### Dashboard Tabs

| Key | Tab         | Description                                                                        |
| --- | ----------- | ---------------------------------------------------------------------------------- |
| `1` | Overview    | Session list, system health, git worktrees, recent commands                        |
| `2` | Performance | Per-stage execution breakdown and quality metrics                                  |
| `3` | Agents      | Agent analytics and model selection metrics                                        |
| `4` | Cache       | Cache hit/miss statistics                                                          |
| `5` | Audit       | Audit log events                                                                   |
| `6` | Usage       | Cross-session cost and token analytics: summary, by model, by command, daily trend |

### Accessing the Dashboard

```bash
# Open the live dashboard
valora dash

# View spending summary in terminal
valora monitoring spending

# Cross-session usage analytics in terminal
valora monitoring usage
valora monitoring usage --since-days 14 --format markdown

# Generate a markdown dashboard report
pnpm tsx scripts/extract-metrics.ts 30d | pnpm tsx scripts/generate-dashboard.ts
# Output: .valora/METRICS_REPORT.md

# Extract raw metrics JSON
pnpm tsx scripts/extract-metrics.ts 30d | jq '.'
pnpm tsx scripts/extract-metrics.ts 7d  | jq '.'
```

---

## Optimisation Performance Reference

The following targets and metrics are tracked for each active optimisation:

| Optimisation               | Target          | Tracked Field                               | Impact When Met          |
| -------------------------- | --------------- | ------------------------------------------- | ------------------------ |
| Plan template usage        | ≥ 40%           | `optimization_metrics.planning_mode`        | ~8–9 min saved per plan  |
| Early exit reviews         | ≥ 30%           | `optimization_metrics.early_exit_triggered` | ~12 min saved per review |
| Express planning           | ≥ 15%           | `optimization_metrics.planning_mode`        | ~11 min saved per plan   |
| Parallel review validation | 100%            | Auto-enabled                                | ~14 min saved per review |
| Real-time linting          | 0 assert errors | `quality_metrics.lint_errors_assert`        | ~4 min rework prevented  |

### Automatic Token Compression

The following optimisations activate without configuration and have no adoption targets — their metrics indicate volume of work done, not a usage rate to improve:

| Optimisation               | Tracked Field                                           | Visible In         |
| -------------------------- | ------------------------------------------------------- | ------------------ |
| Command-filter compression | `compression.terminal.ratio` (gauge)                    | Optimisation panel |
| Command chars saved        | `compression.terminal.saved_chars` (counter)            | Optimisation panel |
| Estimated tokens saved     | `compression.terminal.estimated_saved_tokens` (gauge)   | Optimisation panel |
| Estimated cost saved       | `compression.terminal.estimated_saved_cost_usd` (gauge) | Optimisation panel |
| History pruning            | `compression.history.pruned_messages` (counter)         | Optimisation panel |
| Result deduplication       | `compression.dedup.hits` (counter)                      | Optimisation panel |

See [Session Optimisation — Output Compression](./session-optimization.md#output-compression) for how each mechanism works.

---

<details>
<summary><strong>Dashboard Implementation: Data Collection and Extraction</strong></summary>

### Session Log Structure

**File**: `.valora/sessions/<workflow-id>/<command>-<timestamp>.json`

```json
{
	"workflow_id": "wf_20260130_001",
	"command": "plan",
	"timestamp": "2026-01-30T14:23:45.789Z",
	"duration_ms": 285000,
	"optimization_metrics": {
		"template_used": "rest-api",
		"pattern_detected": "rest-api",
		"pattern_confidence": 0.87,
		"complexity_score": 4.2,
		"planning_mode": "template",
		"time_saved_minutes": 9.1
	},
	"stages": [
		{
			"stage": "assess-complexity",
			"duration_ms": 12000,
			"outputs": {
				"complexity_score": 4.2,
				"pattern_detected": "rest-api",
				"recommended_template": "PATTERN_REST_API.md"
			}
		}
	],
	"quality_metrics": {
		"plan_approved": true,
		"review_score": 8.3,
		"iterations": 1
	}
}
```

### Metrics Extraction Script

**File**: `scripts/extract-metrics.ts`

```typescript
async function extractMetrics(period: '7d' | '30d' = '30d'): Promise<WorkflowMetrics> {
	const sessionsDir = '.valora/sessions';
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - (period === '7d' ? 7 : 30));

	const workflows = await readdir(sessionsDir);
	const metrics: WorkflowMetrics = {
		totalWorkflows: 0,
		templateUsage: { total: 0, byPattern: {}, avgTimeSaved: 0 },
		earlyExitRate: 0,
		avgWorkflowTime: 0,
		phaseBreakdown: {}
	};

	for (const workflowId of workflows) {
		const workflowDir = join(sessionsDir, workflowId);
		const files = await readdir(workflowDir);

		for (const file of files) {
			if (!file.endsWith('.json')) continue;

			const content = await readFile(join(workflowDir, file), 'utf-8');
			const session = JSON.parse(content);

			const sessionDate = new Date(session.timestamp);
			if (sessionDate < cutoffDate) continue;

			metrics.totalWorkflows++;

			if (session.optimization_metrics) {
				const opt = session.optimization_metrics;
				if (opt.template_used) {
					metrics.templateUsage.total++;
					metrics.templateUsage.byPattern[opt.template_used] =
						(metrics.templateUsage.byPattern[opt.template_used] || 0) + 1;
					metrics.templateUsage.avgTimeSaved += opt.time_saved_minutes || 0;
				}
				if (opt.early_exit_triggered) {
					metrics.earlyExitRate++;
				}
			}

			metrics.avgWorkflowTime += session.duration_ms / 60000;

			for (const stage of session.stages || []) {
				if (!metrics.phaseBreakdown[stage.stage]) {
					metrics.phaseBreakdown[stage.stage] = { avg: 0, count: 0 };
				}
				const phase = metrics.phaseBreakdown[stage.stage];
				phase.avg = (phase.avg * phase.count + stage.duration_ms / 60000) / (phase.count + 1);
				phase.count++;
			}
		}
	}

	if (metrics.totalWorkflows > 0) {
		metrics.avgWorkflowTime /= metrics.totalWorkflows;
		metrics.earlyExitRate = (metrics.earlyExitRate / metrics.totalWorkflows) * 100;
		if (metrics.templateUsage.total > 0) {
			metrics.templateUsage.avgTimeSaved /= metrics.templateUsage.total;
		}
	}

	return metrics;
}
```

</details>

<details>
<summary><strong>Dashboard Implementation: Report Generation</strong></summary>

### Dashboard Generation Script

**File**: `scripts/generate-dashboard.ts`

```typescript
function generateBar(percentage: number, width: number = 20): string {
	const filled = Math.round((percentage / 100) * width);
	return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function generateDashboard(metrics: Metrics): string {
	const baselineTime = 192; // minutes
	const timeSaved = baselineTime - metrics.avgWorkflowTime;
	const improvement = ((timeSaved / baselineTime) * 100).toFixed(0);
	const templateRate = ((metrics.templateUsage.total / metrics.totalWorkflows) * 100).toFixed(0);

	return `
# Workflow Optimisation Dashboard

**Period**: Last 30 days
**Workflows**: ${metrics.totalWorkflows}

---

## Executive Summary

\`\`\`
Average Workflow Time:  ${metrics.avgWorkflowTime.toFixed(0)} min  ▼${improvement}% from baseline
Template Usage Rate:    ${templateRate}%
Early Exit Rate:        ${metrics.earlyExitRate.toFixed(0)}%
Total Time Saved:       ${((timeSaved * metrics.totalWorkflows) / 60).toFixed(1)} hours

${generateBar(parseFloat(improvement))} ${improvement}%
\`\`\`

## Template Usage

${Object.entries(metrics.templateUsage.byPattern)
	.map(([pattern, count]) => {
		const percentage = ((count / metrics.templateUsage.total) * 100).toFixed(0);
		return `- **${pattern}**: ${count} uses (${percentage}%) ${generateBar(parseFloat(percentage), 10)}`;
	})
	.join('\n')}

## Phase Breakdown

${Object.entries(metrics.phaseBreakdown)
	.sort((a, b) => b[1].avg - a[1].avg)
	.map(([phase, data]) => `- **${phase}**: ${data.avg.toFixed(1)} min avg (${data.count} executions)`)
	.join('\n')}
  `;
}
```

### ASCII Progress Bar Utility

```typescript
function generateBar(percentage: number, width: number = 20, symbol: string = '█'): string {
	const filled = Math.round((percentage / 100) * width);
	const empty = width - filled;
	return symbol.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty));
}
// Example: generateBar(42, 15) → "██████░░░░░░░░░  42%"
```

### Report Sections

The generated markdown report contains:

1. **Executive Summary** — Overview with ASCII visualisations
2. **Optimisation Performance** — Detailed breakdown per optimisation
3. **Phase Breakdown** — Table of time spent per workflow phase
4. **Quality Metrics** — Code/test/review quality scores
5. **Time Savings Distribution** — Bar chart of time saved by optimisation
6. **Recommendations** — Actionable suggestions based on targets

</details>

<details>
<summary><strong>Dashboard Implementation: Automation</strong></summary>

### GitHub Actions Workflow

**File**: `.github/workflows/metrics-dashboard.yml`

```yaml
name: Generate Metrics Dashboard

on:
  schedule:
    - cron: '0 9 * * 1' # Every Monday at 9am UTC
  workflow_dispatch:

jobs:
  generate-dashboard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Extract metrics
        run: pnpm tsx scripts/extract-metrics.ts 30d > metrics.json
      - name: Generate dashboard
        run: pnpm tsx scripts/generate-dashboard.ts metrics.json
      - name: Commit dashboard
        run: |
          git config user.name "Metrics Bot"
          git config user.email "metrics@example.com"
          git add .valora/METRICS_REPORT.md
          git commit -m "chore(metrics): update dashboard [skip ci]" || echo "No changes"
          git push
```

### Alert Thresholds

```yaml
alerts:
  - name: Workflow time regression
    condition: avg_workflow_time > baseline * 1.1
    severity: warning

  - name: Template adoption declining
    condition: template_usage_rate < 35%
    severity: info

  - name: Early exit not triggering
    condition: early_exit_rate < 20%
    severity: warning

  - name: Linter errors appearing
    condition: lint_errors_in_assert > 0
    severity: critical
```

</details>

---

## Related Documentation

- [Metrics System Architecture](./metrics-system.md) — Collection pipeline, data model, and extension points
- [User Guide: Metrics](../user-guide/metrics.md) — User-facing documentation
