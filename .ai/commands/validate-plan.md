---
name: validate-plan
description: Automated pre-review validation to catch missing plan parameters early (reduces review-plan time by 60-70%)
experimental: true
argument-hint: '[<plan-path>] [--fix] [--strict]'
allowed-tools:
  - read_file
  - grep
  - list_dir
  - glob_file_search
  - run_terminal_cmd  # Required for modern CLI tools (jq, yq, rg, fd)
model: claude-sonnet-4.5
agent: lead
prompts:
  pipeline:
    - stage: validate
      prompt: validation.check-plan-completeness
      required: true
      inputs:
        plan_path: $ARG_1
        fix_mode: $ARG_fix
        strict_mode: $ARG_strict
      outputs:
        - validation_results
        - missing_parameters
        - completeness_score
        - auto_fixable_issues
      timeout_ms: 60000
  merge_strategy: sequential
  cache_strategy: none
  retry_policy:
    max_attempts: 1
    backoff_ms: 0
    retry_on: []
---

# Plan Validation Command

## Role

Use the **@lead** agent profile for plan validation.

## Goal

**Automated pre-review validation** to catch missing plan parameters and structural issues early, reducing formal `review-plan` time by 60-70% (from ~14 min to ~5 min).

This command runs quick automated checks before the full `review-plan` pipeline, ensuring plans are complete before human/AI review.

## Context

### Input Arguments

```plaintext
$ARGUMENTS
```

### Configuration Parameters

**Plan Path** (positional, optional)
- Path to plan document to validate
- Default: Most recent plan in session or `knowledge-base/PLAN-*.md`

**--fix** (default: false)
- Attempt to auto-fix missing parameters where possible
- Adds placeholder sections with TODO markers

**--strict** (default: false)
- Require 100% completeness for pass
- Default threshold: 80%

## Validation Checks

### 1. Required Sections (CRITICAL)

| Section              | Required | Check                                   |
| -------------------- | -------- | --------------------------------------- |
| Overview             | Yes      | Has task description and context        |
| Implementation Steps | Yes      | Has numbered steps with file paths      |
| Dependencies         | Yes      | Has dependency list (internal/external) |
| Risk Assessment      | Yes      | Has risks with mitigations              |
| Testing Strategy     | Yes      | Has unit/integration/E2E approach       |
| Rollback Procedures  | Yes      | Has rollback commands                   |
| Effort Estimate      | Yes      | Has points/hours with confidence        |

### 2. Step Completeness

Each implementation step must have:

| Field          | Required | Validation                             |
| -------------- | -------- | -------------------------------------- |
| Objective      | Yes      | Non-empty description                  |
| Files          | Yes      | Specific file paths (not placeholders) |
| Implementation | Yes      | Code snippets or pseudocode            |
| Validation     | Yes      | Success criteria checklist             |
| Rollback       | Yes      | Revert procedure                       |

### 3. Dependency Validation

| Check                  | Validation                        |
| ---------------------- | --------------------------------- |
| All deps listed        | No orphan references              |
| Versions specified     | Package versions included         |
| Availability confirmed | Status marked (available/pending) |
| Critical path marked   | Dependencies ordered correctly    |

### 4. Risk Coverage

| Check                | Validation                          |
| -------------------- | ----------------------------------- |
| All steps have risks | Or explicitly "No risks identified" |
| Likelihood assessed  | High/Medium/Low                     |
| Impact assessed      | High/Medium/Low                     |
| Mitigation strategy  | Specific action, not generic        |
| Fallback defined     | For high/critical risks             |

### 5. Testing Coverage

| Check              | Validation                 |
| ------------------ | -------------------------- |
| Unit tests planned | Coverage target specified  |
| Integration tests  | If applicable, defined     |
| E2E tests          | If applicable, defined     |
| Test commands      | Runnable commands included |

### 6. Effort Accuracy

| Check              | Validation                 |
| ------------------ | -------------------------- |
| Per-step estimate  | Each step has points/hours |
| Total calculated   | Sum matches breakdown      |
| Confidence stated  | High/Medium/Low            |
| Assumptions listed | Factors affecting estimate |

## Automated Checks

```bash
# Check for required sections
grep -c "## Overview\|## Implementation Steps\|## Dependencies\|## Risk\|## Testing\|## Rollback\|## Effort" PLAN.md

# Check for file paths in steps
grep -c "src/\|lib/\|test/\|\.ts\|\.tsx" PLAN.md

# Check for risk mitigations
grep -c "Mitigation:\|mitigation:" PLAN.md

# Check for test commands
grep -c "pnpm test\|npm test\|vitest\|jest" PLAN.md

# Check for rollback procedures
grep -c "git revert\|git reset\|rollback" PLAN.md
```

## Output Format

### Validation Report

