---
id: review.synthesize-plan-assessment
version: 1.0.0
category: review
experimental: true
name: Synthesize Plan Assessment
description: Combine all validation results into overall confidence score and go/no-go decision
tags:
  - plan-review
  - synthesis
  - decision
  - assessment
model_requirements:
  min_context: 128000
  recommended:
    - gpt-5-thinking-high
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.load-plan-context
    - review.validate-completeness
    - review.validate-technical-feasibility
    - review.validate-risk-coverage
    - review.validate-step-quality
    - review.validate-test-strategy
inputs:
  - name: completeness_score
    description: Score from validate-plan-completeness
    type: number
    required: true
    validation:
      min: 0
      max: 10
  - name: feasibility_score
    description: Score from validate-technical-feasibility
    type: number
    required: true
    validation:
      min: 0
      max: 10
  - name: risk_coverage_score
    description: Score from validate-risk-coverage
    type: number
    required: true
    validation:
      min: 0
      max: 10
  - name: step_quality_score
    description: Score from validate-step-quality
    type: number
    required: true
    validation:
      min: 0
      max: 10
  - name: test_coverage_score
    description: Score from validate-test-strategy
    type: number
    required: true
    validation:
      min: 0
      max: 10
  - name: all_gaps
    description: Combined gaps from all validation stages
    type: array
    required: true
  - name: all_concerns
    description: Combined concerns from all validation stages
    type: array
    required: true
outputs:
  - overall_confidence
  - go_no_go_decision
  - improvement_recommendations
  - critical_issues
tokens:
  avg: 3000
  max: 6000
  min: 2000
---

# Synthesize Plan Assessment

## Objective

Combine all validation results to calculate overall confidence, make a clear go/no-go decision, and provide actionable recommendations.

## Context

You have scores and findings from all validation stages. Your role is to synthesize these into a decisive assessment.

## Decision Framework

### Overall Confidence Score

```plaintext
Overall Confidence = (
  completeness_score × 0.20 +
  feasibility_score × 0.25 +
  risk_coverage_score × 0.20 +
  step_quality_score × 0.20 +
  test_coverage_score × 0.15
)

Result: 0.0 - 10.0
```

**Dimension Weights**:
- Completeness: 20% (all sections present)
- Feasibility: 25% (technically implementable)
- Risk Coverage: 20% (risks identified and mitigated)
- Step Quality: 20% (steps are actionable)
- Test Strategy: 15% (adequate testing planned)

### Confidence Ranges

```plaintext
9.0-10.0 → EXCELLENT - Proceed with high confidence
7.5-8.9  → GOOD - Proceed with normal confidence
6.0-7.4  → ACCEPTABLE - Proceed with caution
4.0-5.9  → NEEDS WORK - Revise plan before proceeding
0.0-3.9  → INADEQUATE - Major revision required
```

### Go/No-Go Decision

```plaintext
Decision Logic:

IF overall_confidence >= threshold (default 7.0):
  IF no critical blockers:
    → GO (proceed to implementation)
  ELSE:
    → NO-GO (critical blockers must be addressed)
ELSE:
  → NO-GO (score below threshold)

Special Cases:
- Strict mode: threshold = 8.0
- Critical blocker present: automatic NO-GO (regardless of score)
- Simple task (complexity < 4) with score 6.5-7.0: May GO with warnings
```

## Instructions

### Step 0: Early Exit Assessment (Optimization)

**Purpose**: Reduce review time by skipping secondary iterations when confidence is high.

Check if early exit conditions are met:

```json
{
  "early_exit_check": {
    "enabled": true,
    "initial_confidence": null,
    "threshold": 8.5,
    "conditions": {
      "high_confidence": "overall_confidence >= 8.5",
      "no_critical_risks": "critical_blockers === 0",
      "all_dimensions_passing": "all dimension scores >= 7.0"
    },
    "can_skip_iteration": false
  }
}
```

**Decision Logic**:
```plaintext
IF overall_confidence >= 8.5 AND
   critical_blockers === 0 AND
   all_dimension_scores >= 7.0:
   → SKIP secondary review iterations
   → IMMEDIATE GO decision
   → Save 10-15 minutes

ELSE:
   → Continue with full review synthesis
```

**Time Savings**:
- Normal review: ~14 min (full synthesis + iterations)
- Early exit: ~3 min (quick validation only)
- Savings: 10-15 min per review (when conditions met)

**When to Use**:
- Plan quality is excellent across all dimensions
- No major concerns or blockers
- Low-risk, well-understood implementations

**Output for Early Exit**:
```json
{
  "early_exit_triggered": true,
  "decision": "GO",
  "overall_confidence": 8.7,
  "rationale": "Excellent plan quality across all dimensions. No critical issues identified. Proceeding directly to implementation.",
  "skipped_stages": ["detailed_synthesis", "iterative_review"],
  "time_saved_minutes": 12
}
```

