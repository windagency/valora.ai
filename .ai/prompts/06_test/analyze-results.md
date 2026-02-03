---
id: test.analyze-results
version: 1.0.0
category: test
experimental: true
name: Analyze Test Results
description: Evaluate test outcomes, assess coverage, identify patterns in failures, and provide actionable recommendations
tags:
  - testing
  - result-analysis
  - quality-assessment
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
    - claude-sonnet-4.5
agents:
  - qa
dependencies:
  requires:
    - test.execute-tests
  optional:
    - review.validate-completeness
inputs:
  - name: test_results
    description: Test execution results from execute-tests
    type: object
    required: true
  - name: coverage_metrics
    description: Coverage metrics from execute-tests
    type: object
    required: true
  - name: coverage_threshold
    description: Minimum coverage threshold
    type: number
    required: false
    default: 80
outputs:
  - quality_assessment
  - recommendations
tokens:
  avg: 4000
  max: 10000
  min: 2000
---

# Analyze Test Results

## Objective

Assess test quality, evaluate coverage adequacy, classify failures by severity, identify patterns, and provide prioritized, actionable recommendations for improvement.

## Instructions

### Step 1: Evaluate Test Outcomes

**Calculate overall statistics**:
```json
{
  "statistics": {
    "total_tests": 65,
    "passed": 62,
    "failed": 3,
    "skipped": 0,
    "pass_rate": "95.4%",
    "total_duration": "53.24s",
    "avg_test_duration": "0.82s"
  }
}
```

**Determine overall status**:
- **PASS ✅**: All tests pass, coverage meets threshold
- **FAIL ❌**: Any test failures OR coverage below threshold
- **WARN ⚠️**: All tests pass but coverage below threshold (with margin)

### Step 2: Classify Failures by Severity

**Categorize each failure**:

**Critical (Blocking)**:
- Core functionality broken
- Security/auth tests failing
- Data integrity issues
- Build-breaking failures

**Major**:
- Important feature broken
- Integration points failing
- Performance regressions

**Minor**:
- Edge case failures
- Cosmetic issues
- Non-critical paths

**Example classification**:
```json
{
  "failures_by_severity": {
    "critical": [
      {
        "test": "should authenticate user with valid credentials",
        "file": "tests/integration/auth.test.ts",
        "reason": "Core authentication broken",
        "impact": "Users cannot log in"
      }
    ],
    "major": [
      {
        "test": "should send verification email",
        "file": "src/email/service.test.ts",
        "reason": "Email service integration failing",
        "impact": "Users won't receive verification emails"
      }
    ],
    "minor": [
      {
        "test": "should handle email with 254 character length",
        "file": "src/email/validator.test.ts",
        "reason": "Edge case validation issue",
        "impact": "Rare edge case not handled"
      }
    ]
  }
}
```

### Step 3: Identify Failure Patterns

**Look for common causes**:
- Multiple tests failing in same module → module issue
- All integration tests failing → environment/setup issue
- Timing-based failures → async/race condition issues
- Intermittent failures → flaky tests

**Pattern analysis**:
```json
{
  "patterns": [
    {
      "pattern": "email_service_failures",
      "affected_tests": 2,
      "files": ["src/email/service.test.ts"],
      "common_cause": "Mock not properly configured",
      "recommended_fix": "Review emailService mock setup in beforeEach"
    },
    {
      "pattern": "timing_issues",
      "affected_tests": 1,
      "files": ["tests/e2e/registration.test.ts"],
      "common_cause": "Element not loaded before interaction",
      "recommended_fix": "Add proper wait conditions or increase timeout"
    }
  ]
}
```

### Step 4: Analyze Coverage Gaps

**Evaluate coverage metrics**:
```json
{
  "coverage_analysis": {
    "overall": {
      "statements": 92.5,
      "branches": 88.3,
      "functions": 95.2,
      "lines": 91.8,
      "threshold": 80,
      "status": "PASS"
    },
    "gaps": {
      "files_below_threshold": [
        {
          "file": "src/email/service.ts",
          "coverage": 78.5,
          "gap": -1.5,
          "priority": "medium"
        }
      ],
      "critical_paths_uncovered": [
        {
          "file": "src/email/service.ts",
          "function": "handleEmailError",
          "lines": [89, 90, 91],
          "risk": "Error recovery untested",
          "priority": "high"
        }
      ]
    }
  }
}
```

