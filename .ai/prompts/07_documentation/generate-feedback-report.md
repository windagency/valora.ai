---
id: documentation.generate-feedback-report
version: 1.0.0
category: documentation
experimental: true
name: Generate Feedback Report
description: Create comprehensive feedback report synthesizing all collected metrics and recommendations
tags:
  - documentation
  - feedback
  - reporting
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.identify-completed-workflow
    - review.calculate-performance-metrics
    - review.evaluate-quality-outcomes
    - review.identify-improvement-areas
inputs:
  - name: workflow_executed
    description: Workflow type
    type: string
    required: true
  - name: satisfaction_score
    description: User satisfaction rating (1-10)
    type: number
    required: false
  - name: time_efficiency_score
    description: Time efficiency score (0-100)
    type: number
    required: true
  - name: overall_quality_score
    description: Overall quality score (0-100)
    type: number
    required: true
  - name: agent_improvements
    description: Agent improvement recommendations
    type: array
    required: true
  - name: prompt_refinements
    description: Prompt refinement suggestions
    type: array
    required: true
  - name: workflow_optimizations
    description: Workflow optimization opportunities
    type: array
    required: true
outputs:
  - feedback_report
  - report_path
  - summary_statistics
tokens:
  avg: 4500
  max: 9000
  min: 2200
---

# Generate Feedback Report

## Objective

Synthesize all collected data, metrics, and recommendations into a comprehensive, human-readable feedback report.

## Instructions

### Report Structure

```markdown
# Feedback Report: <Workflow Name>

**Date:** <ISO date>
**Duration:** <duration in minutes>
**Satisfaction:** <score>/10 (if available)
**Quality Score:** <score>/100
**Efficiency Score:** <score>/100

---

## Executive Summary

<2-3 sentence overview of workflow execution, key achievements, and main improvement areas>

---

## Workflow Overview

**Commands Executed:**
1. <command-name> (<duration>) - <Agent>
2. <command-name> (<duration>) - <Agent>
...

**Total Duration:** <duration>
**Commits Created:** <count>
**Files Changed:** <count> (+<additions>/-<deletions> lines)
**CI Status:** <status>
**PR Status:** <status> (if applicable)

---

## Performance Metrics

### Time Breakdown

```text
<command-1>  ▓▓▓░░░░░░░░░░░░░░░░░  <duration> (<percent>%)
<command-2>  ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░  <duration> (<percent>%)
...
```

### Efficiency Score: <score>/100

- **Strengths:** <positive aspects>
- **Bottlenecks:** <identified bottlenecks>

### Error Rate: <percentage>% (<count> errors, <resolved> resolved)

- <Error type>: <count>
- <Error type>: <count>

---

## Quality Assessment

### Overall Quality: <score>/100 <rating emoji>

| Dimension      | Score  | Details                     |
| -------------- | ------ | --------------------------- |
| Code Quality   | <score>/100 | <key metrics>        |
| Test Quality   | <score>/100 | <key metrics>        |
| Review Quality | <score>/100 | <key metrics>        |

---

## User Feedback

(if satisfaction_score available)

**Satisfaction:** <score>/10 <emoji>

**What Went Well:**
- <highlight>
- <highlight>

**Pain Points:**
- <pain point>
- <pain point>

**Improvement Suggestions:**
- <suggestion>
- <suggestion>

---

## Improvement Recommendations

### High Priority

<List high-priority recommendations with estimated impact>

### Medium Priority

<List medium-priority recommendations>

### Agent Refinements

- **@<agent-name>:** <specific recommendation>
- **@<agent-name>:** <specific recommendation>

### Prompt Refinements

- **<prompt-name>:** <specific refinement>
- **<prompt-name>:** <specific refinement>

---

## Next Steps

<3-5 actionable next steps based on recommendations>

---

## Appendix

### Raw Metrics

<JSON or table with detailed metrics>

### Commands Timeline

<Detailed timeline of command execution>
```

### Step 1: Generate Executive Summary

Synthesize:
- Workflow type and outcome
- Overall performance (time efficiency + quality)
- Key achievements
- 1-2 main improvement areas

Keep to 2-3 sentences maximum.

### Step 2: Create Time Breakdown Visualization

Use ASCII bar chart:
- Each command gets a bar
- Bar length proportional to % of total time
- Show both duration and percentage

### Step 3: Prioritize Recommendations

Group by priority:
- **High**: >10 min savings or critical issues
- **Medium**: 5-10 min savings or quality improvements
- **Low**: <5 min savings or nice-to-haves

### Step 4: Calculate Summary Statistics

```json
{
  "satisfaction_score": <score or null>,
  "efficiency_score": <score>,
  "quality_score": <score>,
  "workflow_duration_minutes": <duration>,
  "commands_executed": <count>,
  "files_changed": <count>,
  "errors_encountered": <count>,
  "improvements_identified": <count>,
  "estimated_time_savings": <total minutes>
}
```

### Step 5: Save Report

**Path:** `.ai/feedback/<timestamp>-<workflow-type>.md`

**Filename format:** `YYYYMMDD-HHMM-<workflow-name>.md`

Example: `20251115-1430-feature-implementation.md`

## Output Format

```json
{
  "feedback_report": "<full markdown report content>",
  "report_path": ".ai/feedback/20251115-1430-feature-implementation.md",
  "summary_statistics": {
    "satisfaction_score": 8,
    "efficiency_score": 75,
    "quality_score": 87,
    "workflow_duration_minutes": 90,
    "commands_executed": 6,
    "files_changed": 12,
    "errors_encountered": 3,
    "improvements_identified": 7,
    "estimated_time_savings": 20
  }
}
```

## Success Criteria

- ✅ Report follows consistent structure
- ✅ Executive summary is concise and informative
- ✅ Metrics are visualized clearly
- ✅ Recommendations are prioritized and actionable
- ✅ Report is saved to correct location
- ✅ Summary statistics accurately reflect analysis

## Rules

**DO:**
- ✅ Use clear formatting and structure
- ✅ Include visualizations for key metrics
- ✅ Prioritize recommendations by impact
- ✅ Be specific and actionable
- ✅ Balance positives with improvements

**DON'T:**
- ❌ Include raw data dumps in main report
- ❌ Use jargon without explanation
- ❌ Make vague recommendations
- ❌ Overwhelm with too much detail

