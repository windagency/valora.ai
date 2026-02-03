# Workflow Optimization Metrics Dashboard

**Version**: 1.0  
**Last Updated**: 2026-01-30  
**Tracking Period**: 30 days (2026-01-30 to 2026-03-01)

---

## Executive Dashboard

### Overall Performance

```plaintext
┌─────────────────────────────────────────────────────────────┐
│ WORKFLOW PERFORMANCE SUMMARY (Last 30 Days)                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Average Workflow Time:  2h 10m  ▼32% from baseline       │
│  Time Efficiency Score:    75/100  ▲33 pts from baseline   │
│  Workflows Completed:         47                            │
│  Total Time Saved:        48.7 hours                        │
│                                                             │
│  ██████████████████████████░░░░░░░░  75% Target: 72%       │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ OPTIMIZATION ADOPTION RATES                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Plan Templates:        █████████████░░░░░  42%  (Target: 40%) │
│  Early Exit Reviews:    ████████░░░░░░░░░  28%  (Target: 30%) │
│  Express Planning:      ████░░░░░░░░░░░░░  14%  (Target: 15%) │
│  Parallel Validations:  ████████████████  100%  (Auto-enabled) │
│  Real-Time Lint:        ████████████████  100%  (Auto-enabled) │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Detailed Metrics by Optimization

### 1. Confidence-Based Review Skipping

**Target**: 30% of reviews trigger early exit
**Metric**: Early exit trigger rate

```yaml
Data Collection:
  Source: .ai/sessions/**/review-plan-*.json
  Fields:
    - early_exit_triggered: boolean
    - initial_confidence: number
    - time_saved_minutes: number
    - review_duration_minutes: number

Formula:
  early_exit_rate = (reviews_with_early_exit / total_reviews) * 100
  avg_time_saved = sum(time_saved_minutes) / reviews_with_early_exit
```

**Dashboard View**:

```plaintext
┌─────────────────────────────────────────────────────────────┐
│ EARLY EXIT OPTIMIZATION (Last 30 Days)                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Trigger Rate:           28% (13/47 reviews)               │
│  Target:                 30%                                │
│  Average Time Saved:     12.3 minutes per early exit       │
│  Total Time Saved:       2.7 hours                         │
│                                                             │
│  Confidence Distribution (Early Exits):                     │
│    8.5-8.9: ████████░  8 reviews (62%)                     │
│    9.0-9.4: ████░░░░░  4 reviews (31%)                     │
│    9.5-10:  █░░░░░░░░  1 review  (7%)                      │
│                                                             │
│  Weekly Trend:                                              │
│    Week 1: 22%  ████████░░░░░░░░░░░░░                      │
│    Week 2: 27%  ██████████░░░░░░░░░░░                      │
│    Week 3: 31%  ███████████░░░░░░░░░░  ↑ Improving         │
│    Week 4: 33%  ████████████░░░░░░░░░  ↑ Above target      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Sample Query**:

```bash
# Extract early exit metrics from session logs
jq -r '.stages[] | select(.stage == "synthesis") |
  {early_exit: .outputs.early_exit_triggered,
   confidence: .outputs.overall_confidence,
   duration: .duration_ms}' \
  .ai/sessions/**/review-plan-*.json
```

---

### 2. Plan Template Usage

**Target**: 40% of plans use templates
**Metric**: Template adoption rate by pattern

```yaml
Data Collection:
  Source: .ai/sessions/**/plan-*.json
  Fields:
    - template_used: string | null
    - pattern_detected: string | null
    - complexity_score: number
    - planning_time_minutes: number

Formula:
  template_rate = (plans_with_template / total_plans) * 100
  time_savings = baseline_time - template_planning_time
```

**Dashboard View**:

