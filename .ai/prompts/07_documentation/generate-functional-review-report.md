---
id: documentation.generate-functional-review-report
version: 1.0.0
category: documentation
experimental: true
name: Generate Functional Review Report
description: Synthesize functional validation results into comprehensive, actionable report with go/no-go decision
tags:
  - documentation
  - functional-review
  - reporting
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - review.validate-functional-requirements
inputs:
  - name: completeness_score
    description: Overall completeness score from validation
    type: number
    required: true
  - name: functional_gaps
    description: Identified functional gaps
    type: array
    required: true
  - name: ux_issues
    description: UX and usability issues
    type: array
    required: true
  - name: workflow_validation
    description: Workflow validation results
    type: object
    required: true
  - name: requirements_coverage
    description: Requirements coverage details
    type: object
    required: true
outputs:
  - functional_report
  - go_no_go_decision
  - recommendations
tokens:
  avg: 4500
  max: 9000
  min: 2500
---

# Generate Functional Review Report

## Objective

Synthesize functional validation results into a clear, actionable report with a definitive go/no-go decision based on requirements coverage and user impact.

## Instructions

### Step 1: Generate Executive Summary

Create high-level overview with key metrics.

```markdown
# Functional Review Report

## Executive Summary

**Completeness Score**: [score]/100
**Overall Status**: [APPROVED ✅ | CHANGES REQUESTED ⚠️ | BLOCKED ❌]
**Review Date**: [ISO timestamp]
**Reviewer**: @lead
**Feature**: [Feature name]

**Requirements Coverage**: [X]/[Y] acceptance criteria met ([percentage]%)
**User Workflows**: [X]/[Y] workflows validated
**Critical Issues**: [count]
**High Priority Issues**: [count]

**Key Findings**:
- [1-3 bullet points summarizing main functional gaps or achievements]

**Recommendation**: [One sentence decision with brief justification]
```

**Status Determination**:
- ✅ **APPROVED**: All P0 requirements met, critical workflows pass, completeness ≥90%
- ⚠️ **CHANGES REQUESTED**: Minor gaps, completeness 70-89%, or high-priority issues
- ❌ **BLOCKED**: P0 requirements unmet, critical workflows broken, completeness <70%

### Step 2: Report Critical Functional Issues

For each **CRITICAL** issue:

```markdown
## Critical Functional Issues (Must Fix)

### 🔴 [Issue Title - User Impact Focus]

**Requirement**: [Link to acceptance criterion - e.g., AC-002]
**Severity**: CRITICAL
**Category**: [Functionality | UX | Integration | Edge Case]

**Problem**:
[Clear description from user perspective]

**User Impact**:
[How this affects users - what breaks, what's impossible, business consequence]

**Reproduction Steps**:
1. [Step 1]
2. [Step 2]
3. [Expected vs Actual behavior]

**Current Behavior**:
[What actually happens]

**Expected Behavior**:
[What should happen per requirements]

**Recommendation**:
[Specific fix needed with implementation guidance]

**Effort**: [Low | Medium | High]
**Priority**: Must fix before commit
```

### Step 3: Report High Priority Issues

For **HIGH** severity issues:

```markdown
## High Priority Issues

### 🟠 [Issue Title]

**Requirement**: [Link to criterion]
**Severity**: HIGH
**Category**: [...]

**Problem**: [User-centric description]
**User Impact**: [Significant UX degradation or major feature gap]
**Current vs Expected**: [Gap analysis]
**Recommendation**: [Specific fix]
**Effort**: [Low | Medium | High]
**Priority**: Strongly recommended before commit
```

### Step 4: Report Medium and Low Priority Issues

```markdown
## Medium Priority Issues

### 🟡 [Issue Title]

**Severity**: MEDIUM
**Category**: [...]
**Problem**: [Description]
**User Impact**: [Minor inconvenience or usability issue]
**Recommendation**: [Suggestion]
**Effort**: [Low | Medium | High]
**Priority**: Address soon (suggested)

## Low Priority Enhancements (Optional)

- **[Location]**: [Brief description and suggestion]
- **[Location]**: [Brief description and suggestion]
```

### Step 5: Requirements Validation Matrix

Provide clear status table:

```markdown
## Requirements Validation Matrix

| Acceptance Criterion | Status    | Notes             |
| -------------------- | --------- | ----------------- |
| AC-001: [Description]        | ✅ PASS    | [validation note] |
| AC-002: [Description]        | ❌ FAIL    | [gap description] |
| AC-003: [Description]        | ⚠️ PARTIAL | [what's missing]  |

**Coverage Summary**:
- Total Acceptance Criteria: [N]
- Passed: [X] ([percentage]%)
- Partial: [Y]
- Failed: [Z]
```

### Step 6: User Workflow Validation

Report workflow test results:

```markdown
## User Workflow Validation

### Primary Workflows
1. **[Workflow Name]**: ✅ VALIDATED
   - All steps complete successfully
   - User feedback clear and timely
   - Error handling appropriate

2. **[Workflow Name]**: ❌ ISSUES FOUND
   - **Issue**: [Description with user impact]
   - **Severity**: [HIGH/MEDIUM]
   - **Location**: [file:line]

### Secondary Workflows
[Same format]

### Edge Cases Tested
- ✅ Empty state handling
- ⚠️ Error recovery needs improvement (see HIGH-002)
- ❌ Extreme value handling fails (see CRITICAL-001)
```

### Step 7: UX/Usability Assessment