```markdown
## Plan Validation Report

**Plan**: [PLAN-TASK-001.md]
**Completeness**: [XX]%
**Status**: [PASS / WARN / FAIL]

---

### Section Completeness

| Section              | Status | Issues                             |
| -------------------- | ------ | ---------------------------------- |
| Overview             | ✅      | -                                  |
| Implementation Steps | ⚠️      | Step 3 missing file paths          |
| Dependencies         | ✅      | -                                  |
| Risk Assessment      | ❌      | No mitigations for 2 risks         |
| Testing Strategy     | ✅      | -                                  |
| Rollback Procedures  | ⚠️      | Generic procedure, needs specifics |
| Effort Estimate      | ✅      | -                                  |

---

### Missing Parameters

| #   | Location | Missing           | Severity | Auto-fixable |
| --- | -------- | ----------------- | -------- | ------------ |
| 1   | Step 3   | File paths        | HIGH     | No           |
| 2   | Risk 2   | Mitigation        | CRITICAL | No           |
| 3   | Risk 4   | Mitigation        | CRITICAL | No           |
| 4   | Rollback | Specific commands | MEDIUM   | Partial      |

---

### Auto-Fixable Issues

[If --fix is used]

| #   | Issue                   | Fix Applied              |
| --- | ----------------------- | ------------------------ |
| 1   | Missing testing section | Added template with TODO |
| 2   | No effort breakdown     | Added per-step template  |

---

### Recommendations

1. **Add file paths to Step 3** - Specify exact files to modify
2. **Add mitigations for Risk 2, 4** - Define specific strategies
3. **Make rollback specific** - Include actual git/deploy commands

---

### Verdict

| Result     | Criteria                                     |
| ---------- | -------------------------------------------- |
| ✅ **PASS** | Completeness >= 80%, no CRITICAL issues      |
| ⚠️ **WARN** | Completeness >= 60%, CRITICAL issues present |
| ❌ **FAIL** | Completeness < 60%                           |

**Current**: [WARN] - 2 CRITICAL issues must be resolved

---

### Next Step

- If PASS: `/review-plan` for full review (~5 min with pre-validation)
- If WARN: Fix issues, re-run `/validate-plan`
- If FAIL: Return to `/plan` to regenerate
```

## Integration with Workflow

### Before (without pre-validation)

```
/plan --> /review-plan (~14 min) --> /implement
              ↑
        Multiple iterations
        due to missing params
```

### After (with pre-validation)

```
/plan --> /validate-plan (~2 min) --> /review-plan (~5 min) --> /implement
              ↑
        Quick fix cycle
        catches issues early
```

### Time Savings

| Phase          | Without    | With      | Saved    |
| -------------- | ---------- | --------- | -------- |
| Pre-validation | 0 min      | 2 min     | -        |
| Review         | 14 min     | 5 min     | 9 min    |
| **Total**      | **14 min** | **7 min** | **~50%** |

## Usage Examples

### Basic Validation

```bash
valora validate-plan
```

Validates most recent plan against completeness checklist.

### Validate Specific Plan

```bash
valora validate-plan knowledge-base/PLAN-IMPL-TASK-001.md
```

### With Auto-Fix

```bash
valora validate-plan --fix
```

Attempts to add missing sections with TODO placeholders.

### Strict Mode

```bash
valora validate-plan --strict
```

Requires 100% completeness for PASS.

## Command Output Summary

Print the following summary at command completion:

**For PASS:**

```markdown
## ✅ Plan Validation: PASS

**Completeness**: 92%
**Critical Issues**: 0
**Duration**: 1.8 min

### Summary
- ✅ All required sections present
- ✅ All steps have file paths
- ✅ All risks have mitigations
- ⚠️ 2 minor recommendations

### Next Step
→ `/review-plan` for full review (expected: ~5 min)
```

**For WARN:**

```markdown
## ⚠️ Plan Validation: WARN

**Completeness**: 75%
**Critical Issues**: 2
**Duration**: 1.5 min

### Issues to Fix
1. ❌ Step 3: Missing file paths
2. ❌ Risk 2: No mitigation strategy

### Quick Fix
Address 2 issues above, then re-run:
→ `valora validate-plan`

Or proceed with issues:
→ `/review-plan` (will flag same issues)
```

**For FAIL:**

```markdown
## ❌ Plan Validation: FAIL

**Completeness**: 45%
**Critical Issues**: 5
**Duration**: 1.2 min

### Major Gaps
- Missing: Implementation Steps
- Missing: Risk Assessment
- Missing: Testing Strategy

### Recommendation
Plan is incomplete. Regenerate:
→ `/plan` to create new plan
```

## Notes

- Runs in ~2 minutes (vs 14 min for full review)
- Catches 60-70% of issues that cause review iterations
- Auto-fix mode adds TODO placeholders for manual completion
- Strict mode useful for production-critical plans
- Complements (doesn't replace) full `/review-plan`