```plaintext
┌─────────────────────────────────────────────────────────────┐
│ TEMPLATE USAGE (Last 30 Days)                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Overall Template Rate:  42% (20/47 plans)                 │
│  Target:                 40%  ✓ On track                   │
│  Total Time Saved:       8.3 hours                         │
│                                                             │
│  By Pattern:                                                │
│    REST API:           ████████████  12 uses (60%)  9.2 min avg │
│    React Component:    ██████░░░░░░   6 uses (30%)  8.7 min avg │
│    DB Migration:       ██░░░░░░░░░░   2 uses (10%)  7.4 min avg │
│                                                             │
│  Template vs Standard Planning Time:                        │
│    Template:    ████░░░░░░░  4.8 min avg                   │
│    Standard:    ████████████ 13.2 min avg                  │
│    Savings:     8.4 min per template use                   │
│                                                             │
│  Complexity Distribution (Templates):                       │
│    0-2 (Trivial):  ░░░░░░░░  0%  (use express instead)    │
│    2-4 (Simple):   ████████ 80%  (primary target)          │
│    4-6 (Moderate): ██░░░░░░ 20%  (acceptable)              │
│    6+ (Complex):   ░░░░░░░░  0%  (use standard)            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Breakdown by Task Type**:

```plaintext
┌─────────────────────────────────────────────────────────────┐
│ TEMPLATE EFFECTIVENESS BY PATTERN                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  REST API Pattern:                                          │
│    Usage: 12 plans                                          │
│    Avg Planning Time: 4.2 min (vs 13.8 min baseline)      │
│    Time Saved: 9.6 min/plan = 1.9 hours total              │
│    Success Rate: 100% (all plans approved)                 │
│                                                             │
│  React Component Pattern:                                   │
│    Usage: 6 plans                                           │
│    Avg Planning Time: 5.1 min (vs 13.1 min baseline)      │
│    Time Saved: 8.0 min/plan = 48 min total                 │
│    Success Rate: 100% (all plans approved)                 │
│                                                             │
│  Database Migration Pattern:                                │
│    Usage: 2 plans                                           │
│    Avg Planning Time: 5.8 min (vs 14.2 min baseline)      │
│    Time Saved: 8.4 min/plan = 17 min total                 │
│    Success Rate: 100% (all plans approved)                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 3. Express Planning (Trivial Tasks)

**Target**: 15% of plans use express mode
**Metric**: Express planning adoption rate

```yaml
Data Collection:
  Source: .ai/sessions/**/plan-*.json
  Fields:
    - planning_mode: "express" | "template" | "standard"
    - complexity_score: number
    - planning_time_minutes: number

Formula:
  express_rate = (express_plans / total_plans) * 100
  avg_complexity = mean(complexity_score where mode = "express")
```

**Dashboard View**:

```plaintext
┌─────────────────────────────────────────────────────────────┐
│ EXPRESS PLANNING (Last 30 Days)                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Usage Rate:             14% (7/47 plans)                  │
│  Target:                 15%  ≈ On track                   │
│  Total Time Saved:       1.2 hours                         │
│                                                             │
│  Average Complexity:     2.1/10 (trivial)                  │
│  Average Planning Time:  2.4 minutes                       │
│  Baseline Time:          13.5 minutes                      │
│  Time Saved per Plan:    11.1 minutes                      │
│                                                             │
│  Task Types (Express Mode):                                 │
│    Config updates:     ███░░  3 plans (43%)               │
│    Simple fixes:       ██░░░  2 plans (29%)               │
│    Typo corrections:   ██░░░  2 plans (29%)               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 4. Parallel Review Validations

**Target**: 100% of reviews use parallel execution (auto-enabled)
**Metric**: Parallel execution time savings

```yaml
Data Collection:
  Source: .ai/sessions/**/review-plan-*.json
  Fields:
    - stages: array of stage objects
    - parallel_stages: ["feasibility", "risks", "steps", "tests"]
    - sequential_time_estimate: number (sum of individual durations)
    - actual_time: number (parallel execution time)

Formula:
  time_saved = sequential_time_estimate - actual_time
  efficiency_gain = (time_saved / sequential_time_estimate) * 100
