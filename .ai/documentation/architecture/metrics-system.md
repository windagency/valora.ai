# Metrics System Architecture

This document describes the architecture of the workflow metrics collection, extraction, and reporting system.

## Overview

The metrics system provides data-driven insights into workflow optimization effectiveness through automated collection, aggregation, and visualization of optimization and quality metrics.

## Architecture Diagram

```plaintext
┌─────────────────────────────────────────────────────────────┐
│                    COLLECTION LAYER                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Workflow Commands                                           │
│  (/plan, /review-plan, /implement, /assert)                 │
│                    │                                         │
│                    ↓                                         │
│  Command Executor (command-executor.ts)                      │
│         ├─ Extract optimization_metrics from outputs         │
│         ├─ Extract quality_metrics from outputs              │
│         └─ Pass to Session Context Manager                   │
│                    │                                         │
│                    ↓                                         │
│  Session Context Manager (context.ts)                        │
│         └─ addCommand(..., optimization_metrics,             │
│                          quality_metrics)                    │
│                    │                                         │
│                    ↓                                         │
│  Session Lifecycle (lifecycle.ts)                            │
│         └─ persist() → Debounced write to disk               │
│                    │                                         │
│                    ↓                                         │
│  Session Store (store.ts)                                    │
│         ├─ Encrypt session data                              │
│         ├─ Write .ai/sessions/<id>/session.json              │
│         └─ Create snapshot for fast resume                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   EXTRACTION LAYER                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  extract-metrics.ts                                          │
│         ├─ Scan .ai/sessions/*/*.json                        │
│         ├─ Filter by date range (7d/30d)                     │
│         ├─ Parse Session or SessionLog format                │
│         ├─ Aggregate metrics by type                         │
│         ├─ Calculate averages and percentages                │
│         └─ Output JSON summary                               │
│                    │                                         │
│                    ↓                                         │
│  Metrics JSON                                                │
│  {                                                           │
│    totalWorkflows: number,                                   │
│    templateUsage: {...},                                     │
│    earlyExit: {...},                                         │
│    expressPlanning: {...},                                   │
│    realTimeLinting: {...},                                   │
│    ...                                                       │
│  }                                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  PRESENTATION LAYER                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  generate-dashboard.ts                                       │
│         ├─ Read metrics JSON                                 │
│         ├─ Generate ASCII visualizations                     │
│         ├─ Create markdown report                            │
│         ├─ Add recommendations based on targets              │
│         └─ Write .ai/METRICS_REPORT.md                       │
│                    │                                         │
│                    ↓                                         │
│  Dashboard Report                                            │
│  - Executive Summary                                         │
│  - Optimization Performance                                  │
│  - Phase Breakdown                                           │
│  - Quality Metrics                                           │
│  - Recommendations                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  AUTOMATION LAYER                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  GitHub Actions Workflow                                     │
│  (metrics-dashboard.yml)                                     │
│         ├─ Scheduled: Every Monday 9am UTC                   │
│         ├─ Manual: workflow_dispatch                         │
│         ├─ Extract metrics (30d)                             │
│         ├─ Generate dashboard                                │
│         ├─ Commit report                                     │
│         ├─ Create GitHub issue                               │
│         └─ Upload artifacts (90-day retention)               │
│                    │                                         │
│                    ↓                                         │
│  Local Script (generate-weekly-report.sh)                    │
│         ├─ Extract metrics                                   │
│         ├─ Generate dashboard                                │
│         ├─ Display terminal summary                          │
│         └─ Optional: Create GitHub issue (gh CLI)            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Data Model

### Session Types

Defined in `.ai/.bin/src/types/session.types.ts`:

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

### Metrics Summary

Output format from `extract-metrics.ts`:

```typescript
interface WorkflowMetrics {
  period: '7d' | '30d';
  startDate: string;
  endDate: string;
  totalWorkflows: number;

  templateUsage: {
    total: number;
    rate: number;
    byPattern: Record<string, {
      count: number;
      avgTime: number;
      timeSaved: number;
    }>;
    avgTimeSaved: number;
    totalTimeSaved: number;
  };

