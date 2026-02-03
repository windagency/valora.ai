---
id: review.identify-improvement-areas
version: 1.0.0
category: review
experimental: true
name: Identify Improvement Areas
description: Generate actionable recommendations for agents, prompts, and workflow optimization
tags:
  - improvement
  - recommendations
  - optimization
  - continuous-learning
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.analyze-command-execution
    - review.calculate-performance-metrics
    - review.collect-user-feedback
inputs:
  - name: agents_used
    description: List of agents used in workflow
    type: array
    required: true
  - name: prompts_executed
    description: List of prompts executed
    type: array
    required: true
  - name: bottlenecks_identified
    description: Performance bottlenecks
    type: array
    required: true
  - name: pain_points
    description: User-reported pain points
    type: array
    required: false
  - name: errors_encountered
    description: Errors during execution
    type: array
    required: true
outputs:
  - agent_improvements
  - prompt_refinements
  - workflow_optimizations
  - tool_suggestions
  - training_recommendations
tokens:
  avg: 3500
  max: 7000
  min: 1800
---

# Identify Improvement Areas

## Objective

Analyze workflow execution data, performance metrics, and user feedback to generate specific, actionable recommendations for improving agents, prompts, and processes.

## Instructions

### Step 1: Analyze Agent Performance

For each agent in `agents_used`:

**Performance indicators:**
- Execution time (from bottlenecks)
- Error count (from errors_encountered)
- User satisfaction (from pain_points)
- Retry rate

**Classification:**
- **High-performing**: Fast, low errors, positive feedback
- **Adequate**: Meets expectations
- **Needs improvement**: Slow, frequent errors, or negative feedback

**Generate recommendations:**
- Configuration adjustments
- Specialization refinements
- Tool additions
- Context improvements

### Step 2: Analyze Prompt Effectiveness

For each prompt in `prompts_executed`:

**Effectiveness indicators:**
- Errors during prompt execution
- Retries required
- Output quality (inferred from subsequent steps)
- User feedback on prompt outputs

**Issue patterns:**
- High error rate → Prompt lacks validation
- Frequent retries → Prompt unclear or missing context
- Poor quality → Prompt instructions insufficient

**Generate refinements:**
- Add clarifications
- Include additional context
- Improve validation rules
- Refine output format

### Step 3: Identify Workflow Optimizations

**Analyze workflow for:**

1. **Parallelization opportunities:**
   - Which commands can run concurrently?
   - Example: Run test and review-code in parallel

2. **Conditional skipping:**
   - Which steps can be skipped based on context?
   - Example: Skip assert if coverage >90%

3. **Caching opportunities:**
   - What data can be cached between commands?
   - Example: Cache codebase analysis from plan to implement

4. **Decision point adjustments:**
   - Are thresholds appropriate?
   - Do loops terminate efficiently?

5. **New command patterns:**
   - Repeated sequences that could be automated
   - Common workflows needing dedicated commands

**Estimate time savings:**
- Calculate potential reduction in duration
- Quantify efficiency gains

### Step 4: Suggest Tool Improvements

Based on bottlenecks and pain points:

**Missing tools:**
- What operations are manual that could be automated?
- Example: Auto-fix linter errors

**Tool enhancements:**
- Existing tools that need improvements
- Example: Faster test execution

**Integration opportunities:**
- External tools to integrate
- Example: Code complexity analyzer

### Step 5: Generate Training Recommendations

**Knowledge gaps identified:**
- Agents lacking context
- Prompts with repeated patterns
- Common error scenarios

**Training needs:**
- Update agent profiles
- Add examples to prompts
- Document best practices
- Create new knowledge base entries

## Output Format

```json
{
  "agent_improvements": [
    {
      "agent": "backend-engineer-api",
      "performance": "good",
      "issues_found": [],
      "suggestions": [
        "Add real-time linting validation to prevent post-implementation fixes",
        "Include error handling patterns by default"
      ],
      "priority": "medium",
      "estimated_impact": "Save ~5 minutes per workflow"
    },
    {
      "agent": "qa",
      "performance": "needs_improvement",
      "issues_found": [
        "Test execution took 15 minutes (expected: 5 minutes)"
      ],
      "suggestions": [
        "Optimize test setup/teardown",
        "Parallelize test suites",
        "Cache test dependencies"
      ],
      "priority": "high",
      "estimated_impact": "Save ~10 minutes per workflow"
    }
  ],
  "prompt_refinements": [
    {
      "prompt": "code.implement-changes",
      "issues_found": [
        "Generated code had 2 linter errors"
      ],
      "suggestion": "Add instruction: 'Validate code against linter rules before outputting'",
      "priority": "high",
      "estimated_impact": "Reduce errors by 50%"
    },
    {
      "prompt": "code.implement-tests",
      "issues_found": [],
      "suggestion": "Add instruction: 'Optimize test performance, use mocks for external dependencies'",
      "priority": "medium",
      "estimated_impact": "Improve test speed"
    }
  ],
  "workflow_optimizations": [
    {
      "type": "parallelization",
      "suggestion": "Run 'test' and 'review-code' in parallel after implementation",
      "rationale": "These commands are independent",
      "estimated_time_saved": "5 minutes",
      "priority": "high",
      "implementation_complexity": "low"
    },
    {
      "type": "conditional_skip",
      "suggestion": "Skip 'assert' step if test coverage is >90%",
      "rationale": "High coverage indicates completeness",
      "estimated_time_saved": "2 minutes",
      "priority": "medium",
      "implementation_complexity": "low"
    },
    {
      "type": "caching",
      "suggestion": "Cache codebase analysis results from 'plan' phase for use in 'implement'",
      "rationale": "Avoid redundant file scanning",
      "estimated_time_saved": "3 minutes",
      "priority": "medium",
      "implementation_complexity": "medium"
    }
  ],
  "tool_suggestions": [
    {
      "tool": "auto_fix_linter",
      "type": "new",
      "rationale": "Reduce manual linter error fixes",
      "impact": "Save ~5 minutes per workflow",
      "priority": "high"
    }
  ],
  "training_recommendations": [
    "Update @qa agent with test performance optimization patterns",
    "Add linter validation examples to @engineer agent training",
    "Document common error patterns in knowledge base",
    "Create best practice guide for test optimization"
  ]
}
```

## Success Criteria

- ✅ All agents analyzed with performance classification
- ✅ Prompt effectiveness assessed
- ✅ Workflow optimizations identified
- ✅ Improvements prioritized by impact
- ✅ Estimated time savings calculated
- ✅ Recommendations are specific and actionable

## Error Handling

- **Insufficient data**: Mark recommendations as "low confidence"
- **No issues found**: Return positive feedback, skip suggestions
- **Conflicting recommendations**: Prioritize by user pain points