**Identify high-risk uncovered areas**:
- Error handling paths
- Security-critical functions
- Data validation logic
- API boundaries

### Step 5: Assess Test Quality

**Evaluate test characteristics**:

**Test Quality Dimensions**:
1. **Determinism**: Tests produce consistent results
2. **Speed**: Tests run quickly (< 1s per unit test ideal)
3. **Independence**: Tests don't depend on execution order
4. **Clarity**: Test names and assertions are clear
5. **Maintainability**: Tests are easy to update

**Quality assessment**:
```json
{
  "test_quality": {
    "determinism": {
      "score": "good",
      "flaky_tests": 1,
      "issues": ["registration.test.ts has timing dependency"]
    },
    "speed": {
      "score": "good",
      "slow_tests": [
        {"test": "should complete registration flow", "duration": "22.15s", "type": "e2e"}
      ],
      "avg_unit_test_duration": "0.05s"
    },
    "independence": {
      "score": "excellent",
      "test_interdependencies": []
    },
    "clarity": {
      "score": "good",
      "unclear_test_names": [],
      "vague_assertions": 0
    },
    "maintainability": {
      "score": "good",
      "test_duplication": "low",
      "shared_helpers": true
    }
  }
}
```

### Step 6: Check for Test Anti-Patterns

**Identify common issues**:
- Brittle tests (too many implementation details)
- Test interdependence (tests affecting each other)
- Over-mocking (mocking everything)
- Under-assertion (not checking enough)
- Slow tests (unit tests taking > 1s)
- Random data in tests (non-deterministic)

```json
{
  "anti_patterns": [
    {
      "pattern": "timing_dependency",
      "file": "tests/e2e/registration.test.ts",
      "line": 45,
      "issue": "Test uses fixed timeout instead of waiting for condition",
      "fix": "Replace setTimeout with waitFor(() => expect(element).toBeVisible())"
    }
  ]
}
```

### Step 7: Evaluate Test Coverage Adequacy

**Beyond the numbers**:
- Are critical paths tested?
- Are error scenarios covered?
- Are edge cases tested?
- Are integration points validated?

```json
{
  "coverage_adequacy": {
    "critical_paths": {
      "covered": 18,
      "total": 20,
      "pct": 90.0,
      "status": "good",
      "missing": ["password recovery flow", "account deletion"]
    },
    "error_scenarios": {
      "covered": 12,
      "total": 15,
      "pct": 80.0,
      "status": "acceptable",
      "missing": ["database connection failure", "email service timeout", "invalid JWT token"]
    },
    "edge_cases": {
      "covered": 8,
      "total": 12,
      "pct": 66.7,
      "status": "needs_improvement",
      "missing": ["max length inputs", "special characters", "concurrent requests", "rate limit boundary"]
    }
  }
}
```

### Step 8: Generate Recommendations

**Prioritize actions**:

**High Priority** (must fix before proceeding):
- Fix critical test failures
- Cover high-risk uncovered paths
- Resolve test infrastructure issues

**Medium Priority** (should fix soon):
- Fix major test failures
- Improve coverage for important files
- Address flaky tests

**Low Priority** (nice to have):
- Fix minor test failures
- Add tests for edge cases
- Improve test performance

**Recommendation format**:
```json
{
  "recommendations": {
    "high_priority": [
      {
        "action": "Fix email service mock configuration",
        "reason": "2 unit tests failing due to incorrect mock setup",
        "impact": "Blocks test suite from passing",
        "effort": "30 minutes",
        "file": "src/email/service.test.ts",
        "suggested_fix": "Update beforeEach() to properly mock emailService.send() method"
      },
      {
        "action": "Add tests for error recovery in email service",
        "reason": "Error handling path uncovered (lines 89-91)",
        "impact": "Critical error path untested",
        "effort": "1 hour",
        "file": "src/email/service.test.ts"
      }
    ],
    "medium_priority": [
      {
        "action": "Fix flaky E2E test",
        "reason": "Registration test has timing dependency",
        "impact": "Intermittent CI failures",
        "effort": "45 minutes",
        "file": "tests/e2e/registration.test.ts",
        "suggested_fix": "Replace fixed timeout with waitFor condition"
      }
    ],
    "low_priority": [
      {
        "action": "Add edge case tests for email validation",
        "reason": "Edge case coverage at 66.7%",
        "impact": "Better coverage of boundary conditions",
        "effort": "2 hours"
      }
    ]
  }
}
```

