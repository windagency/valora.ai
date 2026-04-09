# Workflow Metrics and Optimisation

VALORA automatically collects data about workflow efficiency and surfaces actionable recommendations via a weekly dashboard.

## What is tracked

| Optimisation        | Target adoption | Average time saved | How to trigger                                        |
| ------------------- | --------------- | ------------------ | ----------------------------------------------------- |
| Plan templates      | 40% of plans    | 8–10 min           | `valora plan "..." --pattern=<type>`                  |
| Early exit reviews  | 30% of reviews  | 10–15 min          | Write high-quality plans (confidence ≥ 8.5)           |
| Express planning    | 15% of plans    | 10–12 min          | `valora plan "..." --mode=express` (complexity < 3)   |
| Parallel validation | —               | 12–15 min          | `valora review-plan` (runs in parallel by default)    |
| Real-time linting   | —               | 3–5 min            | Enabled by default during `implement`                 |
| Decision criteria   | —               | 5–8 min            | Produce clear plans with explicit acceptance criteria |
| Technical defaults  | —               | 12–15 min          | Document defaults in `TECHNICAL_DEFAULTS.md`          |

## View metrics

```bash
# Generate report for the last 30 days
./scripts/generate-weekly-report.sh 30d

# View the report
cat .valora/METRICS_REPORT.md
```

Weekly reports are also generated automatically every Monday at 09:00 UTC by GitHub Actions and posted as GitHub Issues.

```bash
gh issue list --label metrics,weekly-report
gh issue view <number>
```

## Interpret the dashboard

**Time Efficiency Score**:

| Score  | Interpretation                                             |
| ------ | ---------------------------------------------------------- |
| 90–100 | Excellent — consistently hitting optimisation targets      |
| 70–89  | Good — regular optimisation usage, room for improvement    |
| 50–69  | Fair — some optimisations used, increase adoption          |
| < 50   | Poor — optimisations underutilised, review recommendations |

**Quality score targets** (optimisations must not compromise quality):

| Metric         | Target   |
| -------------- | -------- |
| Code quality   | > 80/100 |
| Test quality   | > 80/100 |
| Review quality | > 70/100 |

## Act on recommendations

| Dashboard message                | Actions                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| "Template usage below target"    | Add `--pattern=rest-api` (or relevant type) to plan commands; create custom templates for frequent patterns |
| "Early exit rate below target"   | Improve plan quality — add specific acceptance criteria, explicit file paths, and dependency lists          |
| "Express planning underutilised" | Break complex tasks into smaller pieces; use `--mode=express` for trivial changes                           |
| "Linter errors in assert phase"  | Verify real-time linting is enabled; check ESLint configuration                                             |

## Raw metrics queries

```bash
# Extract JSON metrics for a period
./scripts/metrics 30d > metrics.json

# Query specific optimisations
jq '.templateUsage' metrics.json
jq '.earlyExit' metrics.json
jq '.qualityScores' metrics.json

# Check adoption against targets
./scripts/metrics 30d | jq '{
  template_rate: .templateUsage.rate,
  early_exit_rate: .earlyExit.rate,
  express_rate: .expressPlanning.rate
}'
```

---

<details>
<summary><strong>Optimisation details — how each metric is collected and what drives it</strong></summary>

### Plan templates

Pre-built implementation plans for common patterns (REST API, React components, database migrations). Reduces planning time from 13–15 min to 4–6 min by providing a structured starting point.

Metrics collected:

- Usage rate (target: 40%)
- Pattern detected and confidence score
- Average time saved per use
- Cumulative time saved

Tracked field: `commands[].optimization_metrics.template_used`

### Early exit reviews

When a plan's initial confidence score is ≥ 8.5/10 with no critical blockers and all dimension scores ≥ 7.0, subsequent review iterations are skipped. This saves 10–15 min on high-quality plans without compromising quality.

Metrics collected:

- Trigger rate (target: 30%)
- Confidence distribution across reviews
- Average iterations before exit

Tracked field: `commands[].optimization_metrics.early_exit_triggered`

### Express planning

For tasks with complexity < 3, a simplified 2–3 min planning mode is used instead of the full 13–15 min pipeline. Maintains plan structure for documentation purposes.

Metrics collected:

- Usage rate (target: 15%)
- Average complexity score of express plans
- Average time saved

Tracked field: `commands[].optimization_metrics.planning_mode = "express"`

### Parallel validation

`valora review-plan` runs four validation checks concurrently (technical feasibility, risk coverage, step quality, test strategy). Reduces validation time from 16–18 min to 4–6 min.

Metrics collected:

- Count of reviews using parallel validation
- Average validation duration

### Real-time linting

ESLint runs during code generation rather than only during the assert phase. Errors are auto-fixed immediately, reducing assert phase failures.

```plaintext
Implement → Real-time ESLint → Auto-fix → Continue
```

Metrics collected:

- Errors found in real-time vs assert phase
- Auto-fix rate
- Implementations using real-time linting