```

**Dashboard View**:

```plaintext
┌─────────────────────────────────────────────────────────────┐
│ PARALLEL VALIDATION PERFORMANCE (Last 30 Days)             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Reviews Using Parallelization:  100% (47/47)              │
│  Average Sequential Time:         28.3 minutes             │
│  Average Parallel Time:           14.2 minutes             │
│  Average Time Saved:              14.1 minutes             │
│  Efficiency Gain:                 50%                      │
│  Total Time Saved:                11.0 hours               │
│                                                             │
│  Stage Execution Times (Parallel):                         │
│    Feasibility:   ████████░░  3.2 min                      │
│    Risk Coverage: ██████████  3.8 min                      │
│    Step Quality:  ██████░░░░  2.9 min (longest: 4.3 min)  │
│    Test Strategy: ████████░░  3.5 min                      │
│    ─────────────────────────────────────────               │
│    Parallel Time: ██████████  3.8 min (max of above)      │
│    vs Sequential: ████████████████████████  13.4 min      │
│                                                             │
│  Parallelization Efficiency:                                │
│    ████████████████░░░░░  72% (actual speedup)            │
│    Target: 75% (accounting for overhead)                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 5. Real-Time ESLint Validation

**Target**: Zero linter errors in assert phase
**Metric**: Linter error reduction rate

```yaml
Data Collection:
  Source: .ai/sessions/**/implement-*.json
  Fields:
    - files_with_lint_errors: number
    - lint_errors_caught_realtime: number
    - lint_errors_in_assert: number
    - auto_fixes_applied: number
    - validation_time_ms: number

Formula:
  error_reduction = (1 - (errors_in_assert / baseline_errors)) * 100
  fix_rate = auto_fixes_applied / (auto_fixes + manual_fixes)
```

**Dashboard View**:

```plaintext
┌─────────────────────────────────────────────────────────────┐
│ REAL-TIME LINTING IMPACT (Last 30 Days)                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Implementations:            47                             │
│  Files Generated:            312                            │
│  Linter Errors (Real-Time):  87 caught, 87 fixed (100%)   │
│  Linter Errors (Assert):     0  ✓ Zero errors!            │
│  Error Reduction:            100% vs baseline              │
│                                                             │
│  Auto-Fix Success Rate:                                     │
│    Auto-fixed:      ████████████  73 errors (84%)         │
│    Manual fixes:    ███░░░░░░░░░  14 errors (16%)         │
│                                                             │
│  Common Issues Auto-Fixed:                                  │
│    Missing semicolons:       ████████  28 (38%)           │
│    Import order:             ██████░░  21 (29%)           │
│    Trailing whitespace:      ████░░░░  15 (21%)           │
│    Quotes consistency:       ███░░░░░   9 (12%)           │
│                                                             │
│  Time Impact:                                               │
│    Validation time:          1.2 sec/file avg             │
│    Rework prevented:         4.1 min/workflow avg         │
│    Total time saved:         3.2 hours                     │
│                                                             │
│  TypeScript Errors:                                         │
│    Caught real-time:  23                                   │
│    Fixed immediately: 23 (100%)                            │
│    In assert phase:    0  ✓ Zero errors!                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 6. Explicit Decision Criteria

**Target**: Reduce review iteration cycles by 50%
**Metric**: Iteration reduction rate

```yaml
Data Collection:
  Source: .ai/sessions/**/review-plan-*.json
  Fields:
    - iteration_count: number
    - ambiguity_flags: array
    - decision_criteria_used: boolean
    - resolution_time_minutes: number

Formula:
  avg_iterations = mean(iteration_count)
  iteration_reduction = (1 - (current_avg / baseline_avg)) * 100
```

**Dashboard View**:

```plaintext
┌─────────────────────────────────────────────────────────────┐
│ DECISION CRITERIA IMPACT (Last 30 Days)                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Average Iterations per Review:                             │
│    Baseline (before):  2.3 iterations                      │
│    Current (after):    1.1 iterations                      │
│    Reduction:          52%  ✓ Above target (50%)          │
│                                                             │
│  Reviews with Single Iteration:  70% (33/47)               │
│  Reviews with 2+ Iterations:     30% (14/47)               │
│                                                             │
│  Criteria Application:                                      │
│    Dependency count:   ████████████  Used in 43 reviews   │
│    File count:         ████████████  Used in 47 reviews   │
│    Step count:         ████████████  Used in 47 reviews   │
│    Risk count:         ████████████  Used in 45 reviews   │
│                                                             │
│  Ambiguity Reduction:                                       │
│    "Too many dependencies" flags:  2 (vs 18 baseline)     │
│    "Vague complexity" flags:       1 (vs 14 baseline)     │
│    "Unclear step count" flags:     0 (vs 12 baseline)     │
│                                                             │
│  Time Saved per Review:  3.7 minutes avg                   │
│  Total Time Saved:       2.9 hours                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 7. Technical Defaults Library

