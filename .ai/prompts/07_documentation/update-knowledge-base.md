---
id: documentation.update-knowledge-base
version: 1.0.0
category: documentation
experimental: true
name: Update Knowledge Base
description: Integrate feedback learnings into persistent knowledge base for continuous improvement
tags:
  - documentation
  - knowledge-management
  - continuous-learning
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.use-modern-cli-tools
    - documentation.generate-feedback-report
    - review.identify-improvement-areas
inputs:
  - name: feedback_report
    description: Generated feedback report content
    type: string
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
  - knowledge_base_updated
  - patterns_learned
  - best_practices_added
tokens:
  avg: 2500
  max: 5000
  min: 1200
---

# Update Knowledge Base

## Objective

Integrate feedback learnings into the persistent knowledge base, extract patterns, document best practices, and enable future lookup for continuous improvement.

## Instructions

### Step 1: Store Feedback Report

**Location:** `knowledge-base/feedback/<timestamp>-<workflow-type>.md`

**Index metadata:**
```json
{
  "timestamp": "<ISO timestamp>",
  "workflow_type": "<type>",
  "commands_used": [<list>],
  "agents_involved": [<list>],
  "satisfaction_level": "<high|medium|low>",
  "quality_score": <score>,
  "efficiency_score": <score>,
  "key_tags": [<searchable tags>]
}
```

**Tags for searchability:**
- Workflow type (feature-implementation, bugfix, refactor)
- Commands used
- Agents involved
- Outcome (success, needs-improvement, failed)
- Key issues (performance, quality, usability)

### Step 2: Extract Success Patterns

**Identify what worked well:**
- High satisfaction scores
- Fast execution times
- Low error rates
- Positive user feedback

**Document patterns:**

Create entry in `knowledge-base/patterns/success/`:

```markdown
## Pattern: <Pattern Name>

**Observed in:** <workflow-type>
**Frequency:** <how often>
**Indicators:**
- <indicator 1>
- <indicator 2>

**Why it works:**
<explanation>

**How to replicate:**
<steps>

**Applicable to:**
- <use case 1>
- <use case 2>
```

### Step 3: Extract Failure Patterns

**Identify what didn't work:**
- Low satisfaction scores
- Bottlenecks
- High error rates
- User pain points

**Document anti-patterns:**

Create entry in `knowledge-base/patterns/avoid/`:

```markdown
## Anti-Pattern: <Pattern Name>

**Observed in:** <workflow-type>
**Frequency:** <how often>
**Symptoms:**
- <symptom 1>
- <symptom 2>

**Root cause:**
<explanation>

**How to avoid:**
<preventive measures>

**Alternative approach:**
<better way>
```

### Step 4: Document Agent Improvement Recommendations

For each agent improvement identified:

**IMPORTANT:** Do NOT modify files in the `.ai/` folder directly. Instead, document recommendations in the knowledge-base.

**Create recommendation file:** `knowledge-base/improvements/agents/<agent-name>-<date>.md`

**Document the following:**
- Best practices learned
- Common issues identified
- Context requirements discovered
- Tool usage pattern recommendations

**Example recommendation:**

```markdown
# Agent Improvement Recommendation: <agent-name>

**Date:** 2025-11-15
**Source:** Feedback from feature-implementation workflow

## Issue Identified

Test execution was slow (15 min vs 5 min expected)

## Recommended Solution

Parallelize test suites, use mocks for external dependencies

## Expected Impact

Reduced test time by 66%

## Action Required

Submit this recommendation for review by a system administrator.
```

### Step 5: Document Prompt Refinement Recommendations

For each prompt refinement identified:

**IMPORTANT:** Do NOT modify files in the `.ai/` folder directly. Instead, document recommendations in the knowledge-base.

**Create recommendation file:** `knowledge-base/improvements/prompts/<prompt-name>-<date>.md`

**Suggested changes to document:**
- Clarifications needed in instructions
- Additional validation rules to add
- Output format specification improvements
- Examples for common scenarios

**Example recommendation:**

```markdown
# Prompt Refinement Recommendation

**Prompt:** <category>/<prompt-name>
**Date:** 2025-11-15
**Source:** Feedback from feature-implementation workflow

## Suggested Changes

### 2025-11-15 - v1.1.0
- Added real-time linting validation instruction
- Included error handling patterns in output
- Based on feedback from feature-implementation workflow
```

### Step 6: Document Best Practices

Create or update best practices guides:

**Location:** `knowledge-base/best-practices/`

**Categories:**
- Agent usage
- Prompt design
- Workflow optimization
- Error handling
- Performance tuning

**Format:**

```markdown
# Best Practice: <Title>

**Category:** <category>
**Priority:** <high|medium|low>
**Source:** Feedback from <workflow-type> (<date>)

## Description

<What is this best practice>

## When to Apply

<Situations where this applies>

## How to Implement

<Step-by-step instructions>

## Expected Impact

<Quantified benefits>

## Example

<Real example from feedback>
```

### Step 7: Create Searchable Index

**Enable future queries:**
- "Show me feedback for similar workflows"
- "What are common issues with the implement command?"
- "What's the average satisfaction for @qa agent?"

**Index structure:**

```json
{
  "feedback_reports": [
    {
      "id": "20251115-1430-feature-implementation",
      "workflow_type": "feature-implementation",
      "satisfaction": 8,
      "quality_score": 87,
      "efficiency_score": 75,
      "agents": ["product-manager", "lead", "backend-engineer-api", "qa"],
      "commands": ["fetch-task", "plan", "implement", "test", "commit", "create-pr"],
      "key_issues": ["slow-test-execution", "linter-errors"],
      "improvements": ["parallelize-tests", "real-time-linting"]
    }
  ]
}
```

## Output Format

```json
{
  "knowledge_base_updated": true,
  "feedback_report_stored": "knowledge-base/feedback/20251115-1430-feature-implementation.md",
  "patterns_learned": [
    {
      "pattern": "linter-errors-during-implementation",
      "type": "failure",
      "frequency": "common",
      "recommendation": "Add real-time linter validation to prevent post-implementation fixes",
      "stored_at": "knowledge-base/patterns/avoid/linter-errors-post-implementation.md"
    },
    {
      "pattern": "slow-test-execution",
      "type": "failure",
      "frequency": "occasional",
      "recommendation": "Optimize test suites, use parallelization and caching",
      "stored_at": "knowledge-base/patterns/avoid/slow-test-execution.md"
    }
  ],
  "best_practices_added": [
    {
      "practice": "real-time-linting",
      "description": "Validate code against linter rules during generation to prevent errors",
      "applicable_to": ["backend-engineer-api", "frontend-engineer-react"],
      "stored_at": "knowledge-base/best-practices/real-time-linting.md"
    },
    {
      "practice": "test-performance-optimization",
      "description": "Use mocks, parallelize suites, cache dependencies for faster test execution",
      "applicable_to": ["qa"],
      "stored_at": "knowledge-base/best-practices/test-performance-optimization.md"
    }
  ],
  "agents_updated": ["qa", "backend-engineer-api"],
  "prompts_updated": ["code.implement-changes", "code.implement-tests"]
}
```

## Success Criteria

- ✅ Feedback report stored with metadata
- ✅ Patterns extracted (success and failure)
- ✅ Best practices documented
- ✅ Agent profiles updated
- ✅ Prompt templates refined
- ✅ Searchable index created/updated

## Error Handling

- **Cannot write to knowledge base**: Log error, return status
- **Pattern already exists**: Merge with existing, note frequency
- **Agent/prompt file missing**: Create new or log warning