Tracked field: `commands[].quality_metrics.lint_errors_realtime`

### Decision criteria

Explicit numeric thresholds for go/no-go decisions in reviews (e.g., dependency count < 5 = good, risk count by complexity tier). Reduces subjective uncertainty and the number of review iterations.

Metrics collected:

- Average iterations per review (target: ~1.5)
- Single-iteration rate

### Technical defaults

Pre-defined technology choices (package manager: pnpm, testing: Vitest/Playwright, linting: ESLint + Prettier) are injected into prompts, eliminating "which tool?" clarification questions.

Metrics collected:

- Clarification reduction rate (target: 60%)
- Average questions asked (target: ~3, down from ~8.2)

</details>

<details>
<summary><strong>Metrics schema — session JSON structure</strong></summary>

Metrics are stored in session files at `.valora/sessions/<session-id>/session.json`.

**Relevant fields per command**:

```json
{
	"command": "plan",
	"timestamp": "2026-02-02T10:00:00.000Z",
	"duration_ms": 240000,
	"success": true,
	"optimization_metrics": {
		"template_used": "PATTERN_REST_API",
		"planning_mode": "template",
		"complexity_score": 4.2,
		"pattern_detected": "REST_API",
		"pattern_confidence": 0.85,
		"time_saved_minutes": 8.5
	},
	"quality_metrics": {
		"lint_errors_realtime": 5,
		"auto_fixes_applied": 4,
		"files_generated": 2
	},
	"tokens_used": 12500
}
```

**For review-plan commands**:

```json
{
	"command": "review-plan",
	"optimization_metrics": {
		"early_exit_triggered": true,
		"initial_confidence": 9.2,
		"time_saved_minutes": 12.0
	},
	"quality_metrics": {
		"plan_approved": true,
		"review_score": 92,
		"iterations": 1
	}
}
```

</details>

<details>
<summary><strong>Storage, automation, and advanced configuration</strong></summary>

### Storage location

- Session files: `.valora/sessions/<session-id>/session.json`
- Generated report: `.valora/METRICS_REPORT.md`
- GitHub Actions workflow: `.github/workflows/metrics-dashboard.yml`

### Automated weekly reports

GitHub Actions runs every Monday at 09:00 UTC:

1. Extracts metrics from all session logs
2. Generates the dashboard report
3. Commits to `.valora/METRICS_REPORT.md`
4. Creates a GitHub Issue with a summary

Trigger manually:

```bash
gh workflow run "Weekly Metrics Dashboard" --field period=30d --field create_issue=true
gh run watch
```

### Baseline times

Baseline times (used to calculate time savings) are configured in `scripts/extract-metrics.ts`:

```typescript
const BASELINE_TIMES = {
	avgWorkflowTime: 192, // minutes (3h 12m)
	avgIterations: 2.3,
	avgClarifications: 8.2,
	phases: {
		plan: 24.8,
		'review-plan': 39.6,
		implement: 62.4
	}
};
```

Adjust these to match your team's historical data.

### Optimisation targets

Targets are defined in `documentation/architecture/metrics-dashboard.md`:

- Template usage: 40%
- Early exit rate: 30%
- Express planning: 15%

### Advanced queries

```bash
# Template usage by pattern
./scripts/metrics 30d | jq '.templateUsage.byPattern'

# Confidence distribution for early exits
./scripts/metrics 30d | jq '.earlyExit.confidenceDistribution'

# Phase-by-phase time breakdown
./scripts/metrics 30d | jq '.phaseBreakdown'

# Compare periods
./scripts/metrics 7d > metrics-7d.json
./scripts/metrics 30d > metrics-30d.json
jq -s '{
  weekly_workflows: .[0].totalWorkflows,
  monthly_workflows: .[1].totalWorkflows,
  weekly_time_saved: (.[0].totalTimeSaved / 60 | floor),
  monthly_time_saved: (.[1].totalTimeSaved / 60 | floor)
}' metrics-7d.json metrics-30d.json
```

### Export to CSV

```bash
./scripts/metrics 30d | jq -r '
  ["Date","Workflows","Templates","EarlyExit","TimeSaved"],
  [
    (now | strftime("%Y-%m-%d")),
    .totalWorkflows,
    .templateUsage.total,
    .earlyExit.triggered,
    (.totalTimeSaved / 60 | floor)
  ] | @csv
' > metrics.csv
```

### CI/CD integration

```yaml
# .github/workflows/deploy.yml
- name: Check optimisation targets
  run: |
    TEMPLATE_RATE=$(./scripts/metrics 7d | jq -r '.templateUsage.rate')
    if (( $(echo "$TEMPLATE_RATE < 40" | bc -l) )); then
      echo "Template usage below target"
    fi
```

</details>

---

See also: [Metrics Quick Start](./metrics-quickstart.md) · [Best Practices](./best-practices.md) · [Automated Reporting](../operations/automated-reporting.md)