```markdown
## UX/Usability Assessment

**Overall UX Quality**: [Excellent | Good | Needs Improvement | Poor]

**Strengths**:
- ✅ [Positive UX aspect with specific example]
- ✅ [Good practice observed]

**Issues**:
- ⚠️ [Usability concern with user impact]
- ❌ [Critical UX issue]

**Consistency with Design System**: [Yes | Partial | No]
**Mobile Experience**: [Excellent | Good | Needs Work | Not Tested]
```

### Step 8: Accessibility Compliance (If Checked)

```markdown
## Accessibility Compliance

**WCAG 2.1 AA Status**: [Compliant ✅ | Partial ⚠️ | Non-Compliant ❌]

**Issues Found**:
- [A11y issue with specific guideline reference]
- [Impact on users with disabilities]

**Keyboard Navigation**: [Validated ✅ | Issues Found ❌]
**Screen Reader Compatible**: [Yes ✅ | Issues Found ❌]
```

### Step 9: Integration & Data Validation

```markdown
## Integration & Data Validation

**API Integration**: [validated ✅ | issues found ❌]
**State Management**: [consistent ✅ | inconsistencies found ❌]
**Data Flow**: [correct ✅ | issues found ❌]
**Error Handling**: [robust ✅ | gaps found ❌]

**Issues**:
- [Integration issue with severity and impact]
```

### Step 10: Recommendations Summary

```markdown
## Recommendations Summary

### 🔴 Blocking Issues (Fix Before Commit)
1. **[Issue ID]**: [Specific action item] - Effort: [Low/Med/High]
2. **[Issue ID]**: [Specific action item] - Effort: [Low/Med/High]

**Total blocking issues**: [count]
**Estimated fix time**: [time estimate]

### 🟠 High Priority Improvements (Strongly Recommended)
1. **[Issue ID]**: [Action] - Effort: [Low/Med/High]
2. **[Issue ID]**: [Action] - Effort: [Low/Med/High]

### 🟡 Future Enhancements (Consider for Next Iteration)
1. [Enhancement idea with business value]
2. [Enhancement idea]
```

### Step 11: Final Decision

```markdown
## Final Decision

**Recommendation**: [APPROVE AND PROCEED TO COMMIT | REQUEST CHANGES AND RE-IMPLEMENT | BLOCKED - CRITICAL REQUIREMENTS UNMET]

**Justification**:
[2-3 sentences explaining decision based on requirements coverage, user impact, and workflow validation]

**Acceptance Criteria Met**: [X]/[Y] ([percentage]%)
**Critical Workflows Validated**: [Yes/No]
**User Impact Assessment**: [Positive/Neutral/Negative]

**Next Steps**:
1. [Specific action required]
2. [Specific action required]
3. [Re-review requirements or proceed to commit]

---

**Ready for Production**: [Yes/No]
**Feature Completeness**: [percentage]%
**Approval Conditions** (if applicable):
- [Condition that must be met before approval]
```

## Output Format

```json
{
  "functional_report": "# Functional Review Report\n\n## Executive Summary\n...",
  "go_no_go_decision": {
    "decision": "REQUEST_CHANGES",
    "status": "CHANGES_REQUESTED",
    "completeness_score": 85,
    "requirements_met": 4,
    "requirements_total": 5,
    "critical_issues": 2,
    "high_issues": 3,
    "ready_for_commit": false,
    "justification": "2 critical functional gaps prevent full feature completeness: no email resend option and no graceful error handling for service failures."
  },
  "recommendations": [
    {
      "priority": "critical",
      "issue_id": "FUNC-001",
      "description": "Add resend verification email option",
      "requirement_id": "AC-003",
      "effort": "medium",
      "user_impact": "High - users with expired tokens cannot recover"
    },
    {
      "priority": "critical",
      "issue_id": "FUNC-002",
      "description": "Implement graceful error handling for email service failures",
      "requirement_id": "AC-001",
      "effort": "low",
      "user_impact": "High - users see cryptic 500 errors"
    }
  ],
  "next_steps": [
    "Fix 2 blocking functional gaps",
    "Improve error messaging for user clarity",
    "Add loading indicators for better UX",
    "Re-run /review-functional after fixes"
  ],
  "estimated_fix_time": "2-4 hours"
}
```

## Success Criteria

- ✅ Executive summary provides quick overview
- ✅ All critical functional gaps highlighted
- ✅ Requirements validation matrix clear
- ✅ Workflow validation results documented
- ✅ UX assessment from user perspective
- ✅ Recommendations prioritized by user impact
- ✅ Clear go/no-go decision with justification
- ✅ Next steps actionable

## Rules

**DO**:
- ✅ Frame issues from user perspective
- ✅ Link issues to specific acceptance criteria
- ✅ Provide reproduction steps for functional issues
- ✅ Quantify user impact
- ✅ Balance criticism with achievements
- ✅ Be specific about what needs fixing

**DON'T**:
- ❌ Don't conflate functional issues with code quality
- ❌ Don't approve with unmet P0 requirements
- ❌ Don't use technical jargon for user impact
- ❌ Don't skip reproduction steps
- ❌ Don't overlook workflow failures

**Decision Guidelines**:
- **APPROVE**: ≥90% completeness, all P0 met, critical workflows pass
- **REQUEST CHANGES**: 70-89% completeness, minor P0 gaps, high-priority issues
- **BLOCK**: <70% completeness, major P0 gaps, critical workflows broken

**Tone**: User-centric, constructive, actionable, clear about business impact

