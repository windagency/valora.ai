---
name: validate-coverage
description: Automated test coverage validation gate with specific thresholds and quality scoring
experimental: true
argument-hint: '[--threshold=80] [--strict] [--new-code-only] [--report-format=summary|detailed|json]'
allowed-tools:
  - read_file
  - grep
  - list_dir
  - glob_file_search
  - run_terminal_cmd
model: claude-haiku-4.5
agent: qa
prompts:
  pipeline:
    - stage: analyze
      prompt: test.analyze-test-infrastructure
      required: true
      outputs:
        - test_framework
        - test_structure
        - coverage_config
    - stage: execute
      prompt: test.execute-coverage-validation
      required: true
      inputs:
        threshold: $ARG_threshold
        strict: $ARG_strict
        new_code_only: $ARG_new_code_only
        test_framework: $STAGE_analyze.test_framework
      outputs:
        - coverage_metrics
        - quality_score
        - gaps_identified
        - gate_status
    - stage: report
      prompt: test.generate-coverage-report
      required: true
      inputs:
        coverage_metrics: $STAGE_execute.coverage_metrics
        quality_score: $STAGE_execute.quality_score
        report_format: $ARG_report_format
      outputs:
        - coverage_report
        - recommendations
  merge_strategy: sequential
  cache_strategy: none
---

# Coverage Validation Command

## Role

Use the [agent] profile (@qa)

## Goal

**Enforce automated test coverage validation gates** to ensure code quality before review or merge. This command addresses low test quality scores by providing specific, measurable coverage requirements with clear pass/fail criteria.

**Primary Objectives**:

1. **Validate coverage thresholds** - Ensure line, branch, and function coverage meet targets
2. **Calculate quality score** - Generate a composite test quality score (0-100)
3. **Identify coverage gaps** - Pinpoint files and functions below threshold
4. **Enforce critical path coverage** - Ensure security and business-critical code is tested
5. **Provide actionable recommendations** - Guide developers to improve coverage

**This command answers**: "Does our test coverage meet quality gates for merge?"

## Context

### Input Arguments

```plaintext
$ARGUMENTS
```

### Configuration Parameters

```structured
<details>
<summary>Coverage Validation Configuration</summary>

**--threshold** (default: 80)
- Minimum overall line coverage percentage required
- Range: 0-100
- Recommended: 80 for production code

**--strict** (default: false)
- Enable strict mode requiring ALL thresholds to pass
- Tier 1 thresholds become hard requirements
- New code must have >= 90% coverage

**--new-code-only** (default: false)
- Only validate coverage for changed/new files
- Useful for incremental validation in PRs
- Uses git diff to identify changed files

**--report-format** (default: summary)
- `summary` - Brief pass/fail with key metrics
- `detailed` - Full coverage breakdown by file
- `json` - Machine-readable JSON format

**--fail-on-decrease** (default: true)
- Fail if coverage decreased from baseline
- Compares against previous coverage report

</details>
```

## Rules

### Coverage Thresholds

**Tier 1: Critical Thresholds (Required)**

| Metric                    | Default | Strict Mode |
| ------------------------- | ------- | ----------- |
| Overall Line Coverage     | >= 80%  | >= 85%      |
| Overall Branch Coverage   | >= 70%  | >= 75%      |
| Overall Function Coverage | >= 85%  | >= 90%      |
| New Code Coverage         | >= 85%  | >= 95%      |

**Tier 2: File-Level Thresholds**

| File Type              | Line Coverage | Branch Coverage |
| ---------------------- | ------------- | --------------- |
| Service/Business Logic | >= 85%        | >= 75%          |
| Controllers/Routes     | >= 80%        | >= 70%          |
| Utilities/Helpers      | >= 90%        | >= 80%          |
| Models/Types           | >= 70%        | >= 60%          |

**Tier 3: Critical Path Coverage**

These MUST have 100% coverage:
- Authentication flows
- Authorization checks
- Input validation
- Error handling for security-sensitive operations

### Quality Score Calculation

```
Score = (
  Line Coverage * 0.30 +
  Branch Coverage * 0.25 +
  Function Coverage * 0.20 +
  New Code Coverage * 0.15 +
  Test Diversity * 0.10
) * 100
```

**Grade Thresholds**:
- A (>= 80): PASS
- B (70-79): PASS with recommendations
- C (60-69): WARN - requires justification
- D (50-59): FAIL
- F (< 50): FAIL - critical

### Decision Criteria

| Tier 1 Pass | Score >= 60 | Coverage Increased | Decision                        |
| ----------- | ----------- | ------------------ | ------------------------------- |
| YES         | YES         | YES                | **PASS**                        |
| YES         | YES         | NO                 | **WARN** - coverage decreased   |
| YES         | NO          | *                  | **WARN** - improve test quality |
| NO          | *           | *                  | **FAIL** - must meet thresholds |

## Process Steps

### Step 1: Analyze Test Infrastructure

Detect test framework, configuration, and existing coverage setup.

**Output**: Test framework info, coverage configuration

### Step 2: Run Coverage Analysis

Execute test suite with coverage collection.

```bash
# Vitest
pnpm vitest run --coverage

# Jest
pnpm jest --coverage --coverageReporters=json-summary

# Check coverage report
cat coverage/coverage-summary.json
```

### Step 3: Validate Against Thresholds