### Step 9: Determine Next Steps

**Based on analysis**:

**If ALL tests pass AND coverage meets threshold**:
```plaintext
Status: ✅ PASS
Recommendation: PROCEED TO REVIEW
Next command: /review-code
```

**If ANY critical test fails OR coverage significantly below threshold**:
```plaintext
Status: ❌ FAIL
Recommendation: FIX ISSUES AND RETEST
Next command: Address failures, then re-run /test
```

**If minor tests fail OR coverage slightly below threshold**:
```plaintext
Status: ⚠️ WARN
Recommendation: PROCEED WITH CAUTION or FIX ISSUES
Decision: Team/lead discretion
```

### Step 10: Generate Final Report

**Comprehensive summary**:
```markdown
# Test Validation Report

**Generated**: [Timestamp]
**Status**: ✅ PASS | ❌ FAIL | ⚠️ WARN

## Summary

- **Total Tests**: 65
- **Passed**: 62 (95.4%)
- **Failed**: 3
- **Duration**: 53.24s
- **Coverage**: 92.5% (threshold: 80%) ✅

## Test Results by Type

| Type        | Total | Passed | Failed | Duration |
|-------------|-------|--------|--------|----------|
| Unit        | 45    | 43     | 2      | 2.34s    |
| Integration | 12    | 12     | 0      | 5.67s    |
| E2E         | 8     | 7      | 1      | 45.23s   |

## Failures

### Critical (1)
[Details]

### Major (1)
[Details]

### Minor (1)
[Details]

## Coverage Analysis

**Overall Coverage**: 92.5% ✅

**Files Below Threshold**:
- `src/email/service.ts`: 78.5% (needs 1.5% more)

**Critical Uncovered Paths**:
- Error recovery in email service (lines 89-91)

## Recommendations

### High Priority
1. [Action 1]
2. [Action 2]

### Medium Priority
1. [Action 1]

## Next Steps

[PROCEED TO REVIEW | FIX ISSUES AND RETEST | PROCEED WITH CAUTION]
```

## Output Format

```json
{
  "quality_assessment": {
    "overall_status": "PASS|FAIL|WARN",
    "statistics": {
      "total_tests": 65,
      "passed": 62,
      "failed": 3,
      "pass_rate": "95.4%",
      "duration": "53.24s"
    },
    "failures_by_severity": {
      "critical": 1,
      "major": 1,
      "minor": 1
    },
    "coverage_status": {
      "overall": 92.5,
      "threshold": 80,
      "threshold_met": true,
      "files_below_threshold": 1
    },
    "test_quality": {
      "determinism": "good",
      "speed": "good",
      "independence": "excellent",
      "maintainability": "good"
    },
    "patterns_identified": [
      {
        "pattern": "email_service_failures",
        "affected_tests": 2,
        "common_cause": "Mock not properly configured"
      }
    ]
  },
  "recommendations": {
    "high_priority": [
      {
        "action": "Fix email service mock configuration",
        "effort": "30 minutes",
        "impact": "Blocks test suite from passing"
      }
    ],
    "medium_priority": [],
    "low_priority": []
  },
  "next_steps": {
    "recommendation": "PROCEED_TO_REVIEW|FIX_ISSUES_AND_RETEST|PROCEED_WITH_CAUTION",
    "next_command": "/review-code",
    "blockers": []
  }
}
```

## Success Criteria

- ✅ All test failures classified by severity
- ✅ Failure patterns identified
- ✅ Coverage gaps analyzed
- ✅ Test quality assessed
- ✅ Actionable recommendations generated
- ✅ Next steps clearly defined
- ✅ Report is comprehensive and clear

## Rules

**DO**:
- ✅ Classify all failures by severity
- ✅ Identify patterns in failures
- ✅ Provide specific, actionable recommendations
- ✅ Estimate effort for fixes
- ✅ Consider both coverage metrics and test quality
- ✅ Be clear about blockers vs warnings

**DON'T**:
- ❌ Don't recommend proceeding with critical failures
- ❌ Don't ignore coverage gaps in critical paths
- ❌ Don't provide vague recommendations
- ❌ Don't overlook flaky tests
- ❌ Don't approve based on coverage numbers alone