### Step 1: Calculate Overall Confidence

Apply weighted formula:

```json
{
  "dimension_scores": {
    "completeness": {
      "score": 7.8,
      "weight": 0.20,
      "weighted_score": 1.56,
      "status": "good"
    },
    "feasibility": {
      "score": 7.5,
      "weight": 0.25,
      "weighted_score": 1.875,
      "status": "good"
    },
    "risk_coverage": {
      "score": 7.2,
      "weight": 0.20,
      "weighted_score": 1.44,
      "status": "acceptable"
    },
    "step_quality": {
      "score": 7.3,
      "weight": 0.20,
      "weighted_score": 1.46,
      "status": "acceptable"
    },
    "test_strategy": {
      "score": 7.8,
      "weight": 0.15,
      "weighted_score": 1.17,
      "status": "good"
    }
  },
  "overall_confidence": 7.5,
  "confidence_level": "good"
}
```

### Step 2: Aggregate Issues

Consolidate all gaps and concerns:

#### Critical Issues (Must Fix for GO)

```json
{
  "critical_issues": [
    {
      "issue_id": "CRIT-001",
      "source": "feasibility",
      "category": "blocker",
      "description": "Required SendGrid API key not configured",
      "impact": "Cannot send verification emails",
      "fix": "Configure SENDGRID_API_KEY in environment variables"
    },
    {
      "issue_id": "CRIT-002",
      "source": "risk_coverage",
      "category": "high_severity_unmitigated",
      "description": "Data loss risk during migration has no backup plan",
      "impact": "Risk of data loss during deployment",
      "fix": "Add database backup step before migration"
    }
  ]
}
```

#### Major Concerns (Should Fix)

```json
{
  "major_concerns": [
    {
      "concern_id": "MAJ-001",
      "source": "step_quality",
      "description": "Steps 5, 8, and 11 lack file references",
      "impact": "Reduced actionability for implementer",
      "priority": "high"
    },
    {
      "concern_id": "MAJ-002",
      "source": "test_strategy",
      "description": "No E2E tests planned for user-facing feature",
      "impact": "Cannot verify complete user flow",
      "priority": "high"
    }
  ]
}
```

#### Minor Issues (Nice to Fix)

```json
{
  "minor_issues": [
    {
      "issue_id": "MIN-001",
      "source": "completeness",
      "description": "Effort estimate lacks key assumptions",
      "impact": "Unclear what's included in time estimate",
      "priority": "low"
    }
  ]
}
```

### Step 3: Identify Critical Blockers

Check for showstoppers:

**Critical Blocker Types**:
1. **Technical impossibility** - Proposed approach cannot work
2. **Missing critical dependency** - Required tool/service doesn't exist
3. **Architectural violation** - Contradicts core constraints
4. **Data loss risk unmitigated** - High risk without recovery plan
5. **Security vulnerability unaddressed** - Critical security issue
6. **Breaking change without migration** - Will break production

**If any critical blocker exists**:
```json
{
  "has_critical_blockers": true,
  "blocker_count": 1,
  "decision": "NO-GO",
  "rationale": "Cannot proceed until critical blockers are resolved"
}
```

### Step 4: Make Go/No-Go Decision

Apply decision logic:

#### Scenario 1: GO Decision

```json
{
  "decision": "GO",
  "overall_confidence": 8.2,
  "threshold": 7.0,
  "critical_blockers": 0,
  "rationale": "Plan meets quality threshold with no critical blockers. All dimensions scored good or better. Ready to proceed to implementation.",
  "implementation_mode": "standard",
  "next_command": "/implement"
}
```

#### Scenario 2: NO-GO Due to Score

```json
{
  "decision": "NO-GO",
  "overall_confidence": 6.3,
  "threshold": 7.0,
  "critical_blockers": 0,
  "rationale": "Plan score below threshold. Multiple dimensions need improvement before proceeding. Risk coverage and step quality require attention.",
  "revision_needed": "moderate",
  "next_command": "/plan (incorporate feedback)"
}
```

#### Scenario 3: NO-GO Due to Blockers

```json
{
  "decision": "NO-GO",
  "overall_confidence": 7.8,
  "threshold": 7.0,
  "critical_blockers": 2,
  "rationale": "Despite good overall score, critical blockers prevent proceeding. Must address SendGrid configuration and data backup strategy.",
  "revision_needed": "minimal",
  "next_command": "Address blockers, then re-review"
}
```

#### Scenario 4: Conditional GO (Edge Case)

