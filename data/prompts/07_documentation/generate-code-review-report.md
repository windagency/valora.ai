---
id: documentation.generate-code-review-report
version: 1.0.0
category: documentation
experimental: true
name: Generate Code Review Report
description: Generate comprehensive, actionable code review report with prioritized recommendations
tags:
  - documentation
  - code-review
  - reporting
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.use-modern-cli-tools
    - review.assess-code-quality
inputs:
  - name: quality_score
    description: Overall quality score from assessment
    type: number
    required: true
  - name: issues_found
    description: Aggregated issues from all validations
    type: object
    required: true
  - name: review_decision
    description: Final decision (APPROVE/REQUEST_CHANGES/BLOCK)
    type: string
    required: true
  - name: blocking_issues
    description: List of blocking issues
    type: array
    required: true
  - name: validation_results
    description: Results from each validation
    type: object
    required: true
outputs:
  - review_report
  - recommendations
  - next_steps
tokens:
  avg: 4000
  max: 8000
  min: 2000
---

# Generate Code Review Report

## Objective

Synthesize code quality assessment results into a comprehensive, actionable review report that developers can use to improve their code.

## Instructions

### Step 1: Generate Executive Summary

Create a high-level overview:

```markdown
# Code Review Report

## Executive Summary

**Quality Score**: [score]/100 ([grade])
**Overall Status**: [APPROVED ✅ | CHANGES REQUESTED ⚠️ | BLOCKED ❌]
**Review Date**: [ISO timestamp]
**Reviewer**: @lead
**Files Reviewed**: [count]

**Key Findings**:

- [1-3 bullet points summarizing main issues or achievements]

**Recommendation**: [One sentence decision with brief justification]
```

**Status Icons**:

- ✅ APPROVED: No blocking issues, ready for next stage
- ⚠️ CHANGES REQUESTED: Issues need addressing
- ❌ BLOCKED: Critical issues prevent merge

### Step 2: Report Critical Issues (Must Fix)

For each **CRITICAL** and **BLOCKING** issue:

```markdown
## Critical Issues (Must Fix)

### 🔴 [Issue Title]

**File**: `[path]:[line]`
**Severity**: CRITICAL
**Category**: [Security | Architecture | Type Safety | ...]

**Problem**:
[Clear, specific description of what's wrong]

**Impact**:
[Why this is critical - what could go wrong in production]

**Recommendation**:

[language] // Current (problematic) [problematic code]
// Recommended [fixed code]
**Effort**: [Low | Medium | High]
**Priority**: Must fix before merge
```

### Step 3: Report High Priority Issues

For **HIGH** severity issues:

```markdown
## High Priority Issues

### 🟠 [Issue Title]

**File**: `[path]:[line]`
**Severity**: HIGH
**Category**: [...]

**Problem**: [Description]
**Impact**: [Why it matters]
**Recommendation**: [Fix with code example]
**Effort**: [Low | Medium | High]
**Priority**: Fix before merge (recommended)
```

### Step 4: Report Medium Priority Issues

For **MEDIUM** severity issues:

```markdown
## Medium Priority Issues

### 🟡 [Issue Title]

**File**: `[path]:[line]`
**Severity**: MEDIUM
**Category**: [...]

**Problem**: [Description]
**Impact**: [Why it matters]
**Recommendation**: [Fix description, code example optional]
**Effort**: [Low | Medium | High]
**Priority**: Address soon (suggested)
```

### Step 5: Report Low Priority Issues (Optional)

For **LOW** severity issues (optional improvements):

```markdown
## Low Priority Issues (Optional Improvements)

- **[File:line]**: [Brief description and suggestion]
- **[File:line]**: [Brief description and suggestion]
```

Keep this section concise. Low priority issues shouldn't distract from important ones.

### Step 6: Highlight Positive Observations

Always include what was done well:

```markdown
## Positive Observations

- ✅ [Well-implemented aspect with specific example]
- ✅ [Good practice observed]
- ✅ [Quality achievement worth noting]
```

**Examples**:

- "Excellent test coverage (92%) for new authentication flow"
- "Clear, comprehensive documentation for API changes"
- "Proper error handling with detailed logging throughout"
- "Consistent adherence to project coding standards"

### Step 7: Provide Quality Metrics

Summarize validation results:

```markdown
## Quality Metrics

| Category        | Status                          | Issues  | Blocking |
| --------------- | ------------------------------- | ------- | -------- |
| Security        | [✅ Pass \| ⚠️ Warn \| ❌ Fail] | [count] | [Yes/No] |
| Architecture    | [status]                        | [count] | [Yes/No] |
| Performance     | [status]                        | [count] | [Yes/No] |
| Maintainability | [status]                        | [count] | [Yes/No] |
| Standards       | [status]                        | [count] | [Yes/No] |
| Type Safety     | [status]                        | [count] | [Yes/No] |

**Overall Assessment**:

- **Code Complexity**: [Low | Moderate | High | Very High]
- **Test Coverage**: [percentage]% ([Excellent | Good | Adequate | Insufficient])
- **Documentation**: [Complete | Adequate | Partial | Missing]
- **Security Posture**: [Strong | Adequate | Needs Improvement | Vulnerable]
- **Maintainability**: [Excellent | Good | Acceptable | Needs Work]
```

