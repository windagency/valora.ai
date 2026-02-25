---
id: review.validate-readiness
version: 1.0.0
category: review
experimental: true
name: Validate Readiness
description: Validate that a fetched task is ready for implementation
tags:
  - validation
  - task-readiness
  - quality-assurance
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.use-modern-cli-tools
    - onboard.fetch-task
    - context.check-dependencies
inputs:
  - name: task
    description: Selected task from onboard.fetch-task
    type: object
    required: true
  - name: dependencies
    description: Dependency status from context.check-dependencies
    type: object
    required: true
outputs:
  - readiness_score
  - readiness_issues
  - recommendation
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Validate Readiness

## Objective

Assess whether the fetched task is fully ready for implementation by validating completeness, clarity, and blocking issues.

## Instructions

### Step 1: Build Readiness Checklist

Evaluate task against 8 readiness criteria:

#### 1. Task Exists

- ✅ **Pass**: Task is in backlog with valid ID
- ❌ **Fail**: Task not found or invalid

#### 2. Task Not Completed

- ✅ **Pass**: Task status is not "completed"
- ⚠️ **Warning**: Task marked as completed (user may want to reopen)

#### 3. Task Not In-Progress

- ✅ **Pass**: Task status is not "in-progress"
- ⚠️ **Warning**: Task is in-progress (user may want to assist)

#### 4. Dependencies Satisfied

Use `dependencies.dependency_status` from context.check-dependencies:

- ✅ **Pass**: dependency_status = "all_satisfied" (score 100%)
- ⚠️ **Warning**: dependency_status = "partially_satisfied" (score 50-99%)
- ❌ **Fail**: dependency_status = "blocked" (score < 50%)

#### 5. Requirements Clear

Check task description and acceptance criteria:

- ✅ **Pass**: 
  - Description has ≥ 20 words
  - At least 1 acceptance criterion defined
  - Acceptance criteria are testable
  
- ❌ **Fail**:
  - Description missing or too vague (< 20 words)
  - No acceptance criteria
  - Criteria are not testable

#### 6. Domain Specified

- ✅ **Pass**: Domain field is populated and valid
- ❌ **Fail**: Domain is missing or invalid

#### 7. Effort Estimated

- ✅ **Pass**: 
  - Effort field is populated (XS/S/M/L)
  - Effort is ≤ 5 days (L max)
  
- ⚠️ **Warning**: Effort is > 5 days (should be decomposed)
- ❌ **Fail**: Effort is missing

#### 8. PRD Requirements Linked

- ✅ **Pass**: `requirements` field has ≥ 1 requirement ID
- ⚠️ **Warning**: No requirements linked (traceability gap)

### Step 2: Calculate Readiness Score

Score each criterion:

- **Pass (✅)**: 1.0 point
- **Warning (⚠️)**: 0.5 points
- **Fail (❌)**: 0.0 points

**Formula**:

```plaintext
Readiness Score = (Total Points / 8) × 100%
```

**Examples**:

```plaintext
All pass (8/8):           100%
7 pass, 1 warning (7.5/8): 94%
6 pass, 2 fail (6/8):      75%
4 pass, 4 fail (4/8):      50%
```

### Step 3: Apply Quality Gates

Determine readiness level based on score:

**Quality Gates**:

| Score   | Level            | Status                  | Action                                   |
| ------- | ---------------- | ----------------------- | ---------------------------------------- |
| 100%    | ✅ Fully Ready    | ready_for_next_stage    | Proceed to `/refine-task`                |
| 75-99%  | ⚠️ Mostly Ready   | ready_with_warnings     | Proceed with warnings, or fix gaps first |
| < 75%   | ❌ Not Ready      | needs_refinement        | Fix critical gaps before proceeding      |

### Step 4: Identify Readiness Issues

For any criterion that didn't pass (✅), document the issue:

**Issue format**:

```json
{
  "criterion": "Requirements Clear",
  "status": "fail",
  "issue": "Task description is too vague (only 12 words)",
  "severity": "high",
  "recommendation": "Expand description with implementation details and context"
}
```

**Severity levels**:

- **Critical**: Blocks implementation (no description, no acceptance criteria, hard blockers)
- **High**: Significantly impacts quality (vague description, missing effort)
- **Medium**: May cause issues (no requirements linked, warnings on dependencies)
- **Low**: Nice to have (minor clarity gaps)

