# Automated Metrics Reporting

This document describes the automated weekly metrics reporting system for tracking workflow optimization effectiveness.

## Overview

The system automatically collects, analyzes, and reports on workflow optimization metrics every week, providing insights into:

- Template usage and time savings
- Early exit review effectiveness
- Express planning adoption
- Real-time linting impact
- Overall workflow efficiency

## Architecture

```plaintext
┌─────────────────────────────────────────────────────────────┐
│                    METRICS COLLECTION                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Workflow Commands (/plan, /review-plan, /implement, etc.)  │
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
│  Session Logs (.ai/sessions/<workflow-id>/session.json)     │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   METRICS EXTRACTION                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  extract-metrics.ts                                          │
│         │                                                    │
│         ├─> Scans .ai/sessions/*/*.json                     │
│         ├─> Filters by date range (7d or 30d)               │
│         ├─> Aggregates metrics by optimization type         │
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
│         ├─> Generates ASCII visualizations                  │
│         ├─> Creates markdown report                         │
│         └─> Writes .ai/METRICS_REPORT.md                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  AUTOMATED REPORTING                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  GitHub Actions (Weekly - Every Monday 9am UTC)              │
│         │                                                    │
│         ├─> Runs extract-metrics.ts                         │
│         ├─> Runs generate-dashboard.ts                      │
│         ├─> Commits .ai/METRICS_REPORT.md                   │
│         ├─> Creates GitHub Issue with summary               │
│         └─> Uploads artifacts (90-day retention)            │
│                                                              │
│  Local Script (Manual)                                       │
│         │                                                    │
│         └─> generate-weekly-report.sh                       │
│             ├─> Runs metrics extraction                     │
│             ├─> Generates dashboard                         │
│             ├─> Displays terminal summary                   │
│             └─> Optionally creates GitHub issue             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Metrics Collection (Automatic)

**Location**: Session command outputs

**Triggers**: When workflow commands execute

**Commands that emit metrics**:

| Command        | Metrics Type                           | Fields                                                             |
| -------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `/plan`        | optimization_metrics                   | template_used, planning_mode, time_saved_minutes, complexity_score |
| `/review-plan` | optimization_metrics + quality_metrics | early_exit_triggered, plan_approved, review_score, iterations      |
| `/implement`   | quality_metrics                        | lint_errors_realtime, auto_fixes_applied, files_generated          |
| `/assert`      | quality_metrics                        | lint_errors_assert, test_failures, test_passes                     |

**Session Log Format**:

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

### 2. Metrics Extraction (Manual/Automated)

**Script**: `.ai/scripts/extract-metrics.ts`

**Wrapper**: `.ai/scripts/metrics`

**Input**: Session logs from `.ai/sessions/*/*.json`

**Output**: JSON metrics summary

**Usage**:

```bash
# Extract last 30 days
./.ai/scripts/metrics 30d

# Extract last 7 days
./.ai/scripts/metrics 7d

# Save to file
./.ai/scripts/metrics 30d > metrics.json
```

**Metrics Calculated**:

- Template usage rate and time savings
- Early exit trigger rate and average confidence
- Express planning adoption
- Real-time linting effectiveness
- Decision criteria iteration reduction
- Overall workflow time savings

### 3. Dashboard Generation (Manual/Automated)

**Script**: `.ai/scripts/generate-dashboard.ts`

**Wrapper**: `.ai/scripts/dashboard`

**Input**: Metrics JSON (from extract-metrics or piped)

**Output**: `.ai/METRICS_REPORT.md`

**Usage**:

```bash
# From pipe
./.ai/scripts/metrics 30d | ./.ai/scripts/dashboard

# From file
./.ai/scripts/dashboard < metrics.json
```

**Report Sections**:

1. Executive Summary - Key metrics at a glance
2. Optimization Performance - Detailed breakdown by optimization
3. Phase Breakdown - Time spent per workflow phase
4. Quality Metrics - Code/test/review quality scores
5. Time Savings Distribution - Where time is being saved
6. Recommendations - Actionable improvement suggestions

### 4. GitHub Actions Workflow (Automated)

**File**: `.github/workflows/metrics-dashboard.yml`

**Schedule**: Every Monday at 9:00 AM UTC (cron: `0 9 * * 1`)

**Manual Trigger**: Via GitHub UI or `gh workflow run`

**Workflow Steps**:

1. **Checkout** - Get repository code
2. **Setup** - Install Node.js and pnpm
3. **Install** - Install dependencies from `.ai/.bin`
4. **Extract** - Run metrics extraction (30d period)
5. **Generate** - Create dashboard report
6. **Commit** - Push `.ai/METRICS_REPORT.md` to repository
7. **Issue** - Create GitHub issue with summary
8. **Artifact** - Upload metrics for 90 days

**Permissions Required**:

```yaml
permissions:
  contents: write    # For committing report
  issues: write      # For creating issues
  pull-requests: read # For PR context
```

**Workflow Inputs** (manual trigger):

- `period`: Metrics period (`7d` or `30d`, default: `30d`)
- `create_issue`: Create GitHub issue (`true` or `false`, default: `true`)

### 5. Local Report Script (Manual)

**Script**: `.ai/scripts/generate-weekly-report.sh`

**Usage**:

```bash
# Generate report for last 30 days
./.ai/scripts/generate-weekly-report.sh 30d

# Generate report for last 7 days
./.ai/scripts/generate-weekly-report.sh 7d

# Generate report and create GitHub issue
./.ai/scripts/generate-weekly-report.sh 30d --issue
```

**Features**:

- Extracts metrics for specified period
- Generates dashboard report
- Displays colorful terminal summary
- Optionally creates GitHub issue (requires `gh` CLI)
- Provides next steps for committing

**Output Example**:

```plaintext
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 METRICS SUMMARY (30d)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Workflows:        12
  Time Saved:       8h

  OPTIMIZATION ADOPTION
  ├─ Templates:     42% (target: 40%)
  ├─ Early Exit:    33% (target: 30%)
  └─ Express:       17% (target: 15%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Usage Scenarios

### Scenario 1: Weekly Automated Reports (Recommended)

**Goal**: Automatic weekly metrics without manual intervention

**Setup**:

1. Workflow is already configured (`.github/workflows/metrics-dashboard.yml`)
2. Runs every Monday at 9am UTC
3. Commits report and creates issue automatically

**View Results**:

```bash
# View latest workflow run
gh run view --workflow="Weekly Metrics Dashboard"

# View metrics issues
gh issue list --label metrics,weekly-report

# Download artifacts
gh run download --name metrics-report-30d
```

**No action required** - Just review the weekly issue when created.

### Scenario 2: Manual Local Reports

**Goal**: Generate metrics on-demand for analysis

**Steps**:

```bash
# 1. Generate report
./.ai/scripts/generate-weekly-report.sh 30d

# 2. Review report
cat .ai/METRICS_REPORT.md

# 3. Optional: Create issue
./.ai/scripts/generate-weekly-report.sh 30d --issue

# 4. Commit if satisfied
git add .ai/METRICS_REPORT.md
git commit -m "chore: update metrics report"
git push
```

### Scenario 3: Custom Analysis

**Goal**: Extract specific metrics for custom analysis

**Steps**:

```bash
# Extract raw metrics
./.ai/scripts/metrics 30d > metrics.json

# Query specific data
jq '.templateUsage.byPattern' metrics.json
jq '.earlyExit.confidenceDistribution' metrics.json
jq '.qualityScores' metrics.json

# Custom visualization
cat metrics.json | python custom_analysis.py
```

### Scenario 4: CI/CD Integration

**Goal**: Include metrics in deployment pipeline

**Steps**:

```yaml
# .github/workflows/deploy.yml
- name: Generate metrics
  run: ./.ai/scripts/metrics 7d > metrics.json

- name: Check optimization targets
  run: |
    TEMPLATE_RATE=$(jq -r '.templateUsage.rate' metrics.json)
    if (( $(echo "$TEMPLATE_RATE < 40" | bc -l) )); then
      echo "⚠️ Template usage below target: ${TEMPLATE_RATE}%"
    fi
```

## Maintenance

### Adding New Metrics

1. **Update Session Types** (`.ai/.bin/src/types/session.types.ts`):

```typescript
export interface OptimizationMetrics {
  // ... existing fields
  new_metric?: number;
}
```

1. **Update Command** (`.ai/commands/<command>.md`):

```typescript
optimization_metrics: {
  new_metric: calculated_value
}
```

1. **Update Extraction** (`.ai/scripts/extract-metrics.ts`):

```typescript
if (opt.new_metric !== undefined) {
  metrics.newMetric.total += opt.new_metric;
}
```

1. **Update Dashboard** (`.ai/scripts/generate-dashboard.ts`):

```typescript
### New Metric

- **Value**: ${metrics.newMetric.total}
```

### Troubleshooting

See `.ai/scripts/README.md` for comprehensive troubleshooting guide.

**Quick Checks**:

```bash
# Verify wrapper scripts exist
ls -la .ai/scripts/metrics .ai/scripts/dashboard

# Check session logs
find .ai/sessions -name "*.json" -type f

# Test extraction
./.ai/scripts/metrics 30d | jq '.'

# Test dashboard
./.ai/scripts/metrics 30d | ./.ai/scripts/dashboard

# Verify workflow
gh workflow view "Weekly Metrics Dashboard"
```

## Security

- Session logs may contain sensitive data - **encrypted at rest**
- Metrics extraction **sanitizes** sensitive information
- GitHub issues contain only **aggregated metrics** (no sensitive data)
- Workflow runs with **least privilege** permissions

## Performance

- **Metrics extraction**: ~2-5 seconds for 100 workflows
- **Dashboard generation**: ~1 second
- **Total workflow time**: ~2 minutes (including setup)
- **Artifact storage**: ~100KB per report

## References

- Full Documentation: `.ai/METRICS_DASHBOARD.md`
- Scripts Documentation: `.ai/scripts/README.md`
- Optimization Details: `.ai/WORKFLOW_OPTIMIZATIONS.md`
- Workflow Configuration: `.github/workflows/metrics-dashboard.yml`

---

**Last Updated**: 2026-02-02