  earlyExit: {
    triggered: number;
    rate: number;
    avgTimeSaved: number;
    totalTimeSaved: number;
    confidenceDistribution: Record<string, number>;
  };

  expressPlanning: {
    used: number;
    rate: number;
    avgComplexity: number;
    avgTime: number;
    avgTimeSaved: number;
    totalTimeSaved: number;
  };

  // ... other optimization metrics

  avgWorkflowTime: number;
  baselineTime: number;
  totalTimeSaved: number;
  timeEfficiency: number;

  phaseBreakdown: Record<string, {
    avg: number;
    count: number;
    baseline: number;
    savings: number;
  }>;

  qualityScores: {
    codeQuality: number;
    testQuality: number;
    reviewQuality: number;
  };
}
```

## Collection Flow

### 1. Command Execution

When a workflow command executes:

```typescript
// command-executor.ts:570-593
private updateSessionState(
  commandName: string,
  options: CommandExecutionOptions,
  result: CommandResult,
  duration: number,
  tokenBreakdown: TokenBreakdown,
  sessionManager: SessionContextManager
): void {
  // Extract metrics from command outputs
  const optimizationMetrics = result.outputs['optimization_metrics'] as
    | OptimizationMetrics
    | undefined;
  const qualityMetrics = result.outputs['quality_metrics'] as
    | QualityMetrics
    | undefined;

  // Store in session
  sessionManager.addCommand(
    commandName,
    options.args,
    options.flags,
    result.outputs,
    result.success,
    duration,
    result.error,
    tokenBreakdown.total,
    optimizationMetrics,  // ← Optimization metrics
    qualityMetrics        // ← Quality metrics
  );

  // Persist to disk (debounced)
  this.sessionLifecycle.persist();
}
```

### 2. Metrics Emission

Commands emit metrics in their outputs:

**Plan command** (`.ai/commands/plan.md`):

```typescript
optimization_metrics: {
  complexity_score: 4.2,
  pattern_detected: "REST_API",
  pattern_confidence: 0.85,
  planning_mode: "template",
  template_used: "PATTERN_REST_API",
  time_saved_minutes: 8.5
}
```

**Review-plan command** (`.ai/commands/review-plan.md`):

```typescript
optimization_metrics: {
  early_exit_triggered: true,
  initial_confidence: 9.2,
  time_saved_minutes: 12.0
}