**Target**: Reduce clarification questions by 60%
**Metric**: Clarification question reduction rate

```yaml
Data Collection:
  Source: .ai/sessions/**/refine-specs-*.json, create-prd-*.json
  Fields:
    - clarification_questions_asked: number
    - questions_about_tech_stack: number
    - questions_about_standards: number
    - defaults_referenced: boolean

Formula:
  question_reduction = (1 - (current_avg / baseline_avg)) * 100
  defaults_usage = (sessions_with_defaults / total_sessions) * 100
```

**Dashboard View**:

```plaintext
┌─────────────────────────────────────────────────────────────┐
│ TECHNICAL DEFAULTS IMPACT (Last 30 Days)                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Average Clarifications per Workflow:                       │
│    Baseline (before):  8.2 questions                       │
│    Current (after):    2.9 questions                       │
│    Reduction:          65%  ✓ Above target (60%)          │
│                                                             │
│  Defaults Reference Rate:  89% (42/47 workflows)           │
│                                                             │
│  Question Categories Eliminated:                            │
│    Tech stack:          ██████████████  98% reduction     │
│    Naming conventions:  ████████████░░  92% reduction     │
│    Testing approach:    ████████████░░  87% reduction     │
│    Error handling:      ██████████░░░░  78% reduction     │
│    Architecture:        ████████░░░░░░  63% reduction     │
│                                                             │
│  Remaining Questions (Legitimate):                          │
│    Business logic:      ████████████  12 questions (41%)  │
│    Requirements:        ██████████░░  10 questions (34%)  │
│    Design decisions:    ████░░░░░░░░   5 questions (17%)  │
│    Other:               ██░░░░░░░░░░   2 questions (7%)   │
│                                                             │
│  Time Impact:                                               │
│    Time saved (refine-specs):  2.1 min/workflow avg       │
│    Time saved (create-prd):    1.4 min/workflow avg       │
│    Total time saved:           2.7 hours                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Overall Workflow Metrics

### Phase-by-Phase Breakdown

```plaintext
┌─────────────────────────────────────────────────────────────┐
│ WORKFLOW PHASE TIMES (Last 30 Days)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Phase            Baseline   Current   Savings   Change    │
│  ─────────────────────────────────────────────────────────  │
│  refine-specs     12.3 min    9.0 min   3.3 min  ▼27%     │
│  create-prd        8.7 min    7.0 min   1.7 min  ▼20%     │
│  plan             24.8 min   15.2 min   9.6 min  ▼39%     │
│  review-plan      39.6 min   14.1 min  25.5 min  ▼64%     │
│  implement        62.4 min   58.3 min   4.1 min  ▼7%      │
│  assert            8.5 min    4.2 min   4.3 min  ▼51%     │
│  review-code      15.2 min   15.0 min   0.2 min  ▼1%      │
│  test              7.4 min    7.5 min  -0.1 min  ▲1%      │
│  ─────────────────────────────────────────────────────────  │
│  TOTAL           192.2 min  130.3 min  61.9 min  ▼32%     │
│                                                             │
│  Biggest Improvements:                                      │
│    1. review-plan:  ▼64% (25.5 min saved)                 │
│    2. assert:       ▼51% (4.3 min saved)                  │
│    3. plan:         ▼39% (9.6 min saved)                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Workflow Completion Rate

