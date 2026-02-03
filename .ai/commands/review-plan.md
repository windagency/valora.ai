---
name: review-plan
description: Validate implementation plan quality, completeness, and feasibility before execution begins
experimental: true
argument-hint: '<plan-document-path> [--strict-mode] [--threshold=7.0] [--focus=<completeness|risks|feasibility|actionability|all>] [--checklist]'
allowed-tools:
  - codebase_search
  - read_file
  - grep
  - list_dir
  - glob_file_search
  - query_session
model: gpt-5-thinking-high
agent: lead
prompts:
  pipeline:
    - stage: context
      prompt: context.load-plan-context
      required: true
      inputs:
        plan_document: $ARG_1
        previous_plan_version: $CONTEXT_previous_plan
      outputs:
        - plan_structure
        - task_requirements
        - complexity_assessment
    - stage: completeness
      prompt: review.validate-completeness
      required: true
      inputs:
        document_type: "plan"
        plan_structure: $STAGE_context.plan_structure
        task_requirements: $STAGE_context.task_requirements
      outputs:
        - completeness_score
        - missing_sections
        - gaps_identified
    - stage: feasibility
      prompt: review.validate-technical-feasibility
      required: true
      parallel: true
      inputs:
        plan_structure: $STAGE_context.plan_structure
        complexity_assessment: $STAGE_context.complexity_assessment
      outputs:
        - feasibility_score
        - technical_concerns
        - blockers_identified
    - stage: risks
      prompt: review.validate-risk-coverage
      required: true
      parallel: true
      inputs:
        plan_structure: $STAGE_context.plan_structure
        complexity_assessment: $STAGE_context.complexity_assessment
      outputs:
        - risk_coverage_score
        - unaddressed_risks
        - mitigation_gaps
    - stage: steps
      prompt: review.validate-step-quality
      required: true
      parallel: true
      inputs:
        plan_structure: $STAGE_context.plan_structure
      outputs:
        - step_quality_score
        - vague_steps
        - actionability_issues
    - stage: tests
      prompt: review.validate-test-strategy
      required: true
      parallel: true
      inputs:
        plan_structure: $STAGE_context.plan_structure
      outputs:
        - test_coverage_score
        - testing_gaps
    - stage: synthesis
      prompt: review.synthesize-plan-assessment
      required: true
      inputs:
        completeness_score: $STAGE_completeness.completeness_score
        feasibility_score: $STAGE_feasibility.feasibility_score
        risk_coverage_score: $STAGE_risks.risk_coverage_score
        step_quality_score: $STAGE_steps.step_quality_score
        test_coverage_score: $STAGE_tests.test_coverage_score
        all_gaps: $STAGE_completeness.gaps_identified
        all_concerns: $STAGE_feasibility.technical_concerns
      outputs:
        - overall_confidence
        - go_no_go_decision
        - improvement_recommendations
        - critical_issues
  merge_strategy: sequential
  rollback_on_failure: context
  cache_strategy: none
  retry_policy:
    max_attempts: 1
    backoff_ms: 0
    retry_on:
      - error
---

# Plan Review Command

## Role

Use the [agent] profile

## Goal

**Validate implementation plan quality and readiness** by conducting a comprehensive review to ensure the plan is complete, feasible, safe, and actionable before implementation begins. This command serves as a **critical quality gate** preventing flawed plans from reaching execution.

**Primary Objectives**:

1. **Validate completeness** - Ensure all required plan sections are present and thorough
2. **Assess technical feasibility** - Verify proposed approach is implementable with available tools/knowledge
3. **Evaluate risk coverage** - Confirm all risks are identified with adequate mitigation strategies
4. **Review step quality** - Ensure implementation steps are clear, specific, and actionable
5. **Validate test strategy** - Confirm testing approach is comprehensive and realistic
6. **Check dependencies** - Verify all dependencies are identified and available
7. **Assess effort estimates** - Evaluate if time/complexity estimates are reasonable
8. **Make go/no-go decision** - Provide clear recommendation: proceed or revise plan

**This command answers**: "Is this plan ready for implementation, or does it need refinement?"

## Context

### Input Arguments

```plaintext
$ARGUMENTS
```

### Configuration Parameters

