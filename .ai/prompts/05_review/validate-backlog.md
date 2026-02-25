---
id: review.validate-backlog
version: 1.0.0
category: review
experimental: true
name: Validate Backlog
description: Validate backlog completeness, quality, and readiness for execution
tags:
  - validation
  - quality-assurance
  - backlog-review
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.use-modern-cli-tools
    - plan.decompose-tasks
inputs:
  - name: tasks
    description: Complete task list from decompose-tasks stage
    type: array
    required: true
  - name: prd_requirements
    description: Original requirements list from PRD
    type: array
    required: true
outputs:
  - validation_results
  - coverage_score
  - gaps_identified
tokens:
  avg: 6000
  max: 12000
  min: 3000
---

# Validate Backlog

## Objective

Ensure the generated backlog is complete, high-quality, and ready for task execution by validating coverage, consistency, and feasibility.

## CRITICAL: Output Format Requirement

**You MUST output ONLY valid JSON. Do NOT output markdown, do NOT wrap in code blocks, do NOT add any text before or after the JSON.**

Your response must be a single JSON object matching the schema defined in the "Output Format" section at the end of this prompt.

## Instructions

### Step 1: Validate Requirement Coverage

Check that all PRD requirements are covered by tasks:

**For each requirement in `prd_requirements`**:

1. **Find linked tasks**:
   - Search `tasks` for items where `requirements` field contains requirement ID
   - Example: FR-001 should appear in `requirements` array of one or more tasks

2. **Check coverage by priority**:
   - **P0 requirements**: MUST have ≥ 1 task (critical)
   - **P1 requirements**: SHOULD have ≥ 1 task (important)
   - **P2 requirements**: MAY have 0 tasks (acceptable to defer)

3. **Calculate coverage**:

```
P0 Coverage = (P0 Requirements with Tasks / Total P0 Requirements) × 100%
P1 Coverage = (P1 Requirements with Tasks / Total P1 Requirements) × 100%
P2 Coverage = (P2 Requirements with Tasks / Total P2 Requirements) × 100%

Total Coverage = (All Requirements with Tasks / Total Requirements) × 100%
```

**Coverage quality thresholds**:

- **≥ 95%**: Excellent - production-ready backlog
- **85-94%**: Good - minor gaps acceptable, proceed with warnings
- **70-84%**: Fair - significant gaps, review and consider additions
- **< 70%**: Poor - insufficient coverage, do not proceed

**Flag uncovered requirements**:

```json
{
  "uncovered_requirements": [
    {
      "id": "FR-007",
      "title": "Export data to CSV",
      "priority": "P1",
      "reason": "No task found covering this requirement"
    }
  ]
}
```

### Step 2: Validate Task Completeness

Check each task for required fields and quality:

**Required fields checklist** (per task):

- [ ] `id` - Present and follows naming convention ([DOMAIN][XXXX])
- [ ] `title` - Clear, action-oriented, < 80 characters
- [ ] `domain` - Valid domain (Frontend/Backend/Data/Infrastructure/Testing/Documentation)
- [ ] `priority` - Valid priority (P0/P1/P2)
- [ ] `effort` - Valid effort (XS/S/M/L/XL) and ≤ 5 days
- [ ] `phase` - Assigned to execution phase (0-5)
- [ ] `requirements` - Links to ≥ 1 PRD requirement
- [ ] `dependencies` - Present (can be empty array)
- [ ] `description` - Clear and actionable (≥ 20 words)
- [ ] `acceptance_criteria` - ≥ 1 criterion, testable
- [ ] `technical_notes` - Implementation guidance provided
- [ ] `testing_requirements` - Test types specified
- [ ] `documentation` - Documentation needs listed

**Quality checks**:

1. **Title quality**:
   - Starts with action verb (Create, Implement, Add, Configure, etc.)
   - Specific and descriptive
   - Not vague ("Improve performance" ❌, "Optimize API queries to achieve <200ms response" ✅)

2. **Acceptance criteria quality**:
   - Uses Given-When-Then format or clear checklist
   - Each criterion is testable (can write automated or manual test)
   - Covers happy path + edge cases
   - At least 2-3 criteria per task

3. **Description quality**:
   - Explains WHAT and WHY
   - Sufficient detail for implementation
   - Not duplicating title verbatim

4. **Dependencies validity**:
   - Referenced task IDs exist in task list
   - No circular dependencies
   - Logical prerequisite relationships