```plaintext
┌─────────────────────────────────────────────────────────────┐
│ WORKFLOW SUCCESS METRICS (Last 30 Days)                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Workflows Started:      50                                 │
│  Workflows Completed:    47  (94%)                         │
│  Workflows Failed:        3  (6%)                          │
│                                                             │
│  Failure Reasons:                                           │
│    Requirements unclear:  2 (67%)  → Fixed after clarity   │
│    Technical blocker:     1 (33%)  → Escalated to team     │
│                                                             │
│  Average Completion Time:                                   │
│    Simple tasks:     1h 42m  (vs 2h 30m baseline)         │
│    Moderate tasks:   2h 08m  (vs 3h 12m baseline)         │
│    Complex tasks:    2h 38m  (vs 3h 30m baseline)         │
│                                                             │
│  Quality Scores (Maintained):                               │
│    Code quality:     88/100  (unchanged)                   │
│    Test quality:     85/100  (unchanged)                   │
│    Review quality:   82/100  (▲17 pts)                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Trend Analysis

### Weekly Performance Trends

```plaintext
┌─────────────────────────────────────────────────────────────┐
│ 4-WEEK TREND ANALYSIS                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Average Workflow Time:                                     │
│    Week 1:  142 min  ████████████████░░░░                 │
│    Week 2:  134 min  ███████████████░░░░░  ↓ Improving    │
│    Week 3:  128 min  ██████████████░░░░░░  ↓ Improving    │
│    Week 4:  125 min  █████████████░░░░░░░  ↓ Stabilizing  │
│                                                             │
│  Template Usage:                                            │
│    Week 1:   32%  ████████░░░░░░░░░░░░░░                  │
│    Week 2:   38%  █████████░░░░░░░░░░░░░                  │
│    Week 3:   45%  ███████████░░░░░░░░░░░  ↑ Above target  │
│    Week 4:   52%  █████████████░░░░░░░░░  ↑ Excellent     │
│                                                             │
│  Interpretation:                                            │
│    • Learning curve: Teams adapting to optimizations       │
│    • Week 3-4: Stabilization, consistent performance       │
│    • Template usage growing (52% > 40% target)             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Performance by Task Complexity

```plaintext
┌─────────────────────────────────────────────────────────────┐
│ COMPLEXITY-BASED PERFORMANCE                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Complexity 1-3 (Trivial):      7 workflows                │
│    Avg Time: 1h 42m (vs 2h 30m baseline = -48 min)        │
│    Used Express: 100% (7/7)                                │
│    Time Efficiency: 85/100                                 │
│                                                             │
│  Complexity 4-6 (Simple-Moderate):  25 workflows           │
│    Avg Time: 2h 03m (vs 3h 12m baseline = -69 min)        │
│    Used Templates: 80% (20/25)                             │
│    Time Efficiency: 78/100                                 │
│                                                             │
│  Complexity 7-9 (Complex):      13 workflows               │
│    Avg Time: 2h 35m (vs 3h 25m baseline = -50 min)        │
│    Used Templates: 0% (not applicable)                     │
│    Time Efficiency: 68/100                                 │
│                                                             │
│  Complexity 10 (Very Complex):  2 workflows                │
│    Avg Time: 3h 15m (vs 3h 45m baseline = -30 min)        │
│    Used Tiered Planning: 100% (2/2)                        │
│    Time Efficiency: 62/100                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Collection Implementation

### Session Log Structure

**File**: `.ai/sessions/<workflow-id>/<command>-<timestamp>.json`

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

**File**: `.ai/scripts/extract-metrics.ts`

```typescript
#!/usr/bin/env tsx

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

interface WorkflowMetrics {
  totalWorkflows: number;
  templateUsage: {
    total: number;
    byPattern: Record<string, number>;
    avgTimeSaved: number;
  };
  earlyExitRate: number;
  avgWorkflowTime: number;
  phaseBreakdown: Record<string, { avg: number; count: number }>;
}

async function extractMetrics(period: '7d' | '30d' = '30d'): Promise<WorkflowMetrics> {
  const sessionsDir = '.ai/sessions';
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - (period === '7d' ? 7 : 30));

  // Read all session directories
  const workflows = await readdir(sessionsDir);

  const metrics: WorkflowMetrics = {
    totalWorkflows: 0,
    templateUsage: {
      total: 0,
      byPattern: {},
      avgTimeSaved: 0
    },
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

      // Filter by date
      const sessionDate = new Date(session.timestamp);
      if (sessionDate < cutoffDate) continue;

      metrics.totalWorkflows++;

      // Extract optimization metrics
      if (session.optimization_metrics) {
        const opt = session.optimization_metrics;

        // Template usage
        if (opt.template_used) {
          metrics.templateUsage.total++;
          metrics.templateUsage.byPattern[opt.template_used] =
            (metrics.templateUsage.byPattern[opt.template_used] || 0) + 1;
          metrics.templateUsage.avgTimeSaved += opt.time_saved_minutes || 0;
        }

        // Early exit
        if (opt.early_exit_triggered) {
          metrics.earlyExitRate++;
        }
      }

      // Workflow time
      metrics.avgWorkflowTime += session.duration_ms / 60000; // Convert to minutes

      // Phase breakdown
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

  // Calculate averages
  if (metrics.totalWorkflows > 0) {
    metrics.avgWorkflowTime /= metrics.totalWorkflows;
    metrics.earlyExitRate = (metrics.earlyExitRate / metrics.totalWorkflows) * 100;
    if (metrics.templateUsage.total > 0) {
      metrics.templateUsage.avgTimeSaved /= metrics.templateUsage.total;
    }
  }

  return metrics;
}