quality_metrics: {
  plan_approved: true,
  review_score: 92,
  iterations: 1
}
```

**Implement command** (`.ai/commands/implement.md`):

```typescript
quality_metrics: {
  lint_errors_realtime: 5,
  auto_fixes_applied: 4,
  files_generated: 2
}
```

**Assert command** (`.ai/commands/assert.md`):

```typescript
quality_metrics: {
  lint_errors_assert: 1,
  test_failures: 0,
  test_passes: 12
}
```

### 3. Session Persistence

Session data is written to `.ai/sessions/<session-id>/session.json`:

```json
{
  "session_id": "wf-001",
  "created_at": "2026-02-02T10:00:00.000Z",
  "updated_at": "2026-02-02T11:00:00.000Z",
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

## Extraction Algorithm

### Scanning Sessions

`extract-metrics.ts` scans session directories:

```typescript
const sessionsDir = join(projectRoot, '.ai', 'sessions');
const workflows = await readdir(sessionsDir);

for (const workflowId of workflows) {
  const workflowDir = join(sessionsDir, workflowId);
  const files = await readdir(workflowDir);

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    const filePath = join(workflowDir, file);
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Handle both Session format and SessionLog format
    const sessionLogs = extractSessionLogs(data);

    for (const session of sessionLogs) {
      processSession(session, metrics);
    }
  }
}
```

### Aggregating Metrics

For each session, extract and aggregate optimization metrics:

```typescript
if (session.optimization_metrics) {
  const opt = session.optimization_metrics;

  // Template usage
  if (opt.template_used && opt.planning_mode === 'template') {
    metrics.templateUsage.total++;
    metrics.templateUsage.totalTimeSaved += opt.time_saved_minutes || 0;

    if (!metrics.templateUsage.byPattern[opt.template_used]) {
      metrics.templateUsage.byPattern[opt.template_used] = {
        count: 0,
        avgTime: 0,
        timeSaved: 0
      };
    }

    const pattern = metrics.templateUsage.byPattern[opt.template_used];
    pattern.count++;
    pattern.timeSaved += opt.time_saved_minutes || 0;
  }

  // Early exit
  if (opt.early_exit_triggered) {
    metrics.earlyExit.triggered++;
    metrics.earlyExit.totalTimeSaved += opt.time_saved_minutes || 0;

    const confidence = opt.initial_confidence || 0;
    const range = confidence >= 9.5 ? '9.5-10'
                : confidence >= 9.0 ? '9.0-9.4'
                : '8.5-8.9';
    metrics.earlyExit.confidenceDistribution[range] =
      (metrics.earlyExit.confidenceDistribution[range] || 0) + 1;
  }

  // Express planning
  if (opt.planning_mode === 'express') {
    metrics.expressPlanning.used++;
    metrics.expressPlanning.avgComplexity += opt.complexity_score || 0;
    metrics.expressPlanning.totalTimeSaved += opt.time_saved_minutes || 0;
  }
}
```

### Calculating Rates and Averages

After aggregation, calculate rates and averages:

```typescript
if (metrics.totalWorkflows > 0) {
  // Template usage rate
  metrics.templateUsage.rate =
    (metrics.templateUsage.total / metrics.totalWorkflows) * 100;

  if (metrics.templateUsage.total > 0) {
    metrics.templateUsage.avgTimeSaved =
      metrics.templateUsage.totalTimeSaved / metrics.templateUsage.total;
  }

  // Early exit rate
  metrics.earlyExit.rate =
    (metrics.earlyExit.triggered / metrics.totalWorkflows) * 100;

  if (metrics.earlyExit.triggered > 0) {
    metrics.earlyExit.avgTimeSaved =
      metrics.earlyExit.totalTimeSaved / metrics.earlyExit.triggered;
  }

  // Overall workflow time and efficiency
  metrics.avgWorkflowTime /= metrics.totalWorkflows;
  metrics.totalTimeSaved =
    (BASELINE_TIMES.avgWorkflowTime - metrics.avgWorkflowTime) *
    metrics.totalWorkflows;
  metrics.timeEfficiency =
    Math.round((1 - metrics.avgWorkflowTime / BASELINE_TIMES.avgWorkflowTime) * 100);
}
```

## Dashboard Generation

### ASCII Visualization

Generate progress bars for visual feedback:

```typescript
function generateBar(
  percentage: number,
  width: number = 20,
  symbol: string = '█'
): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return symbol.repeat(Math.max(0, filled)) +
         '░'.repeat(Math.max(0, empty));
}

// Usage
const templateBar = generateBar(metrics.templateUsage.rate, 15);
// Output: "████░░░░░░░░░░░  25%"
```

### Report Sections

The dashboard is structured into sections:

1. **Executive Summary** - Overview with ASCII visualizations
2. **Optimization Performance** - Detailed breakdown per optimization
3. **Phase Breakdown** - Table of time spent per phase
4. **Quality Metrics** - Code/test/review quality scores
5. **Time Savings Distribution** - Bar chart of time saved by optimization
6. **Recommendations** - Actionable suggestions based on targets

### Recommendations Engine

Generate recommendations based on targets:

```typescript
// Template usage below target (40%)
if (metrics.templateUsage.rate < 40) {
  recommendations.push(
    '⚠️ **Template usage below target** - ' +
    'Consider creating more templates for common patterns'
  );
}

// Early exit rate below target (30%)
if (metrics.earlyExit.rate < 30) {
  recommendations.push(
    '⚠️ **Early exit rate below target** - ' +
    'Review confidence thresholds'
  );
}

// Express planning underutilized (15%)
if (metrics.expressPlanning.rate < 15) {
  recommendations.push(
    '⚠️ **Express planning underutilized** - ' +
    'Ensure trivial tasks are routed correctly'
  );
}

// All targets met
if (allTargetsMet) {
  recommendations.push(
    '✅ **All optimization targets met!** - ' +
    'Continue monitoring and refining'
  );
}
```

## Automation

### GitHub Actions Workflow

Workflow steps:

1. **Checkout** - Clone repository
2. **Setup Node.js** - Install Node 20
3. **Install pnpm** - Install package manager
4. **Install dependencies** - Run `pnpm install` in `.ai/.bin`
5. **Generate metrics** - Run `extract-metrics.ts` and capture outputs
6. **Generate dashboard** - Create markdown report
7. **Commit report** - Push `.ai/METRICS_REPORT.md` to repository
8. **Create issue** - Generate GitHub issue with summary
9. **Upload artifact** - Save metrics JSON for 90 days
10. **Post summary** - Display results in workflow summary

### Wrapper Scripts

Simplify execution with wrapper scripts:

```bash
#!/usr/bin/env bash
# .ai/scripts/metrics

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

exec "$PROJECT_ROOT/.ai/.bin/node_modules/.bin/tsx" \
  "$SCRIPT_DIR/extract-metrics.ts" "$@"
```

These avoid the need for `pnpm exec tsx` and handle path resolution.

## Performance Considerations

### Session Scanning

- **Time**: ~2-5 seconds for 100 workflows
- **Optimization**: Skip non-JSON files early
- **Caching**: Consider caching parsed sessions

### Dashboard Generation

- **Time**: ~1 second
- **Optimization**: Pre-compute common calculations
- **Memory**: Process sessions iteratively, not all at once

### Workflow Execution

- **Time**: ~2 minutes total (including setup)
- **Optimization**: Use debounced session persistence
- **Artifacts**: Compress JSON before upload

## Security

### Session Data

- Sessions encrypted at rest (via `encryptSessionData()`)
- Sensitive data sanitized before logging
- Metrics extraction only reads encrypted files

### GitHub Issues

- Only aggregated metrics included (no sensitive data)
- No raw session contents in issues
- Labels for easy filtering

### Workflow Permissions

Minimum required permissions:

```yaml
permissions:
  contents: write       # For committing report
  issues: write         # For creating issues
  pull-requests: read   # For PR context
```

## Extension Points

### Adding New Metrics

1. **Update Session Types**:

```typescript
// session.types.ts
export interface OptimizationMetrics {
  // ...existing fields
  new_metric?: number;
}
```

1. **Emit from Command**:

```typescript
// command.md
optimization_metrics: {
  new_metric: calculated_value
}
```

1. **Extract in Metrics Script**:

```typescript
// extract-metrics.ts
if (opt.new_metric !== undefined) {
  metrics.newMetric.total += opt.new_metric;
}
```

1. **Display in Dashboard**:

```typescript
// generate-dashboard.ts
### New Metric
- **Value**: ${metrics.newMetric.total}
```

### Custom Visualizations

Create custom dashboard sections:

```typescript
function generateCustomSection(metrics: Metrics): string {
  return `
## Custom Analysis

${customAnalysis(metrics)}

${generateChart(metrics.customData)}
  `;
}
```

### Integration with External Tools

Export metrics to external systems:

```typescript
// Export to Prometheus
const promMetrics = convertToPrometheus(metrics);
await fetch('http://pushgateway:9091/metrics/job/workflow', {
  method: 'POST',
  body: promMetrics
});

// Export to Datadog
await datadogClient.gauge('workflow.time_saved', metrics.totalTimeSaved);
```

## Related Documentation

- [User Guide: Metrics](../user-guide/metrics.md) - User-facing documentation
- [Automated Reporting](../../AUTOMATED_REPORTING.md) - Complete automation guide
- [Workflow Optimizations](../../WORKFLOW_OPTIMIZATIONS.md) - Optimization details
- [Session Types](../../.bin/src/types/session.types.ts) - TypeScript definitions

---

*For implementation details, see the source code in `.ai/scripts/` and `.ai/.bin/src/`.*