**Flag incomplete tasks**:

```json
{
  "incomplete_tasks": [
    {
      "id": "FE003",
      "issues": [
        "Missing acceptance_criteria",
        "Description too vague",
        "No testing_requirements specified"
      ]
    }
  ]
}
```

### Step 3: Validate Dependencies

Check dependency graph for consistency and cycles:

**Dependency validation**:

1. **Reference validation**:
   - For each task's `dependencies` array
   - Check that each dependency task ID exists
   - Flag missing references

2. **Cycle detection**:
   - Build directed graph from dependencies
   - Run topological sort or DFS-based cycle detection
   - If cycle found, identify cycle path and flag

3. **Phase consistency**:
   - Task in Phase N should not depend on task in Phase N+1 (future)
   - Dependencies should be same phase or earlier phase
   - Flag "future dependencies" as errors

4. **Priority consistency**:
   - P0 task should not depend on P2 task (low priority blocking high)
   - Warn if high priority task depends on lower priority

**Dependency issues to flag**:

```json
{
  "dependency_issues": [
    {
      "type": "missing_reference",
      "task_id": "FE003",
      "dependency": "BE099",
      "message": "Task BE099 referenced but not found in task list"
    },
    {
      "type": "circular_dependency",
      "cycle_path": ["BE001", "BE002", "BE003", "BE001"],
      "message": "Circular dependency detected"
    },
    {
      "type": "future_dependency",
      "task_id": "BE002",
      "task_phase": 1,
      "dependency": "FE005",
      "dependency_phase": 3,
      "message": "Task depends on future phase task"
    },
    {
      "type": "priority_mismatch",
      "task_id": "BE001",
      "task_priority": "P0",
      "dependency": "DOC003",
      "dependency_priority": "P2",
      "message": "High priority task depends on low priority task"
    }
  ]
}
```

### Step 4: Validate Effort Estimates

Check effort estimates for consistency and realism:

**Effort validation**:

1. **Range check**:
   - No task should be > 5 days (L effort max)
   - Flag any XL tasks as "must decompose"

2. **Complexity alignment**:
   - Simple requirements should have XS/S tasks
   - Complex requirements should have S/M/L tasks
   - Very complex requirements should have multiple M/L tasks

3. **Domain distribution**:
   - Frontend tasks: typically S/M effort
   - Backend tasks: typically S/M effort
   - Data tasks: typically XS/S effort (migrations)
   - Infrastructure tasks: typically M/L effort (setup complexity)
   - Testing tasks: typically S/M effort
   - Documentation tasks: typically XS/S effort

4. **Total effort sanity check**:
   - Calculate total effort days
   - Compare to typical team velocity
   - Warn if timeline seems unrealistic

**Effort issues to flag**:

```json
{
  "effort_issues": [
    {
      "task_id": "BE005",
      "effort": "L",
      "effort_days": 8,
      "issue": "Task exceeds 5-day threshold, consider decomposition"
    },
    {
      "task_id": "INFRA002",
      "effort": "XS",
      "effort_days": 0.5,
      "issue": "Infrastructure task seems under-estimated"
    }
  ],
  "total_effort": {
    "total_days": 127,
    "estimated_weeks": 18,
    "warning": "Estimate exceeds typical 12-week project, consider descoping P2 items"
  }
}
```

### Step 5: Validate Prioritization Logic

Check priority assignments are consistent:

**Priority validation**:

1. **Foundation tasks are P0**:
   - Phase 0 tasks should be P0 (infrastructure, core setup)
   - Flag if Phase 0 has P1/P2 tasks

2. **Dependency priority**:
   - If Task A depends on Task B, priority(A) ≤ priority(B)
   - Example: P0 task can depend on P0, but not P1
   - Warn if violated

3. **Requirement priority flow**:
   - Tasks linked to P0 requirements should be P0
   - Tasks linked to P1 requirements should be P0 or P1
   - Tasks linked to P2 requirements can be any priority

4. **Priority distribution**:
   - P0: 30-50% of tasks (critical path)
   - P1: 30-50% of tasks (important additions)
   - P2: 10-30% of tasks (nice-to-haves)
   - Warn if distribution seems off

**Priority issues to flag**:

```json
{
  "priority_issues": [
    {
      "task_id": "INFRA001",
      "phase": 0,
      "priority": "P1",
      "issue": "Foundation task should be P0"
    },
    {
      "task_id": "FE003",
      "priority": "P0",
      "dependency": "DOC002",
      "dependency_priority": "P2",
      "issue": "P0 task depends on P2 task"
    }
  ],
  "priority_distribution": {
    "p0": {"count": 42, "percentage": 60},
    "p1": {"count": 20, "percentage": 29},
    "p2": {"count": 8, "percentage": 11},
    "warning": "P0 tasks exceed 50%, consider if all are truly critical"
  }
}
```

### Step 6: Validate Phases

Check execution phases are logical and well-structured:

**Phase validation**:

1. **Phase progression**:
   - Phase 0: Foundation (infra, dev env, core data models)
   - Phase 1-2: Core implementation (backend, frontend)
   - Phase 3: Integration
   - Phase 4+: Quality, polish, production readiness
   - Flag tasks in wrong phases

2. **Phase balance**:
   - No phase should have >20 tasks (too large, split it)
   - No phase should have <3 tasks (too small, merge it)
   - Phases should have similar effort (avoid one massive phase)

3. **Phase dependencies**:
   - Tasks in phase N should not depend on phase N+1
   - Already covered in dependency validation

**Phase issues to flag**:

```json
{
  "phase_issues": [
    {
      "phase": 3,
      "task_count": 28,
      "issue": "Phase has too many tasks (>20), consider splitting"
    },
    {
      "phase": 5,
      "task_count": 2,
      "issue": "Phase has too few tasks (<3), consider merging with adjacent phase"
    },
    {
      "task_id": "DOC001",
      "phase": 0,
      "domain": "Documentation",
      "issue": "Documentation task in Foundation phase seems misplaced"
    }
  ]
}
```

### Step 7: Calculate Coverage Score

Compute final coverage score:

**Coverage score formula**:

```
Coverage Score = (
  (P0 Coverage × 0.5) +
  (P1 Coverage × 0.3) +
  (Task Quality Score × 0.15) +
  (Dependency Validity × 0.05)
) × 100%

Where:
- P0 Coverage = P0 requirements with tasks / Total P0 requirements
- P1 Coverage = P1 requirements with tasks / Total P1 requirements
- Task Quality Score = Tasks with all required fields / Total tasks
- Dependency Validity = 1.0 if no dependency errors, else 0.0
```

**Quality gates**:

- **≥ 95%**: ✅ Production-ready backlog, proceed to execution
- **85-94%**: ⚠️ Good backlog with minor gaps, proceed with noted warnings
- **70-84%**: ⚠️ Fair backlog with significant gaps, review and fix before proceeding
- **< 70%**: ❌ Insufficient backlog, do not proceed, fix gaps first

### Step 8: Generate Validation Report

Compile comprehensive validation report:

**Report structure**:

1. **Executive Summary**:
   - Coverage score
   - Overall quality assessment
   - Go/No-go recommendation

2. **Coverage Analysis**:
   - Requirements coverage by priority
   - Uncovered requirements list
   - Orphaned tasks (no requirement link)

3. **Task Quality Issues**:
   - Incomplete tasks
   - Quality problems
   - Effort estimate warnings

4. **Dependency Issues**:
   - Missing references
   - Circular dependencies
   - Phase/priority mismatches

5. **Priority & Phase Issues**:
   - Priority distribution
   - Phase balance
   - Misclassified tasks

6. **Recommendations**:
   - Critical fixes required
   - Suggested improvements
   - Optional enhancements

## Output Format