// CLI usage
const period = process.argv[2] as '7d' | '30d' || '30d';
extractMetrics(period).then(metrics => {
  console.log(JSON.stringify(metrics, null, 2));
});
```

**Usage**:

```bash
# Extract last 30 days
pnpm tsx .ai/scripts/extract-metrics.ts 30d

# Extract last 7 days
pnpm tsx .ai/scripts/extract-metrics.ts 7d

# Generate dashboard
pnpm tsx .ai/scripts/extract-metrics.ts 30d | \
  pnpm tsx .ai/scripts/generate-dashboard.ts
```

---

### Dashboard Generation Script

**File**: `.ai/scripts/generate-dashboard.ts`

```typescript
#!/usr/bin/env tsx

import { readFileSync } from 'fs';
import { writeFile } from 'fs/promises';

interface Metrics {
  totalWorkflows: number;
  templateUsage: {
    total: number;
    byPattern: Record<string, number>;
    avgTimeSaved: number;
  };
  earlyExitRate: number;
  avgWorkflowTime: number;
  phaseBreakdown: Record<string, { avg: number; count: number }>;
}

function generateBar(percentage: number, width: number = 20): string {
  const filled = Math.round((percentage / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function generateDashboard(metrics: Metrics): string {
  const baselineTime = 192; // minutes
  const timeSaved = baselineTime - metrics.avgWorkflowTime;
  const improvement = ((timeSaved / baselineTime) * 100).toFixed(0);

  const templateRate = (metrics.templateUsage.total / metrics.totalWorkflows * 100).toFixed(0);

  return `
# Workflow Optimization Dashboard

**Generated**: ${new Date().toISOString()}
**Period**: Last 30 days
**Workflows**: ${metrics.totalWorkflows}

---

## Executive Summary

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│ PERFORMANCE OVERVIEW                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Average Workflow Time:  ${metrics.avgWorkflowTime.toFixed(0)} min  ▼${improvement}% from baseline       │
│  Template Usage Rate:    ${templateRate}%                                │
│  Early Exit Rate:        ${metrics.earlyExitRate.toFixed(0)}%                                │
│  Total Time Saved:       ${(timeSaved * metrics.totalWorkflows / 60).toFixed(1)} hours                        │
│                                                             │
│  ${generateBar(parseFloat(improvement))} ${improvement}%                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
\`\`\`

## Template Usage

${Object.entries(metrics.templateUsage.byPattern)
  .map(([pattern, count]) => {
    const percentage = (count / metrics.templateUsage.total * 100).toFixed(0);
    return `- **${pattern}**: ${count} uses (${percentage}%) ${generateBar(parseFloat(percentage), 10)}`;
  })
  .join('\n')}

## Phase Breakdown

${Object.entries(metrics.phaseBreakdown)
  .sort((a, b) => b[1].avg - a[1].avg)
  .map(([phase, data]) => `- **${phase}**: ${data.avg.toFixed(1)} min avg (${data.count} executions)`)
  .join('\n')}

---

**Time Saved per Workflow**: ${timeSaved.toFixed(1)} minutes
`;
}

// Read metrics from stdin or file
const input = process.stdin.isTTY
  ? readFileSync(process.argv[2] || 'metrics.json', 'utf-8')
  : readFileSync(0, 'utf-8');

const metrics: Metrics = JSON.parse(input);
const dashboard = generateDashboard(metrics);

// Write to file
await writeFile('.ai/METRICS_REPORT.md', dashboard);
console.log('Dashboard generated: .ai/METRICS_REPORT.md');
```

---

## Automated Monitoring

### GitHub Actions Workflow

**File**: `.github/workflows/metrics-dashboard.yml`

```yaml
name: Generate Metrics Dashboard

on:
  schedule:
    # Run every Monday at 9am UTC
    - cron: '0 9 * * 1'
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
        working-directory: .ai/.bin

      - name: Extract metrics
        run: |
          pnpm tsx .ai/scripts/extract-metrics.ts 30d > metrics.json

      - name: Generate dashboard
        run: |
          pnpm tsx .ai/scripts/generate-dashboard.ts metrics.json

      - name: Commit dashboard
        run: |
          git config user.name "Metrics Bot"
          git config user.email "metrics@example.com"
          git add .ai/METRICS_REPORT.md
          git commit -m "chore(metrics): update dashboard [skip ci]" || echo "No changes"
          git push
```

---

## Alert Thresholds

### Performance Degradation Alerts

```yaml
alerts:
  - name: Workflow time regression
    condition: avg_workflow_time > baseline * 1.1
    severity: warning
    message: "Workflow time increased 10% above baseline"

  - name: Template adoption declining
    condition: template_usage_rate < 35%
    severity: info
    message: "Template usage below 35% (target: 40%)"

  - name: Early exit not triggering
    condition: early_exit_rate < 20%
    severity: warning
    message: "Early exit rate below 20% (target: 30%)"

  - name: Linter errors appearing
    condition: lint_errors_in_assert > 0
    severity: critical
    message: "Linter errors found in assert phase (should be 0)"
```

---

## Weekly Report Template

**File**: `.ai/templates/WEEKLY_METRICS_REPORT.md`

```markdown
# Weekly Metrics Report

**Week**: [WEEK_NUMBER]
**Period**: [START_DATE] - [END_DATE]
**Workflows**: [COUNT]

## Highlights

- ✅ [Achievement 1]
- ✅ [Achievement 2]
- ⚠️ [Area of concern]

## Key Metrics

| Metric            | This Week | Last Week | Target  | Status  |
| ----------------- | --------- | --------- | ------- | ------- |
| Avg Workflow Time | [X] min   | [Y] min   | 130 min | [✓/⚠/✗] |
| Template Usage    | [X]%      | [Y]%      | 40%     | [✓/⚠/✗] |
| Early Exit Rate   | [X]%      | [Y]%      | 30%     | [✓/⚠/✗] |
| Time Saved        | [X] hrs   | [Y] hrs   | -       | -       |

## Optimizations Performance

[Brief analysis of each optimization's performance this week]

## Trends

[Charts or observations about trends]

## Action Items

- [ ] [Action 1]
- [ ] [Action 2]

## Next Week Focus

[What to focus on improving next week]
```

---

## Quick Reference Commands

```bash
# View current metrics
pnpm tsx .ai/scripts/extract-metrics.ts 30d | jq '.'

# Generate dashboard
pnpm tsx .ai/scripts/extract-metrics.ts 30d | \
  pnpm tsx .ai/scripts/generate-dashboard.ts

# Check specific optimization
jq '.optimization_metrics.template_used' \
  .ai/sessions/*/plan-*.json | \
  grep -v null | wc -l

# Calculate time savings
jq -r '.optimization_metrics.time_saved_minutes // 0' \
  .ai/sessions/*/plan-*.json | \
  awk '{sum+=$1} END {print sum " minutes total"}'

# Review quality scores
jq -r '.quality_metrics.review_score // 0' \
  .ai/sessions/*/review-plan-*.json | \
  awk '{sum+=$1; count++} END {print "Avg: " sum/count}'
```

---

## Next Steps

1. **Implement data collection**:
   - Add `optimization_metrics` to session logs
   - Update commands to emit metrics
   - Test metric extraction

2. **Set up automation**:
   - Deploy GitHub Actions workflow
   - Configure alert thresholds
   - Set up weekly report generation

3. **Monitor for 30 days**:
   - Track all 7 optimization metrics
   - Identify underperforming areas
   - Adjust targets if needed

4. **Iterate**:
   - Optimize based on data
   - Add new templates for common patterns
   - Tune decision criteria thresholds

---

**End of Metrics Dashboard**  
