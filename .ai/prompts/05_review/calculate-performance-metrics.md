---
id: review.calculate-performance-metrics
version: 1.0.0
category: review
experimental: true
name: Calculate Performance Metrics
description: Quantify workflow efficiency, error rates, and identify bottlenecks
tags:
  - performance
  - metrics
  - efficiency
  - bottleneck-analysis
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.analyze-command-execution
inputs:
  - name: execution_duration
    description: Total workflow duration in seconds
    type: number
    required: true
  - name: commands_chain
    description: Array of commands with durations
    type: array
    required: true
  - name: errors_encountered
    description: List of errors from execution analysis
    type: array
    required: true
  - name: retries_performed
    description: Number of retries
    type: number
    required: true
outputs:
  - time_efficiency_score
  - error_rate
  - completion_success_rate
  - bottlenecks_identified
  - performance_trends
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Calculate Performance Metrics

## Objective

Quantify workflow performance through time efficiency, error rates, and bottleneck identification.

## Instructions

### Step 1: Calculate Time Efficiency Score

**Formula:**
```
Baseline times per command (minutes):
- fetch-task: 2
- plan: 5
- implement: 20
- test: 5
- review-code: 3
- review-functional: 3
- commit: 2
- create-pr: 3

Expected total = sum of baseline times for executed commands
Actual total = execution_duration / 60

Efficiency ratio = Expected / Actual
Time efficiency score = min(100, Efficiency ratio × 100)
```

**Interpretation:**
- **>100**: Faster than expected (excellent)
- **80-100**: On target (good)
- **60-79**: Slower than expected (needs improvement)
- **<60**: Significantly slow (bottlenecks present)

### Step 2: Calculate Error Rate

```
Total operations = sum(tools_invoked.values())
Total errors = length(errors_encountered)

Error rate = Total errors / Total operations
```

**Thresholds:**
- **<2%**: Excellent
- **2-5%**: Good
- **5-10%**: Acceptable
- **>10%**: High error rate

### Step 3: Assess Completion Success

**Criteria:**
- Workflow completed fully? (yes/no)
- All planned steps executed? (%)
- Final output meets criteria? (yes/no)
- CI checks passed? (yes/no)

```
Success factors counted / 4 × 100 = Completion success rate
```

### Step 4: Identify Bottlenecks

For each command in chain:
- Calculate % of total time
- Compare against baseline
- If >150% of baseline, flag as bottleneck

**Bottleneck analysis:**
- Command name
- Actual duration vs expected
- % of total workflow time
- Recommended actions

### Step 5: Calculate Performance Trends (if historical data available)

Compare current metrics to historical average:
- Time efficiency trend
- Error rate trend
- Command-specific trends

## Output Format

```json
{
  "time_efficiency_score": 75,
  "time_breakdown": {
    "fetch_task": 150,
    "plan": 345,
    "implement": 1520,
    "test": 900,
    "commit": 120,
    "create_pr": 180
  },
  "time_breakdown_percent": {
    "fetch_task": 2.8,
    "plan": 6.4,
    "implement": 28.1,
    "test": 16.7,
    "commit": 2.2,
    "create_pr": 3.3
  },
  "longest_operation": {
    "command": "implement",
    "duration_seconds": 1520,
    "percentage_of_total": 28.1,
    "vs_baseline": "On target"
  },
  "error_rate": 0.04,
  "error_rate_rating": "Good",
  "errors_by_type": {
    "linter_error": 2,
    "type_error": 1,
    "test_failure": 0
  },
  "completion_success_rate": 100,
  "completion_factors": {
    "workflow_completed": true,
    "all_steps_executed": true,
    "output_meets_criteria": true,
    "ci_passed": true
  },
  "bottlenecks_identified": [
    {
      "command": "test",
      "issue": "Slow test execution (15 min vs 5 min expected)",
      "severity": "high",
      "actual_duration": 900,
      "expected_duration": 300,
      "percentage_over": 200,
      "recommendation": "Parallelize test suites, optimize setup/teardown"
    }
  ],
  "performance_trends": {
    "compared_to_baseline": "+12% faster",
    "trend": "improving",
    "data_available": true
  }
}
```

## Success Criteria

- ✅ Time efficiency score calculated (0-100)
- ✅ Time breakdown by command provided
- ✅ Error rate computed accurately
- ✅ Completion success assessed
- ✅ Bottlenecks identified with recommendations

## Error Handling

- **No baseline data**: Use default baselines
- **Historical data unavailable**: Skip trends, mark as N/A
- **Division by zero**: Handle edge cases gracefully