```json
{
  "validation_results": {
    "overall_status": "pass_with_warnings",
    "coverage_score": 92,
    "quality_assessment": "Good backlog with minor gaps. Recommend addressing 3 critical issues before proceeding.",
    "recommendation": "Proceed to task execution after fixing critical issues.",
    "timestamp": "2025-11-13T14:30:22Z"
  },
  "coverage_score": 92,
  "coverage_breakdown": {
    "total_coverage": 92,
    "p0_coverage": 100,
    "p1_coverage": 86,
    "p2_coverage": 75,
    "task_quality_score": 95,
    "dependency_validity": 100
  },
  "coverage_analysis": {
    "total_requirements": 23,
    "covered_requirements": 21,
    "uncovered_requirements": 2,
    "requirements_by_priority": {
      "p0": {"total": 14, "covered": 14, "coverage": 100},
      "p1": {"total": 7, "covered": 6, "coverage": 86},
      "p2": {"total": 2, "covered": 1, "coverage": 50}
    },
    "orphaned_tasks": []
  },
  "gaps_identified": {
    "uncovered_requirements": [
      {
        "id": "FR-012",
        "title": "Export data to CSV",
        "priority": "P1",
        "severity": "medium",
        "recommendation": "Add task to Phase 3 for CSV export feature"
      }
    ],
    "incomplete_tasks": [
      {
        "id": "FE003",
        "issues": [
          "Missing acceptance_criteria",
          "Description too vague"
        ],
        "severity": "high",
        "recommendation": "Add detailed acceptance criteria and expand description"
      }
    ],
    "dependency_issues": [
      {
        "type": "priority_mismatch",
        "task_id": "BE001",
        "task_priority": "P0",
        "dependency": "DOC003",
        "dependency_priority": "P2",
        "severity": "low",
        "recommendation": "Consider raising DOC003 priority or reviewing BE001 dependency"
      }
    ],
    "effort_issues": [
      {
        "task_id": "BE005",
        "effort": "L",
        "effort_days": 8,
        "severity": "high",
        "recommendation": "Decompose BE005 into 2-3 smaller tasks (target 3-4 days each)"
      }
    ],
    "priority_issues": [],
    "phase_issues": []
  },
  "statistics": {
    "total_tasks": 42,
    "tasks_by_priority": {
      "p0": 18,
      "p1": 18,
      "p2": 6
    },
    "tasks_by_domain": {
      "frontend": 12,
      "backend": 15,
      "data": 5,
      "infrastructure": 4,
      "testing": 4,
      "documentation": 2
    },
    "tasks_by_phase": {
      "phase_0": 5,
      "phase_1": 8,
      "phase_2": 10,
      "phase_3": 12,
      "phase_4": 7
    },
    "total_estimated_effort_days": 87,
    "critical_path_days": 52,
    "estimated_timeline_weeks": 12
  },
  "critical_issues": [
    {
      "severity": "high",
      "category": "task_completeness",
      "description": "Task FE003 missing acceptance criteria",
      "action_required": "Add detailed acceptance criteria before task execution"
    },
    {
      "severity": "high",
      "category": "effort_estimate",
      "description": "Task BE005 exceeds 5-day threshold (8 days)",
      "action_required": "Decompose into smaller subtasks"
    }
  ],
  "warnings": [
    {
      "severity": "medium",
      "category": "coverage",
      "description": "FR-012 (P1) has no corresponding tasks",
      "action_recommended": "Add task for CSV export feature or defer to P2"
    }
  ],
  "recommendations": [
    {
      "priority": "high",
      "recommendation": "Fix 2 critical issues: FE003 acceptance criteria, BE005 decomposition"
    },
    {
      "priority": "medium",
      "recommendation": "Address FR-012 coverage gap (P1 requirement)"
    },
    {
      "priority": "low",
      "recommendation": "Consider reviewing priority distribution (43% P0 may be high)"
    }
  ]
}
```

## Success Criteria

- ✅ All requirements coverage validated
- ✅ Task completeness checked
- ✅ Dependencies validated (no cycles, valid references)
- ✅ Effort estimates reviewed
- ✅ Priorities validated for consistency
- ✅ Phases validated for logic
- ✅ Coverage score calculated
- ✅ Gaps identified and documented
- ✅ Clear recommendation provided (proceed / fix first / insufficient)

## Quality Gates

**PASS** (proceed to execution):
- Coverage score ≥ 85%
- P0 coverage = 100%
- No circular dependencies
- No critical issues

**PASS WITH WARNINGS** (proceed with caution):
- Coverage score 70-84%
- P0 coverage ≥ 95%
- Minor issues documented
- Warnings noted for user

**FAIL** (do not proceed):
- Coverage score < 70%
- P0 coverage < 95%
- Circular dependencies exist
- Multiple critical issues unresolved

## Notes

- This is a VALIDATION stage, not a fix stage
- Report issues clearly but don't attempt auto-fixes
- Provide actionable recommendations
- Balance thoroughness with pragmatism (perfect is enemy of good)
- Focus on blocking issues (P0 coverage, circular deps) over nice-to-haves

## REMINDER: Output Requirements

**Output ONLY the JSON object. No markdown, no code blocks, no explanatory text. Start directly with `{` and end with `}`.**