### Step 5: Generate Recommendations

Based on readiness score and issues:

#### Score 100% - Fully Ready

**Status**: ✅ **Ready for Implementation**

**Message**:

```plaintext
✅ Task is fully ready for implementation.

**Readiness Score**: 100%

All criteria met. Proceed to `/refine-task [TASK-ID]` to create detailed implementation plan.
```

#### Score 75-99% - Mostly Ready with Warnings

**Status**: ⚠️ **Ready with Warnings**

**Message**:

```plaintext
⚠️ Task is mostly ready with minor gaps.

**Readiness Score**: [XX]%

**Warnings**:
- [Issue 1]
- [Issue 2]

**Options**:
1. Proceed to `/refine-task [TASK-ID]` and address gaps during refinement
2. Fix gaps now before proceeding
```

#### Score < 75% - Not Ready

**Status**: ❌ **Not Ready**

**Message**:

```plaintext
❌ Task has significant readiness issues.

**Readiness Score**: [XX]%

**Critical Gaps**:
- [Issue 1]
- [Issue 2]
- [Issue 3]

**Recommendations**:
1. Address critical gaps before proceeding
2. OR select alternative task: `/fetch-task [--filters]`
3. OR escalate to human for clarification

**Cannot proceed to implementation until issues are resolved.**
```

### Step 6: Provide Next Steps

**For ready tasks (≥ 75%)**:

```plaintext
**Next Step**: `/refine-task [TASK-ID]`

This will:
- Clarify requirements and acceptance criteria
- Gather technical context
- Create detailed implementation plan
```

**For not-ready tasks (< 75%)**:

```plaintext
**Next Steps**:
1. Fix critical gaps (see above)
2. OR: `/fetch-task` to select a different task
3. OR: `/create-backlog` to refine task definitions
4. OR: Escalate to human for requirement clarification
```

## Output Format

**CRITICAL**: Your response MUST be ONLY a valid JSON object. Do NOT include any markdown formatting, code blocks, explanatory text, or anything else. Output raw JSON only.

**Scenario 1: Fully Ready (100%)**

```json
{
  "readiness_score": 100,
  "status": "ready_for_next_stage",
  "checklist": {
    "task_exists": {"status": "pass", "points": 1.0},
    "not_completed": {"status": "pass", "points": 1.0},
    "not_in_progress": {"status": "pass", "points": 1.0},
    "dependencies_satisfied": {
      "status": "pass",
      "points": 1.0,
      "details": "All 2 dependencies satisfied"
    },
    "requirements_clear": {
      "status": "pass",
      "points": 1.0,
      "details": "Description: 45 words, Criteria: 3 testable"
    },
    "domain_specified": {"status": "pass", "points": 1.0, "domain": "Backend"},
    "effort_estimated": {"status": "pass", "points": 1.0, "effort": "S (2 days)"},
    "prd_requirements_linked": {"status": "pass", "points": 1.0, "requirements": ["FR-001"]}
  },
  "readiness_issues": [],
  "recommendation": {
    "action": "proceed",
    "next_command": "/refine-task BE0001",
    "message": "✅ Task is fully ready for implementation. All criteria met. Proceed to /refine-task BE0001 to create detailed implementation plan."
  }
}
```

**Scenario 2: Mostly Ready with Warnings (88%)**