Compare coverage metrics against configured thresholds.

**Validation checks**:
1. Overall line coverage >= threshold
2. Overall branch coverage >= (threshold - 10)
3. Overall function coverage >= (threshold + 5)
4. New code coverage >= 90% (if --strict)
5. Critical paths have 100% coverage

### Step 4: Calculate Quality Score

Apply weighted formula to generate composite score.

### Step 5: Identify Coverage Gaps

Find files and functions below threshold.

**Gap categories**:
- CRITICAL: Security-related code uncovered
- HIGH: Business logic below threshold
- MEDIUM: API endpoints below threshold
- LOW: Utilities below threshold

### Step 6: Generate Report

Output coverage report in requested format.

## Output Requirements

### Summary Report

```markdown
## Coverage Validation: [PASS/WARN/FAIL]

**Quality Score**: [XX]/100 (Grade: [A-F])

### Metrics
| Metric    | Value | Threshold | Status      |
| --------- | ----- | --------- | ----------- |
| Lines     | XX%   | 80%       | [PASS/FAIL] |
| Branches  | XX%   | 70%       | [PASS/FAIL] |
| Functions | XX%   | 85%       | [PASS/FAIL] |
| New Code  | XX%   | 90%       | [PASS/FAIL] |

### Gaps Identified
- [N] files below threshold
- [N] critical paths uncovered

### Recommendations
1. [Specific action to improve coverage]
2. [Specific action to improve coverage]
```

### Detailed Report

Includes per-file coverage breakdown with uncovered lines.

### JSON Report

```json
{
  "status": "PASS|WARN|FAIL",
  "qualityScore": 82,
  "grade": "A",
  "metrics": {
    "lines": { "covered": 850, "total": 1000, "pct": 85.0 },
    "branches": { "covered": 150, "total": 200, "pct": 75.0 },
    "functions": { "covered": 90, "total": 100, "pct": 90.0 }
  },
  "thresholds": {
    "lines": { "required": 80, "met": true },
    "branches": { "required": 70, "met": true },
    "functions": { "required": 85, "met": true }
  },
  "gaps": [
    {
      "file": "src/services/payment.ts",
      "coverage": 75,
      "required": 85,
      "priority": "HIGH",
      "uncoveredLines": [23, 45, 67]
    }
  ],
  "recommendations": [
    "Add tests for payment error handling (lines 23, 45)",
    "Increase branch coverage in auth service"
  ]
}
```

## Success Criteria

- ✅ Coverage metrics collected successfully
- ✅ All Tier 1 thresholds evaluated
- ✅ Quality score calculated
- ✅ Coverage gaps identified with priorities
- ✅ Clear PASS/WARN/FAIL decision
- ✅ Actionable recommendations provided

## Failure Conditions

- ❌ Test framework not found
- ❌ Coverage collection fails
- ❌ Tier 1 thresholds not met (in strict mode)
- ❌ Critical paths have 0% coverage
- ❌ Coverage decreased significantly (> 5%)

---

## Command Output Summary

Print the following at command completion:

**For PASS:**

```markdown
## ✅ Coverage Validation: PASS

**Quality Score**: 82/100 (Grade: A)

### Metrics
| Metric    | Value | Threshold | Status |
| --------- | ----- | --------- | ------ |
| Lines     | 85%   | 80%       | ✅      |
| Branches  | 75%   | 70%       | ✅      |
| Functions | 90%   | 85%       | ✅      |

### Next Step
→ `/review-code` to proceed with code review
```

**For WARN:**

```markdown
## ⚠️ Coverage Validation: WARN

**Quality Score**: 68/100 (Grade: C)

### Metrics
| Metric    | Value | Threshold | Status |
| --------- | ----- | --------- | ------ |
| Lines     | 78%   | 80%       | ⚠️      |
| Branches  | 65%   | 70%       | ⚠️      |
| Functions | 85%   | 85%       | ✅      |

### Gaps (2 files)
- `src/services/auth.ts`: 72% (need 85%)
- `src/controllers/user.ts`: 68% (need 80%)

### Next Step
→ Improve coverage or proceed with justification
```

**For FAIL:**

```markdown
## ❌ Coverage Validation: FAIL

**Quality Score**: 45/100 (Grade: F)

### Metrics
| Metric    | Value | Threshold | Status |
| --------- | ----- | --------- | ------ |
| Lines     | 55%   | 80%       | ❌      |
| Branches  | 40%   | 70%       | ❌      |
| Functions | 60%   | 85%       | ❌      |

### Critical Gaps
- `src/auth/login.ts`: 0% coverage (CRITICAL)
- `src/services/payment.ts`: 30% coverage (HIGH)

### Required Actions
1. Add unit tests for authentication service
2. Add integration tests for payment flow
3. Increase overall coverage by 25%

### Next Step
→ Must improve coverage before proceeding
```

---

## Integration with Workflow

This command fits into the development workflow:

```
/implement
    |
    v
/validate-coverage  <-- New validation gate
    |
    v (if PASS)
/assert
    |
    v
/review-code
```

**Recommended workflow**:

```bash
# After implementation
valora implement

# Validate coverage (quick)
valora validate-coverage --threshold=80

# If PASS, continue to review
valora validate-parallel --quick
valora commit
```

**For strict validation (CI/CD)**:

```bash
valora validate-coverage --strict --fail-on-decrease --report-format=json
```