### Step 8: Summarize Recommendations

Provide prioritized action plan:

```markdown
## Recommendations Summary

### 🔴 Blocking Issues (Fix Before Merge)

1. **[Issue ID]**: [Action] - [File] - Effort: [Low/Med/High]
2. **[Issue ID]**: [Action] - [File] - Effort: [Low/Med/High]

**Total blocking issues**: [count]
**Estimated fix time**: [time estimate]

### 🟠 Suggested Improvements (Recommended)

1. **[Issue ID]**: [Action] - [File] - Effort: [Low/Med/High]
2. **[Issue ID]**: [Action] - [File] - Effort: [Low/Med/High]

### 🟡 Future Enhancements (Optional)

1. [Technical debt or optimization opportunity]
2. [Refactoring suggestion]
```

### Step 9: Define Next Steps

Provide clear action items:

```markdown
## Next Steps

**Immediate Actions**:

1. [Fix blocking issue 1]
2. [Fix blocking issue 2]
3. [Address high priority concerns]

**Before Re-Review**:

- [ ] All critical issues resolved
- [ ] High priority issues addressed or documented
- [ ] Tests added/updated for changes
- [ ] Documentation updated

**After Fixes**:

- Re-run `/review-code` to validate fixes
- If approved, proceed to `/review-functional`
- If still blocked, escalate architectural concerns

**Estimated Time to Ready**: [time estimate]
```

### Step 10: Add Final Decision

Conclude with clear verdict:

```markdown
## Final Decision

**Recommendation**: [APPROVE AND PROCEED | REQUEST CHANGES | BLOCKED - CRITICAL ISSUES]

**Justification**:
[2-3 sentences explaining the decision clearly]

**Approval Conditions** (if applicable):

- [Condition 1 must be met]
- [Condition 2 must be met]

---

**Review Standards Met**: [Yes/No]
**Ready for Production**: [Yes/No after fixes]
**Ready for Functional Review**: [Yes/No]

**Reviewer Notes**: [Any additional context or guidance]
```

## Output Format

The complete report as markdown string:

```json
{
	"review_report": "# Code Review Report\n\n## Executive Summary\n...",
	"recommendations": [
		{
			"priority": "critical",
			"issue_id": "SEC-001",
			"description": "Fix SQL injection vulnerability",
			"files": ["src/api/users.ts"],
			"effort": "low",
			"action": "Use parameterized queries"
		}
	],
	"next_steps": [
		"Fix 2 blocking security issues",
		"Address N+1 query performance problem",
		"Refactor high-complexity functions",
		"Re-run review after fixes"
	],
	"approval_conditions": ["All critical security vulnerabilities resolved", "Architectural layer violations fixed"],
	"estimated_fix_time": "2-3 hours",
	"ready_for_functional_review": false
}
```

## Success Criteria

- ✅ Executive summary provides quick overview
- ✅ Critical issues clearly highlighted with examples
- ✅ All severity levels addressed appropriately
- ✅ Positive observations included
- ✅ Quality metrics quantified
- ✅ Recommendations prioritized and actionable
- ✅ Next steps clearly defined
- ✅ Final decision justified
- ✅ Report is readable and well-structured

## Rules

**DO**:

- ✅ Use consistent formatting throughout
- ✅ Include specific file:line references
- ✅ Provide code examples for major issues
- ✅ Balance criticism with positive feedback
- ✅ Be constructive, not judgmental
- ✅ Quantify impact where possible
- ✅ Make recommendations actionable

**DON'T**:

- ❌ Overwhelm with too much detail
- ❌ Use jargon without explanation
- ❌ Make vague recommendations
- ❌ Only point out negatives
- ❌ Skip the "why" behind issues
- ❌ Forget to estimate effort

**Tone**:

- Professional but approachable
- Clear and concise
- Specific and actionable
- Constructive and educational

## Report Structure

```
1. Executive Summary (essential overview)
2. Critical Issues (must read)
3. High Priority Issues (important)
4. Medium Priority Issues (good to address)
5. Low Priority Issues (optional, keep brief)
6. Positive Observations (morale boost)
7. Quality Metrics (quantified assessment)
8. Recommendations Summary (action plan)
9. Next Steps (clear path forward)
10. Final Decision (verdict)
```

## Notes

- Report should be **scannable**: busy developers should get key info in 30 seconds
- **Critical issues** should be at the top with clear visibility
- **Code examples** should show both problem and solution
- **Effort estimates** help developers prioritize work
- **Positive observations** make reviews feel collaborative, not adversarial
- Report is **final artifact** saved to `knowledge-base/reviews/` for reference