```json
{
  "readiness_score": 88,
  "status": "ready_with_warnings",
  "checklist": {
    "task_exists": {"status": "pass", "points": 1.0},
    "not_completed": {"status": "pass", "points": 1.0},
    "not_in_progress": {"status": "pass", "points": 1.0},
    "dependencies_satisfied": {
      "status": "warning",
      "points": 0.5,
      "details": "1 dependency in-progress (BE0002)"
    },
    "requirements_clear": {"status": "pass", "points": 1.0},
    "domain_specified": {"status": "pass", "points": 1.0},
    "effort_estimated": {"status": "pass", "points": 1.0},
    "prd_requirements_linked": {
      "status": "warning",
      "points": 0.5,
      "details": "No requirements linked (traceability gap)"
    }
  },
  "readiness_issues": [
    {
      "criterion": "Dependencies Satisfied",
      "status": "warning",
      "issue": "1 dependency (BE0002) is in-progress",
      "severity": "medium",
      "recommendation": "Wait for BE0002 completion or assist with it"
    },
    {
      "criterion": "PRD Requirements Linked",
      "status": "warning",
      "issue": "No requirements linked - traceability gap",
      "severity": "low",
      "recommendation": "Link task to relevant PRD requirements"
    }
  ],
  "recommendation": {
    "action": "proceed_with_caution",
    "next_command": "/refine-task FE0005",
    "message": "⚠️ Task is mostly ready with minor gaps.\n\n**Readiness Score**: 88%\n\n**Warnings**:\n- 1 dependency in-progress (BE0002)\n- No requirements linked (traceability gap)\n\n**Options**:\n1. Proceed to /refine-task FE0005 and address gaps during refinement\n2. Fix gaps now before proceeding"
  }
}
```

**Scenario 3: Not Ready (62%)**

```json
{
  "readiness_score": 62,
  "status": "needs_refinement",
  "checklist": {
    "task_exists": {"status": "pass", "points": 1.0},
    "not_completed": {"status": "pass", "points": 1.0},
    "not_in_progress": {"status": "pass", "points": 1.0},
    "dependencies_satisfied": {
      "status": "fail",
      "points": 0.0,
      "details": "2 hard blockers not started"
    },
    "requirements_clear": {
      "status": "fail",
      "points": 0.0,
      "details": "Description too vague (12 words), no acceptance criteria"
    },
    "domain_specified": {"status": "pass", "points": 1.0},
    "effort_estimated": {"status": "pass", "points": 1.0},
    "prd_requirements_linked": {"status": "pass", "points": 1.0}
  },
  "readiness_issues": [
    {
      "criterion": "Dependencies Satisfied",
      "status": "fail",
      "issue": "2 hard blockers not started (BE0001, BE0003)",
      "severity": "critical",
      "recommendation": "Start with blocker tasks first or select alternative task"
    },
    {
      "criterion": "Requirements Clear",
      "status": "fail",
      "issue": "Description too vague (12 words), no acceptance criteria defined",
      "severity": "high",
      "recommendation": "Expand description and add testable acceptance criteria"
    }
  ],
  "recommendation": {
    "action": "fix_gaps_first",
    "next_command": null,
    "message": "❌ Task has significant readiness issues.\n\n**Readiness Score**: 62%\n\n**Critical Gaps**:\n- 2 hard blockers not started\n- Description too vague\n- No acceptance criteria\n\n**Recommendations**:\n1. Address critical gaps before proceeding\n2. OR select alternative task: /fetch-task [--filters]\n3. OR escalate to human for clarification\n\n**Cannot proceed to implementation until issues are resolved.**",
    "alternatives": [
      {
        "action": "select_alternative",
        "command": "/fetch-task",
        "reason": "Select a task without blockers"
      },
      {
        "action": "refine_backlog",
        "command": "/create-backlog",
        "reason": "Refine task definitions"
      }
    ]
  }
}
```

## Success Criteria

- ✅ All 8 readiness criteria evaluated
- ✅ Readiness score calculated objectively
- ✅ Issues identified with severity levels
- ✅ Clear recommendation provided
- ✅ Next steps documented
- ✅ Quality gate applied correctly

## Rules

**DO**:

- ✅ Be objective - use checklist, not intuition
- ✅ Be specific - "Description too vague (12 words)" not "unclear requirements"
- ✅ Distinguish severity levels (critical vs low)
- ✅ Provide actionable recommendations
- ✅ Consider user context (they chose this task for a reason)

**DON'T**:

- ❌ Don't be overly strict - 75%+ is acceptable
- ❌ Don't block on warnings - let user decide
- ❌ Don't approve tasks < 75% - quality gates exist for a reason
- ❌ Don't forget to check dependency status from previous stage
- ❌ Don't suggest proceeding when critical gaps exist

## Notes

- This is the FINAL validation before proceeding to `/refine-task`
- Dependency validation already happened in `context.check-dependencies`
- Focus on task metadata completeness and clarity
- Be pragmatic - perfect is enemy of good
- Trust the user's judgment on warnings (they may have context we don't)

