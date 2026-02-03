---
id: context.load-plan-context
version: 1.0.0
category: context
experimental: true
name: Load Plan Context
description: Parse and understand implementation plan structure and content
tags:
  - plan-review
  - context-loading
  - parsing
model_requirements:
  min_context: 128000
  recommended:
    - gpt-5-thinking-high
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires: []
inputs:
  - name: plan_document
    description: Path to the implementation plan document
    type: string
    required: true
  - name: previous_plan_version
    description: Optional previous version for comparison
    type: string
    required: false
outputs:
  - plan_structure
  - task_requirements
  - complexity_assessment
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Load Plan Context

## Objective

Parse an implementation plan document to extract its structure, requirements, complexity assessment, and metadata for subsequent validation stages.

## Context

You are reviewing an implementation plan that was created by the `/plan` command. Your role is to understand and structure the plan content for validation.

## Tools and Data Access

### Available Tools

**Use these tools to gather information:**

1. **read_file** - Read document files:
   - Target plan document to load
   - Previous plan versions (if path provided in `previous_plan_version` input)
   - `.ai/commands/*.md` - Command definitions
   - `.ai/agents/*.md` - Agent definitions

2. **query_session** - Access session data safely:
   - `action: "get", session_id: "<id>"` - Get session execution details
   - `action: "search", query: "<search-term>"` - Find previous plans or commands
   - `action: "list"` - List recent sessions

3. **glob_file_search** / **codebase_search** - Find files:
   - Search for previous plan versions
   - Find related documents

**IMPORTANT - DO NOT use:**
- `read_file` on `.ai/sessions/` - use `query_session` instead
- Direct access to session files - always use the `query_session` tool

### Accessing Previous Plans

If you need to compare with previous plan versions (Step 6):

1. **If `previous_plan_version` input is provided**: Use `read_file` with the provided path
2. **If searching for previous plans**: Use `glob_file_search` to find files matching the pattern (e.g., `**/*PLAN*.md`)
3. **If accessing session data**: Use `query_session` with `action: "search"` to find previous executions

**Never attempt to read `.ai/sessions/` directly** - this directory contains large session data files that should only be accessed via the `query_session` tool.

## Instructions

### Step 1: Load Plan Document

Read the plan document from `plan_document` input:

```plaintext
Expected plan location:
- Standard path: knowledge-base/backend/PLAN-{TASK_ID}.md
- Or custom path provided in input
```

**Validation**:
- Document exists and is readable
- Contains markdown structure
- Has recognizable sections

**If document is missing or malformed**:
```json
{
  "error": "plan_not_found",
  "message": "Plan document not found or unreadable",
  "path": "{plan_document}"
}
```

### Step 2: Parse Plan Structure

Identify and extract key sections:

#### Required Sections

```plaintext
1. Task Overview
   - Task description
   - Scope boundaries
   - Success criteria
   - Acceptance criteria

2. Complexity Assessment
   - Complexity score (0-10)
   - Contributing factors
   - Implementation mode (standard/incremental)

3. Dependencies
   - Technical dependencies
   - Data dependencies
   - Integration dependencies

4. Risk Assessment
   - Identified risks
   - Severity ratings
   - Mitigation strategies

5. Implementation Steps
   - Numbered steps
   - Affected files
   - Expected outcomes
   - Validation criteria

6. Testing Strategy
   - Test types (unit/integration/e2e)
   - Test scenarios
   - Acceptance criteria
   - Coverage targets

7. Rollback Strategy
   - Reversion steps
   - Data recovery plan

8. Effort Estimate
   - Time estimate
   - Confidence level
   - Key assumptions
```

**For each section**:
```json
{
  "section_name": "Task Overview",
  "present": true,
  "location": "lines 10-45",
  "subsections": ["Description", "Scope", "Success Criteria"],
  "content_summary": "Brief summary of section content",
  "quality_indicator": "substantive|placeholder|missing"
}
```

### Step 3: Extract Task Requirements

Parse and structure task requirements:

```json
{
  "task_title": "Add email verification to user registration",
  "task_description": "Implement email verification flow...",
  "scope": {
    "in_scope": [
      "Email verification endpoint",
      "Token generation and validation",
      "Email templates"
    ],
    "out_of_scope": [
      "SMS verification",
      "Social login integration"
    ]
  },
  "success_criteria": [
    "Users receive verification email within 5 seconds",
    "Tokens expire after 24 hours",
    "Email verification rate > 80%"
  ],
  "acceptance_criteria": [
    "User can register and receive verification email",
    "User can verify email with valid token",
    "Invalid/expired tokens are rejected"
  ]
}
```

### Step 4: Extract Complexity Assessment

Parse complexity details:

```json
{
  "complexity_score": 6.5,
  "complexity_factors": [
    {
      "factor": "Database schema changes",
      "impact": "medium",
      "description": "Adding email_verified column"
    },
    {
      "factor": "Integration with email service",
      "impact": "high",
      "description": "New dependency on SendGrid API"
    }
  ],
  "implementation_mode": "standard",
  "rationale": "Moderate complexity with well-defined scope"
}
```

### Step 5: Extract Metadata

Identify plan metadata:

```json
{
  "metadata": {
    "created_by": "@lead",
    "created_at": "2025-01-15T10:30:00Z",
    "plan_version": "1.0",
    "task_id": "TASK-123",
    "estimated_effort": "4-6 hours",
    "confidence_level": "high"
  }
}
```

### Step 6: Compare with Previous Version (Optional)

If `previous_plan_version` provided:

```json
{
  "comparison": {
    "previous_version": "knowledge-base/PLAN-TASK-123-v0.md",
    "changes": [
      {
        "section": "Risk Assessment",
        "change_type": "added",
        "description": "Added 3 new risks based on review feedback"
      },
      {
        "section": "Implementation Steps",
        "change_type": "modified",
        "description": "Steps 4-6 clarified with specific file references"
      }
    ],
    "improvements": [
      "Risk coverage increased",
      "Step clarity improved"
    ],
    "regressions": []
  }
}
```

### Step 7: Identify Plan Characteristics

Analyze plan characteristics for review context:

```json
{
  "characteristics": {
    "plan_length": "320 lines",
    "step_count": 12,
    "risk_count": 8,
    "dependency_count": 5,
    "test_scenario_count": 15,
    "has_diagrams": true,
    "has_code_examples": false,
    "detail_level": "high|medium|low",
    "actionability": "high|medium|low"
  }
}
```

## Output Format

```json
{
  "plan_structure": {
    "sections": [
      {
        "name": "Task Overview",
        "present": true,
        "location": "lines 10-45",
        "subsections": ["Description", "Scope", "Success Criteria"],
        "quality_indicator": "substantive"
      },
      {
        "name": "Complexity Assessment",
        "present": true,
        "location": "lines 46-65",
        "subsections": ["Score", "Factors", "Mode"],
        "quality_indicator": "substantive"
      }
    ],
    "missing_sections": [],
    "characteristics": {
      "plan_length": "320 lines",
      "step_count": 12,
      "risk_count": 8,
      "dependency_count": 5,
      "detail_level": "high"
    }
  },
  "task_requirements": {
    "task_title": "Add email verification",
    "task_description": "...",
    "scope": {
      "in_scope": ["..."],
      "out_of_scope": ["..."]
    },
    "success_criteria": ["..."],
    "acceptance_criteria": ["..."]
  },
  "complexity_assessment": {
    "complexity_score": 6.5,
    "complexity_factors": [...],
    "implementation_mode": "standard",
    "rationale": "..."
  },
  "metadata": {
    "created_by": "@lead",
    "created_at": "2025-01-15T10:30:00Z",
    "plan_version": "1.0"
  },
  "comparison": {
    "has_previous_version": false
  }
}
```

## Success Criteria

- ✅ Plan document successfully loaded and parsed
- ✅ All sections identified (present or missing)
- ✅ Task requirements extracted and structured
- ✅ Complexity assessment captured
- ✅ Metadata extracted
- ✅ Plan characteristics analyzed
- ✅ Previous version compared (if provided)

## Rules

**DO**:
- ✅ Preserve exact section content for downstream analysis
- ✅ Flag missing or incomplete sections
- ✅ Extract quantitative metrics (counts, scores)
- ✅ Note quality indicators objectively

**DON'T**:
- ❌ Don't evaluate quality yet (that's for validation stages)
- ❌ Don't infer missing content
- ❌ Don't make assumptions about intent
- ❌ Don't modify or interpret requirements

