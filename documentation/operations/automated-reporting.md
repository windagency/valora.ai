# Automated Metrics Reporting

Weekly workflow metrics are collected automatically and compiled into a dashboard report. This document explains how to run reports, what they contain, and how they are scheduled.

## How to Run Reports

### Automated (recommended)

The GitHub Actions workflow runs every Monday at 09:00 UTC with no manual intervention required.

```bash
# Check the latest automated run
gh run view --workflow="Weekly Metrics Dashboard"

# View generated issues
gh issue list --label metrics,weekly-report

# Download artifacts
gh run download --name metrics-report-30d
```

### Manual (on demand)

```bash
# Generate a report for the last 30 days
./scripts/generate-weekly-report.sh 30d

# Generate a report for the last 7 days
./scripts/generate-weekly-report.sh 7d

# Generate and create a GitHub issue
./scripts/generate-weekly-report.sh 30d --issue

# View the generated report
cat .valora/METRICS_REPORT.md
```

### Custom Analysis

```bash
# Extract raw metrics JSON
./scripts/metrics 30d > metrics.json

# Query specific data
jq '.templateUsage.byPattern' metrics.json
jq '.earlyExit.confidenceDistribution' metrics.json
jq '.qualityScores' metrics.json
```

## What Reports Are Generated

The report file is written to `.valora/METRICS_REPORT.md` and contains:

1. **Executive Summary** — key metrics at a glance
2. **Optimisation Performance** — detailed breakdown by optimisation type
3. **Phase Breakdown** — time spent per workflow phase
4. **Quality Metrics** — code, test, and review quality scores
5. **Time Savings Distribution** — where time is being saved
6. **Recommendations** — actionable improvement suggestions

### Example Terminal Summary

```plaintext
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
METRICS SUMMARY (30d)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Workflows:        12
  Time Saved:       8h

  OPTIMIZATION ADOPTION
  ├─ Templates:     42% (target: 40%)
  ├─ Early Exit:    33% (target: 30%)
  └─ Express:       17% (target: 15%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Commands That Emit Metrics

| Command       | Metrics Type                               | Key Fields                                                                 |
| ------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| `plan`        | `optimization_metrics`                     | `template_used`, `planning_mode`, `time_saved_minutes`, `complexity_score` |
| `review-plan` | `optimization_metrics` + `quality_metrics` | `early_exit_triggered`, `plan_approved`, `review_score`, `iterations`      |
| `implement`   | `quality_metrics`                          | `lint_errors_realtime`, `auto_fixes_applied`, `files_generated`            |
| `assert`      | `quality_metrics`                          | `lint_errors_assert`, `test_failures`, `test_passes`                       |

---

<details>
<summary><strong>Architecture and Implementation</strong></summary>

## System Architecture

```plaintext
┌─────────────────────────────────────────────────────────────┐
│                    METRICS COLLECTION                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Workflow Commands (plan, review-plan, implement, etc.)      │
│         │                                                    │
│         ├─> optimization_metrics                            │
│         │   ├─ template_used                                │
│         │   ├─ planning_mode (express/template/standard)    │
│         │   ├─ time_saved_minutes                           │
│         │   └─ early_exit_triggered                         │
│         │                                                    │
│         └─> quality_metrics                                 │
│             ├─ lint_errors_realtime                         │
│             ├─ lint_errors_assert                           │
│             ├─ auto_fixes_applied                           │
│             └─ plan_approved                                │
│                                                              │
│                         ↓                                    │
│                                                              │
│  Session Logs (.valora/sessions/<workflow-id>/session.json)  │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   METRICS EXTRACTION                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  extract-metrics.ts                                          │
│         │                                                    │
│         ├─> Scans .valora/sessions/*/*.json                 │
│         ├─> Filters by date range (7d or 30d)               │
│         ├─> Aggregates metrics by optimisation type         │
│         ├─> Calculates averages and percentages             │
│         └─> Outputs JSON metrics summary                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  DASHBOARD GENERATION                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  generate-dashboard.ts                                       │
│         │                                                    │
│         ├─> Reads metrics JSON                              │
│         ├─> Generates ASCII visualisations                  │
│         ├─> Creates markdown report                         │
│         └─> Writes .valora/METRICS_REPORT.md                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Components

### Metrics Extraction Script

**Script**: `scripts/extract-metrics.ts`
**Wrapper**: `scripts/metrics`
**Input**: Session logs from `.valora/sessions/*/*.json`

```bash
./scripts/metrics 30d          # Extract last 30 days
./scripts/metrics 7d           # Extract last 7 days
./scripts/metrics 30d > metrics.json   # Save to file
```

### Dashboard Generation Script

**Script**: `scripts/generate-dashboard.ts`
**Wrapper**: `scripts/dashboard`
**Output**: `.valora/METRICS_REPORT.md`

```bash
./scripts/metrics 30d | ./scripts/dashboard   # From pipe
./scripts/dashboard < metrics.json             # From file
```

### GitHub Actions Workflow

**File**: `.github/workflows/metrics-dashboard.yml`
**Schedule**: Every Monday at 09:00 UTC (`cron: '0 9 * * 1'`)

**Workflow steps:**

1. Checkout repository
2. Install Node.js and pnpm
3. Install dependencies
4. Extract metrics (30-day period)
5. Generate dashboard report
6. Commit `.valora/METRICS_REPORT.md`
7. Create GitHub issue with summary
8. Upload artifacts (90-day retention)

**Required permissions:**

```yaml
permissions:
  contents: write # for committing the report
  issues: write # for creating issues
  pull-requests: read # for PR context