```json
{
  "decision": "CONDITIONAL_GO",
  "overall_confidence": 6.8,
  "threshold": 7.0,
  "critical_blockers": 0,
  "rationale": "Score slightly below threshold, but task is simple (complexity 3). Can proceed with caution and close monitoring.",
  "conditions": [
    "Monitor implementation closely",
    "Address step quality issues during implementation",
    "Add E2E tests before merging"
  ],
  "implementation_mode": "step-by-step",
  "next_command": "/implement step-by-step"
}
```

### Step 5: Prioritize Recommendations

Organize improvements by priority:

```json
{
  "improvement_recommendations": {
    "critical": [
      {
        "recommendation": "Configure SendGrid API key",
        "reason": "Blocks email functionality",
        "effort": "5 minutes",
        "urgency": "immediate"
      },
      {
        "recommendation": "Add database backup step to rollback strategy",
        "reason": "Prevents data loss risk",
        "effort": "30 minutes",
        "urgency": "immediate"
      }
    ],
    "important": [
      {
        "recommendation": "Add file references to Steps 5, 8, and 11",
        "reason": "Improves actionability",
        "effort": "15 minutes",
        "urgency": "before_implementation"
      },
      {
        "recommendation": "Add E2E test suite to testing strategy",
        "reason": "Verifies complete user flow",
        "effort": "1 hour",
        "urgency": "before_merging"
      }
    ],
    "nice_to_have": [
      {
        "recommendation": "Add key assumptions to effort estimate",
        "reason": "Improves time accuracy",
        "effort": "10 minutes",
        "urgency": "optional"
      }
    ]
  }
}
```

### Step 6: Generate Confidence Rationale

Explain the decision:

```plaintext
**Decision Rationale**

Overall Confidence: 7.5/10.0 (GOOD)

The plan demonstrates good quality across all dimensions with no critical blockers. 

**Strengths**:
✓ Comprehensive completeness (7.8/10) - All required sections present
✓ Solid feasibility (7.5/10) - Technical approach is sound
✓ Good test strategy (7.8/10) - Adequate coverage planned

**Areas of Concern**:
⚠ Risk coverage (7.2/10) - Some high-severity risks need better mitigation
⚠ Step quality (7.3/10) - Several steps lack file references

**Decision: GO**

The plan is ready for implementation. Address the important recommendations during implementation, particularly adding file references to vague steps and improving risk mitigations. Consider adding E2E tests before merging to production.

**Confidence Level**: Medium-High
The plan is solid but would benefit from the improvements listed. Proceed with normal caution.
```

### Step 7: Define Next Steps

Provide clear guidance:

#### If GO:

```json
{
  "next_steps": {
    "immediate": [
      "Proceed to implementation phase",
      "Use /implement or /implement step-by-step based on complexity"
    ],
    "during_implementation": [
      "Address important recommendations as you code",
      "Pay extra attention to risk mitigation strategies",
      "Add file references when implementing vague steps"
    ],
    "before_merging": [
      "Ensure all tests pass",
      "Verify acceptance criteria met",
      "Complete E2E tests if not done"
    ]
  },
  "recommended_command": "/implement",
  "implementation_mode": "standard"
}
```

#### If NO-GO:

```json
{
  "next_steps": {
    "immediate": [
      "Address critical issues listed above",
      "Revise plan sections with low scores"
    ],
    "focus_areas": [
      "Improve risk coverage and mitigation strategies",
      "Add specific file references to all steps",
      "Clarify vague acceptance criteria"
    ],
    "after_revision": [
      "Re-run /review-plan to validate improvements",
      "Ensure all critical issues resolved"
    ]
  },
  "recommended_command": "/plan (incorporate feedback)",
  "estimated_revision_time": "2-3 hours"
}
```

## Output Format

Generate comprehensive review report:

```markdown
---
# PLAN REVIEW REPORT: [Task Title]

## EXECUTIVE SUMMARY
**Decision**: 🟢 GO
**Overall Confidence**: 7.5/10.0 - GOOD
**Review Date**: 2025-01-15T14:30:00Z
**Reviewer**: @lead

The plan is well-structured and ready for implementation with minor improvements recommended during execution. No critical blockers identified.

---

## DIMENSION SCORES

| Dimension          | Score | Weight | Weighted | Status |
|--------------------|-------|--------|----------|--------|
| Completeness       | 7.8   | 20%    | 1.56     | ✓      |
| Feasibility        | 7.5   | 25%    | 1.88     | ✓      |
| Risk Coverage      | 7.2   | 20%    | 1.44     | ⚠      |
| Step Quality       | 7.3   | 20%    | 1.46     | ⚠      |
| Test Strategy      | 7.8   | 15%    | 1.17     | ✓      |
| **OVERALL**        | **7.5** | **100%** | **7.51** | **✓** |

Legend: ✓ Good (≥7.5) | ⚠ Acceptable (6-7.5) | ✗ Needs Work (<6)

---

## DETAILED ASSESSMENT

### 1. Completeness Review [7.8/10]
**Status**: ✓ Good

**Strengths**:
- All 8 required sections present
- Substantive content throughout
- Clear scope boundaries

**Gaps Identified**:
- Rollback strategy lacks data recovery details

**Recommendations**:
- Add specific database backup step to rollback

---

### 2. Technical Feasibility [7.5/10]
**Status**: ✓ Good

**Strengths**:
- Sound technical approach
- Dependencies are available
- Architecture alignment verified

**Concerns**:
- SendGrid API key needs verification in staging

**Recommendations**:
- Verify API configuration before deployment

---

### 3. Risk Coverage [7.2/10]
**Status**: ⚠ Acceptable

**Strengths**:
- Major risks identified
- Severity ratings are realistic

**Unaddressed Risks**:
- Email provider outage scenario
- Token enumeration attack vector

**Mitigation Gaps**:
- High-severity risks need more detailed mitigations

**Recommendations**:
- Add mitigation for email provider outage
- Enhance token security measures

---

### 4. Step Quality [7.3/10]
**Status**: ⚠ Acceptable

**Strengths**:
- Most steps are clear and actionable
- Good validation criteria overall

**Issues**:
- Steps 5, 8, 11 lack file references
- Step 8 is too vague ("handle edge cases")

**Examples of Improvements Needed**:
- Step 5: "Update the auth flow" → "In auth.middleware.ts, modify authenticateUser() to check user.email_verified"

**Recommendations**:
- Add specific file paths to vague steps
- Break down multi-action steps

---

### 5. Test Strategy [7.8/10]
**Status**: ✓ Good

**Strengths**:
- Unit and integration tests planned
- Good scenario coverage
- Clear acceptance criteria

**Gaps**:
- No E2E tests for user-facing feature
- Security tests not mentioned

**Recommendations**:
- Add E2E test suite
- Include security tests for token handling

---

## CRITICAL ISSUES

None identified. ✓

---

## IMPROVEMENT RECOMMENDATIONS

### 🔴 Critical (Must Fix for GO)
None

### 🟡 Important (Should Fix)
1. Add file references to Steps 5, 8, and 11
2. Enhance risk mitigation strategies for high-severity risks
3. Add E2E test suite to testing strategy
4. Verify SendGrid API configuration

### 🟢 Nice-to-Have (Optional)
1. Add key assumptions to effort estimate
2. Include security tests in test strategy

---

## DECISION RATIONALE

**Why GO:**

The plan demonstrates good quality across all dimensions with an overall confidence score of 7.5/10, which exceeds the threshold of 7.0. No critical blockers were identified.

**Key Strengths**:
✓ Comprehensive coverage of all required sections
✓ Technically sound and feasible approach
✓ Good testing strategy with clear acceptance criteria
✓ All dependencies verified and available

**Main Concerns**:
⚠ Risk coverage could be more comprehensive
⚠ Some implementation steps need more specificity
⚠ E2E tests should be added for complete coverage

**Confidence Level**: Medium-High

The plan is solid and ready for execution. The identified concerns can be addressed during implementation without blocking the start of work. Recommend addressing important improvements as you code, particularly adding file references to vague steps and enhancing risk mitigations.

---

## NEXT STEPS

✅ **Proceed to Implementation**

**Immediate Actions**:
1. Execute: `/implement` (standard mode recommended)
2. During implementation, add file references to steps as you work through them
3. Pay extra attention to risk mitigation strategies

**Before Merging**:
- Ensure all tests pass
- Verify acceptance criteria met
- Consider adding E2E tests for complete coverage

**Special Considerations**:
- Monitor email delivery rates closely post-deployment
- Have rollback plan ready for first deployment

---

**Reviewed by**: @lead Agent
**Timestamp**: 2025-01-15T14:30:00Z
**Review Version**: 1.0
---
```

## Success Criteria

- ✅ Overall confidence score calculated correctly
- ✅ Clear GO or NO-GO decision made
- ✅ All issues categorized by priority
- ✅ Critical blockers identified (if any)
- ✅ Actionable recommendations provided
- ✅ Decision rationale is comprehensive
- ✅ Next steps are clear and specific
- ✅ Review report is well-formatted and readable

## Rules

**DO**:
- ✅ Calculate overall score using correct weights
- ✅ Flag critical blockers explicitly
- ✅ Provide clear decision rationale
- ✅ Prioritize recommendations realistically
- ✅ Give specific next steps

**DON'T**:
- ❌ Don't make GO decision with critical blockers
- ❌ Don't ignore dimension weights in calculation
- ❌ Don't be vague about why GO or NO-GO
- ❌ Don't mix up priority levels
- ❌ Don't leave user unclear on next actions

