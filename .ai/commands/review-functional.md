---
name: review-functional
description: Validate feature completeness, acceptance criteria, user experience, and functional requirements alignment with PRD/task specifications
experimental: true
argument-hint: '<scope> [--severity=critical|high|medium|low] [--check-a11y=true|false]'
allowed-tools:
  - codebase_search
  - read_file
  - grep
  - list_dir
  - glob_file_search
  - run_terminal_cmd
model: claude-sonnet-4.5
agent: lead
prompts:
  pipeline:
    - stage: context
      prompt: context.analyze-functional-scope
      required: true
      inputs:
        scope: $ARG_1
      outputs:
        - feature_scope
        - requirements_list
        - acceptance_criteria
        - user_workflows
        - integration_points
    - stage: review
      prompt: review.validate-functional-requirements
      required: true
      inputs:
        scope: $ARG_1
        severity: $ARG_severity
        check_a11y: $ARG_check_a11y
        requirements: $STAGE_context.requirements_list
      outputs:
        - completeness_score
        - requirements_coverage
        - ux_issues
        - functional_gaps
        - workflow_validation
    - stage: documentation
      prompt: documentation.generate-functional-review-report
      required: true
      inputs:
        completeness_score: $STAGE_review.completeness_score
        functional_gaps: $STAGE_review.functional_gaps
        ux_issues: $STAGE_review.ux_issues
        workflow_validation: $STAGE_review.workflow_validation
        requirements_coverage: $STAGE_review.requirements_coverage
      outputs:
        - functional_report
        - go_no_go_decision
        - recommendations
  merge_strategy: sequential
  cache_strategy: none
  retry_policy:
    max_attempts: 1
    backoff_ms: 0
    retry_on: []
---

# Prompt Orchestration

## Role

Use the [agent] profile

## Goal

Validate that the implemented feature fully satisfies functional requirements, acceptance criteria, and user experience expectations. Ensure feature completeness, proper user workflows, edge case handling, accessibility compliance, and alignment with product specifications before proceeding to commit and PR creation.

## Rules

### Functional Review Focus

**What This Review Validates**:

- ✅ Requirements coverage (all acceptance criteria met)
- ✅ User workflows (end-to-end task completion)
- ✅ UX and usability (intuitive, consistent, user-friendly)
- ✅ Edge cases and error handling (graceful degradation)
- ✅ Integration correctness (data flow, API calls, state management)
- ✅ Accessibility (WCAG 2.1 AA if applicable)

**Severity Classification**:

- **CRITICAL**: Core functionality broken, P0 requirements unmet, complete workflow failure
- **HIGH**: Major feature gaps, significant UX degradation, broken user workflows
- **MEDIUM**: Minor feature gaps, usability issues, inconsistent behavior
- **LOW**: Polish items, nice-to-have improvements, minor enhancements

**Key Principles**:

- Always reference specific acceptance criteria
- Frame issues from user perspective with user impact
- Include reproduction steps for functional issues
- Never approve with unmet P0 requirements
- Never conflate functional issues with code quality (use `/review-code` for that)

## Context

```plaintext
$ARGUMENTS
```

## Process Steps

The command orchestrates a pipeline of prompts to conduct comprehensive functional validation. Each stage delegates to specialized prompts:

### Stage 1: Context - Analyze Functional Scope

**Prompt**: `review.analyze-functional-scope`

Identifies feature scope, extracts requirements and acceptance criteria from PRD/task, maps user workflows, and defines validation boundaries.

### Stage 2: Review - Functional Validation

**Prompt**: `review.functional-validation`

Systematically validates implementation against requirements, tests user workflows, assesses UX, verifies edge cases, and checks integration points. Optionally includes accessibility validation.

### Stage 3: Documentation - Generate Report

**Prompt**: `review.generate-functional-report`

Synthesizes validation results into comprehensive report with go/no-go decision, prioritized recommendations, and clear next steps.

## Success Criteria

- ✅ All acceptance criteria validated against implementation
- ✅ User workflows tested end-to-end with clear pass/fail status
- ✅ UX assessed from user perspective with actionable feedback
- ✅ Requirements coverage calculated (percentage of criteria met)
- ✅ Clear go/no-go decision (APPROVE/REQUEST CHANGES/BLOCK)
- ✅ Prioritized recommendations with user impact and effort estimates

## Integration Points

**Prerequisites**:

- `/review-code` must pass (code quality, security, architecture validated)
- All tests passing
- No critical linter errors

**Outcomes**:

- **APPROVED**: Proceed to `/commit`
- **CHANGES REQUESTED**: Return to `/implement` with specific functional gaps
- **BLOCKED**: Critical requirements unmet, major re-implementation needed

**Next Command**: `/commit` (if approved) or `/implement` (if changes needed)

## Command Output Summary

Print the following summary at command completion:

**For APPROVED:**

```markdown
## ✅ Functional Review: APPROVED

**Completeness Score**: [XX]%
**Decision**: APPROVED - All acceptance criteria met

### Requirements Coverage
| Requirement | Status |
|-------------|--------|
| [REQ-001] [Description] | ✅ Met |
| [REQ-002] [Description] | ✅ Met |
| [REQ-003] [Description] | ✅ Met |

### User Workflows Validated
- ✅ [Primary user flow]
- ✅ [Secondary user flow]
- ✅ [Edge cases handled]

### Next Step
→ `/commit` to create atomic commit(s)
```

**For CHANGES REQUESTED:**

```markdown
## 🔄 Functional Review: CHANGES REQUESTED

**Completeness Score**: [XX]%
**Decision**: CHANGES REQUESTED - Functional gaps identified

### Requirements Coverage
| Requirement | Status |
|-------------|--------|
| [REQ-001] [Description] | ✅ Met |
| [REQ-002] [Description] | ❌ Not Met |
| [REQ-003] [Description] | ⚠️ Partial |

### Functional Gaps
1. **[Gap description]**
   - Expected: [What should happen]
   - Actual: [What happens now]

### Next Step
→ `/implement` to address functional gaps
```

**For BLOCKED:**

```markdown
## ❌ Functional Review: BLOCKED

**Completeness Score**: [XX]%
**Decision**: BLOCKED - Critical requirements unmet

### Critical Issues
1. **[Requirement]**: Not implemented
   - Impact: [Why this is critical]

### Next Step
→ Major re-implementation required
→ Consider revisiting `/plan` if scope issues
```