```structured
<details>
<summary>Review Configuration Options</summary>

**--strict-mode** (default: false)
- Enable strict validation with higher quality thresholds
- Any score below 8/10 triggers no-go recommendation
- Requires explicit mitigation for all identified risks

**--focus** (default: all)
- `completeness` - Deep dive on plan structure and sections
- `risks` - Emphasize risk assessment and mitigation quality
- `feasibility` - Focus on technical implementability
- `actionability` - Prioritize step clarity and specificity
- `all` - Comprehensive review across all dimensions

**--threshold** (default: 7.0)
- Minimum overall confidence score to recommend proceeding
- Range: 0-10 (scores below threshold = no-go)
- Strict mode overrides this to 8.0

**--compare-to** (optional)
- Previous plan version for comparison
- Highlights improvements or regressions
- Validates that feedback was addressed

**--checklist** (default: false)
- Quick validation mode using PLAN_QUALITY_CHECKLIST.md template
- Binary Y/N validation of 35 items across 7 sections
- Target completion: ~3 minutes (vs ~14 min for full review)
- Skips detailed narrative assessment, focuses on pass/fail criteria
- Use for pre-review self-validation before full review
- Quality gate: 80% (28/35 items) must pass

**--skip-iterations-if-excellent** (default: true)
- Enable early exit optimization for high-confidence plans
- If overall confidence ≥ 8.5 AND no critical blockers AND all dimensions ≥ 7.0
- Skips secondary review iterations, immediately proceeds to GO decision
- Saves 10-15 minutes per review when conditions are met
- Recommended for low-risk, well-structured plans

</details>
```

### Session Context Variables

The command leverages session context for enhanced functionality:

**Input Variables** (optional):
- `$CONTEXT_previous_plan`: Path to previous plan version for comparison (set via `--compare-to` flag or session)
- `$SESSION_gathered_knowledge`: Codebase context from prior `gather-knowledge` execution

**Output Variables** (produced):
- `$SESSION_last_review_decision`: GO or NO-GO decision from this review
- `$SESSION_last_review_score`: Overall confidence score (0-10)
- `$SESSION_last_review_report`: Path to generated review report

These variables enable workflow continuity across commands within the same session.

### Review Dimensions

The review evaluates plans across these quality dimensions:

1. **Completeness (20%)** - All required sections present and thorough
2. **Feasibility (25%)** - Technically implementable with available resources
3. **Risk Coverage (20%)** - Risks identified and properly mitigated
4. **Step Quality (20%)** - Clear, specific, actionable implementation steps
5. **Test Strategy (15%)** - Comprehensive testing approach defined

**Overall Confidence Score** = Weighted average of dimension scores

## Rules

### Quality Thresholds

The review evaluates plans across 5 dimensions, each contributing to an overall confidence score:

**Overall Confidence Ranges**:

- **9.0-10.0** → EXCELLENT - Proceed with high confidence
- **7.5-8.9** → GOOD - Proceed with normal confidence
- **6.0-7.4** → ACCEPTABLE - Proceed with caution
- **4.0-5.9** → NEEDS WORK - Revise plan before proceeding
- **0.0-3.9** → INADEQUATE - Major revision required

**Decision Logic**:

- Score ≥ threshold (default 7.0) AND no critical blockers → **GO**
- Score < threshold OR critical blocker present → **NO-GO**
- Strict mode: threshold = 8.0

### Dimension Weights

```plaintext
Overall Confidence = (
  Completeness × 20% +
  Feasibility × 25% +
  Risk Coverage × 20% +
  Step Quality × 20% +
  Test Strategy × 15%
)
```

**Each dimension is evaluated in detail by its respective prompt**:

1. `review.validate-plan-completeness` - Checks all required sections are present and substantive
2. `review.validate-technical-feasibility` - Verifies approach is technically sound and implementable
3. `review.validate-risk-coverage` - Ensures risks are identified and mitigated
4. `review.validate-step-quality` - Confirms steps are clear, specific, and actionable
5. `review.validate-test-strategy` - Validates comprehensive testing approach

### Critical Blockers (Automatic NO-GO)

Any of these triggers immediate NO-GO regardless of score:

- Technical impossibility or unavailable dependencies
- Data loss risk without mitigation
- Security vulnerability without remediation
- Breaking change without compatibility plan
- High-severity risk without mitigation strategy

## Process Steps

The review follows a structured pipeline executed by specialized prompts:

### Step 1: Load Plan Context

**Prompt**: `review.load-plan-context`

Parse the implementation plan document to extract structure, requirements, complexity assessment, and metadata.

**Outputs**: plan_structure, task_requirements, complexity_assessment

### Step 2: Validate Completeness

**Prompt**: `review.validate-completeness` (document_type="plan")

Ensure all 8 required plan sections are present with substantive, task-specific content. Uses the reusable completeness validation prompt configured for plan validation.

**Required Sections**: Task Overview, Complexity Assessment, Dependencies, Risk Assessment, Implementation Steps, Testing Strategy, Rollback Strategy, Effort Estimate

**Outputs**: completeness_score (0-10), missing_sections, gaps_identified

### Step 3: Validate Technical Feasibility

**Prompt**: `review.validate-technical-feasibility`

Assess if the proposed approach is technically sound, dependencies are available, and complexity assessment is realistic. Uses codebase search to verify existing patterns and dependencies.

**Outputs**: feasibility_score (0-10), technical_concerns, blockers_identified

### Step 4: Validate Risk Coverage

**Prompt**: `review.validate-risk-coverage`

Ensure risks across all categories (technical, business, operational) are identified with appropriate severity and mitigation strategies.

**Outputs**: risk_coverage_score (0-10), unaddressed_risks, mitigation_gaps

### Step 5: Validate Step Quality

**Prompt**: `review.validate-step-quality`

Verify implementation steps are atomic, specific, actionable, properly sequenced, and include validation criteria.

**Outputs**: step_quality_score (0-10), vague_steps, actionability_issues

### Step 6: Validate Test Strategy

**Prompt**: `review.validate-test-strategy`

Confirm testing approach covers necessary test types, scenarios (happy path, errors, edge cases), and has clear acceptance criteria.

**Outputs**: test_coverage_score (0-10), testing_gaps

### Step 7: Synthesize Assessment

**Prompt**: `review.synthesize-plan-assessment`

Calculate overall confidence score using weighted average, aggregate all issues, make go/no-go decision, and generate comprehensive review report.

**Outputs**: overall_confidence (0-10), go_no_go_decision, improvement_recommendations, critical_issues

## Output Format

The final output is a comprehensive **Plan Review Report** generated by the `review.synthesize-plan-assessment` prompt.

**Report Structure**:

1. **Executive Summary** - Decision, overall confidence, review metadata
2. **Dimension Scores** - Table showing all 5 dimension scores with weights
3. **Detailed Assessment** - Section-by-section analysis with strengths, gaps, and recommendations
4. **Critical Issues** - Must-fix blockers (if any)
5. **Improvement Recommendations** - Prioritized by critical/important/nice-to-have
6. **Decision Rationale** - Why GO or NO-GO with confidence level
7. **Next Steps** - Clear guidance on what to do next

**Sample Executive Summary**:

```markdown
## EXECUTIVE SUMMARY
**Decision**: 🟢 GO
**Overall Confidence**: 7.5/10.0 - GOOD
**Review Date**: 2025-01-15T14:30:00Z
**Reviewer**: @lead

The plan is well-structured and ready for implementation with minor improvements 
recommended during execution. No critical blockers identified.
```

See `review.synthesize-plan-assessment` prompt for complete output format specification.

## Output Requirements

### Review Quality Checklist

Ensure the final review report:

- ✅ All 5 dimensions evaluated with justified scores
- ✅ Clear GO or NO-GO decision with comprehensive rationale
- ✅ Critical issues and blockers explicitly highlighted
- ✅ Recommendations are actionable and prioritized
- ✅ Next steps are clear and specific
- ✅ Tone is constructive and professional

### Handoff to Next Phase

**Decision Flow**:

- **GO** + standard mode (complexity < 7) → `/implement`
- **GO** + incremental mode (complexity ≥ 7) → `/implement step-by-step`
- **NO-GO** → `/plan` (incorporate review feedback and address critical issues)

## Metrics Collection

After synthesis stage completes, emit optimization and quality metrics as JSON:

```typescript
optimization_metrics: {
  early_exit_triggered: boolean,      // true if overall_confidence >= 8.5 and skipped iterations
  initial_confidence: number,         // From $STAGE_synthesis.overall_confidence
  time_saved_minutes: number | undefined // If early_exit: 10-15 min saved
}

quality_metrics: {
  plan_approved: boolean,             // true if go_no_go_decision === 'GO'
  review_score: number,               // From $STAGE_synthesis.overall_confidence (0-10 scaled to 0-100)
  iterations: number                  // Count of review iterations (default: 1, increments if resubmitted)
}
```

Store these in command outputs for session logging and metrics extraction.

## Command Output Summary

Print the following summary at command completion:

**For GO decision:**

```markdown
## 🟢 Plan Review: GO

**Overall Confidence**: [X.X]/10.0
**Decision**: GO - Ready for implementation

### Dimension Scores
| Dimension | Score | Weight |
|-----------|-------|--------|
| Completeness | [X]/10 | 20% |
| Feasibility | [X]/10 | 25% |
| Risk Coverage | [X]/10 | 20% |
| Step Quality | [X]/10 | 20% |
| Test Strategy | [X]/10 | 15% |

### Recommendations
- [Recommendation 1]
- [Recommendation 2]

### Next Step
→ `/implement` to execute implementation plan
→ `/implement step-by-step` (recommended if complexity ≥ 7)
```

**For NO-GO decision:**

```markdown
## 🔴 Plan Review: NO-GO

**Overall Confidence**: [X.X]/10.0
**Decision**: NO-GO - Revisions required

### Critical Issues
1. [Blocker 1]
2. [Blocker 2]

### Required Changes
- [Change 1]
- [Change 2]

### Next Step
→ `/plan` to address review feedback and resubmit
```

---

## Quick Checklist Mode

When `--checklist` flag is used, the review switches to a fast binary validation mode:

### Purpose

Reduce review time from ~14 min to ~3 min by using the standardised `PLAN_QUALITY_CHECKLIST.md` template for quick pass/fail validation.

### Checklist Sections (35 items total)

| Section | Items | Focus |
|---------|-------|-------|
| 1. Dependencies | 5 | All dependencies identified with sources |
| 2. Risk Assessment | 5 | Risks identified with mitigations |
| 3. Step Atomicity | 5 | Steps are atomic with file paths |
| 4. Testing Strategy | 5 | Unit/integration/E2E coverage |
| 5. Rollback Procedures | 5 | Quick rollback documented |
| 6. Effort Estimation | 5 | Estimates with confidence levels |
| 7. Architecture Alignment | 5 | (Architecture plans only) |

### Quality Gate

- **Minimum threshold**: 80% (28/35 items)
- **Critical items** (must pass):
  - 2.2 - Each risk has mitigation strategy
  - 3.2 - Each step includes specific file paths
  - 5.1 - Quick rollback procedure documented

### When to Use Checklist Mode

- **Self-validation** before requesting full review
- **Quick pre-flight check** before implementation
- **Iterative refinement** to track improvement
- **Tiered planning** between architecture and implementation phases

### Checklist Output

```markdown
## Plan Quality Checklist Results

**Plan**: [PLAN-IMPL-TASK-001.md]
**Result**: PASS (31/35 items - 89%)

### Section Scores
| Section | Passed | Total |
|---------|--------|-------|
| Dependencies | 5 | 5 |
| Risk Assessment | 4 | 5 |
| Step Atomicity | 5 | 5 |
| Testing Strategy | 5 | 5 |
| Rollback Procedures | 4 | 5 |
| Effort Estimation | 4 | 5 |
| Architecture | 4 | 5 |

### Critical Items
- [x] 2.2 - Each risk has mitigation strategy
- [x] 3.2 - Each step includes specific file paths
- [x] 5.1 - Quick rollback procedure documented

### Failed Items
- 2.3 - Risk likelihood not assessed for 2 risks
- 5.4 - Rollback time estimate missing
- 6.4 - Buffer for unknowns not included
- 7.2 - Component boundaries not clearly defined

### Next Step
→ Address 4 failed items, then proceed to implementation
→ Or run `/review-plan` for full narrative assessment
```

### Workflow Integration

```
/plan-architecture
    |
    v
/review-plan --checklist  <-- Quick validation (~3 min)
    |
    v (if PASS)
/plan-implementation
    |
    v
/review-plan --checklist  <-- Quick validation (~3 min)
    |
    v (if PASS)
/review-plan              <-- Full review (optional, ~14 min)
    |
    v
/implement
```