```

**Manual trigger inputs:**

- `period`: `7d` or `30d` (default: `30d`)
- `create_issue`: `true` or `false` (default: `true`)

### Session Log Format

```json
{
	"session_id": "wf-001",
	"commands": [
		{
			"command": "plan",
			"timestamp": "2026-02-02T10:00:00.000Z",
			"duration_ms": 240000,
			"optimization_metrics": {
				"template_used": "PATTERN_REST_API",
				"planning_mode": "template",
				"time_saved_minutes": 8.5
			}
		}
	]
}
```

## Adding New Metrics

1. **Update session types** (`src/types/session.types.ts`):

```typescript
export interface OptimizationMetrics {
	// ... existing fields
	new_metric?: number;
}
```

2. **Update command** (`data/commands/<command>.md`):

```typescript
optimization_metrics: {
	new_metric: calculated_value;
}
```

3. **Update extraction** (`scripts/extract-metrics.ts`):

```typescript
if (opt.new_metric !== undefined) {
	metrics.newMetric.total += opt.new_metric;
}
```

4. **Update dashboard** (`scripts/generate-dashboard.ts`):

```typescript
### New Metric

- **Value**: ${metrics.newMetric.total}
```

## Troubleshooting

```bash
# Verify wrapper scripts exist
ls -la scripts/metrics scripts/dashboard

# Check session logs
fd -t f -e json .valora/sessions/

# Test extraction
./scripts/metrics 30d | jq '.'

# Test dashboard
./scripts/metrics 30d | ./scripts/dashboard

# Verify workflow
gh workflow view "Weekly Metrics Dashboard"
```

See `scripts/README.md` for a comprehensive troubleshooting guide.

## Security and Performance

- Session logs may contain sensitive data — **encrypted at rest**
- Metrics extraction **sanitises** sensitive information before outputting
- GitHub issues contain only **aggregated metrics** (no raw session data)
- Workflow runs with **least-privilege** permissions

**Performance benchmarks:**

| Operation                          | Duration     |
| ---------------------------------- | ------------ |
| Metrics extraction (100 workflows) | ~2–5 seconds |
| Dashboard generation               | ~1 second    |
| Total GitHub Actions workflow      | ~2 minutes   |
| Artifact storage per report        | ~100 KB      |

</details>

## References

- Full documentation: `documentation/architecture/metrics-dashboard.md`
- Scripts documentation: `scripts/README.md`
- Optimisation details: `documentation/user-guide/workflow-optimisations.md`
- Workflow configuration: `.github/workflows/metrics-dashboard.yml`

---

_Last updated: 2026-02-02_
