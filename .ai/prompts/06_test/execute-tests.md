---
id: test.execute-tests
version: 1.0.0
category: test
experimental: true
name: Execute Tests
description: Run test suites based on scope and type, collect results and coverage metrics
tags:
  - testing
  - test-execution
  - coverage-analysis
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
    - claude-sonnet-4.5
agents:
  - qa
dependencies:
  requires:
    - test.analyze-test-infrastructure
inputs:
  - name: test_scope
    description: Scope of tests to execute
    type: string
    required: false
    default: all
  - name: test_type
    description: Type of tests to run
    type: string
    required: false
    default: all
    validation:
      enum: ["unit", "integration", "e2e", "all"]
  - name: coverage_threshold
    description: Minimum coverage percentage required
    type: number
    required: false
    default: 80
    validation:
      min: 0
      max: 100
  - name: test_framework
    description: Test framework info from analyze-test-infrastructure
    type: object
    required: true
  - name: test_structure
    description: Test structure from analyze-test-infrastructure
    type: object
    required: true
outputs:
  - test_results
  - coverage_metrics
  - failed_tests
tokens:
  avg: 5000
  max: 12000
  min: 2500
---

# Execute Tests

## Objective

Run test suites in the appropriate order, capture comprehensive results including failures and stack traces, generate coverage reports, and determine pass/fail status against thresholds.

## Instructions

### Step 1: Prepare Test Environment

**Setup environment variables**:
```bash
export NODE_ENV=test
export TEST_DATABASE_URL=postgresql://localhost:5432/test_db
# Additional env vars from test_framework.environment_requirements
```

**Setup test infrastructure** (if required):
```bash
# Start test database
npm run db:test:setup

# Start Docker containers (if needed)
docker-compose -f docker-compose.test.yml up -d

# Run migrations
npm run migrate:test
```

### Step 2: Determine Test Execution Order

**Based on test_type parameter**:

- **test_type = "unit"**: Run only unit tests
- **test_type = "integration"**: Run only integration tests
- **test_type = "e2e"**: Run only e2e tests
- **test_type = "all"**: Run in order: unit → integration → e2e

**Execution strategy**:
```json
{
  "execution_plan": [
    {
      "type": "unit",
      "command": "npm run test:unit -- --coverage",
      "timeout": "5m",
      "parallel": true
    },
    {
      "type": "integration",
      "command": "npm run test:integration",
      "timeout": "10m",
      "parallel": false,
      "depends_on": ["unit"]
    },
    {
      "type": "e2e",
      "command": "npm run test:e2e",
      "timeout": "15m",
      "parallel": false,
      "depends_on": ["integration"]
    }
  ]
}
```

### Step 3: Execute Unit Tests

**Run unit test suite**:
```bash
# With coverage
npm run test:unit -- --coverage --reporter=json --outputFile=test-results-unit.json

# Apply scope if provided
npm run test:unit -- src/auth --coverage
```

**Capture output**:
- Test results (pass/fail counts)
- Execution time
- Coverage data (statements, branches, functions, lines)
- Failed test details
- Stack traces

**Example output**:
```json
{
  "unit_tests": {
    "total": 45,
    "passed": 43,
    "failed": 2,
    "skipped": 0,
    "duration": "2.34s",
    "suites": [
      {
        "name": "AuthService",
        "file": "src/auth/service.test.ts",
        "tests": 12,
        "passed": 12,
        "failed": 0,
        "duration": "0.45s"
      },
      {
        "name": "EmailService",
        "file": "src/email/service.test.ts",
        "tests": 8,
        "passed": 6,
        "failed": 2,
        "duration": "0.67s"
      }
    ],
    "failures": [
      {
        "test": "should send verification email",
        "file": "src/email/service.test.ts",
        "line": 45,
        "error": "Expected email to be sent but emailService.send was not called",
        "stack": "Error: Expected email...\n    at Object.<anonymous> (src/email/service.test.ts:45:5)"
      }
    ],
    "coverage": {
      "statements": {"covered": 342, "total": 380, "pct": 90.0},
      "branches": {"covered": 78, "total": 95, "pct": 82.1},
      "functions": {"covered": 54, "total": 58, "pct": 93.1},
      "lines": {"covered": 334, "total": 372, "pct": 89.8}
    }
  }
}
```

### Step 4: Execute Integration Tests

**Run integration test suite**:
```bash
npm run test:integration -- --reporter=json --outputFile=test-results-integration.json
```

**Capture output** (similar structure to unit tests):
```json
{
  "integration_tests": {
    "total": 12,
    "passed": 12,
    "failed": 0,
    "skipped": 0,
    "duration": "5.67s",
    "suites": [
      {
        "name": "Auth Flow",
        "file": "tests/integration/auth-flow.test.ts",
        "tests": 8,
        "passed": 8,
        "failed": 0,
        "duration": "3.21s"
      }
    ],
    "failures": []
  }
}
```

### Step 5: Execute E2E Tests

**Run e2e test suite** (if test_type includes e2e):
```bash
npm run test:e2e -- --reporter=json --outputFile=test-results-e2e.json
```

**Capture screenshots on failure** (if supported):
```json
{
  "e2e_tests": {
    "total": 8,
    "passed": 7,
    "failed": 1,
    "skipped": 0,
    "duration": "45.23s",
    "suites": [
      {
        "name": "User Registration",
        "file": "tests/e2e/registration.test.ts",
        "tests": 4,
        "passed": 3,
        "failed": 1,
        "duration": "22.15s"
      }
    ],
    "failures": [
      {
        "test": "should complete registration flow",
        "file": "tests/e2e/registration.test.ts",
        "line": 23,
        "error": "Timeout: Element 'Submit' not found",
        "screenshot": "tests/e2e/screenshots/registration-failure.png"
      }
    ]
  }
}
```

### Step 6: Aggregate Coverage Metrics

**Merge coverage from all test types**:
```json
{
  "coverage": {
    "overall": {
      "statements": {"pct": 92.5},
      "branches": {"pct": 88.3},
      "functions": {"pct": 95.2},
      "lines": {"pct": 91.8}
    },
    "by_file": [
      {
        "file": "src/auth/service.ts",
        "statements": 95.2,
        "branches": 91.5,
        "functions": 100.0,
        "lines": 94.8,
        "uncovered_lines": [47, 48]
      },
      {
        "file": "src/email/service.ts",
        "statements": 78.5,
        "branches": 72.1,
        "functions": 87.5,
        "lines": 77.9,
        "uncovered_lines": [23, 24, 89, 90, 91]
      }
    ],
    "threshold": 80,
    "threshold_met": true
  }
}
```

### Step 7: Identify Coverage Gaps

**Find files below threshold**:
```json
{
  "files_below_threshold": [
    {
      "file": "src/email/service.ts",
      "coverage": 78.5,
      "threshold": 80,
      "gap": -1.5,
      "uncovered_critical_paths": [
        {
          "function": "handleEmailError",
          "lines": [89, 90, 91],
          "reason": "Error recovery path not tested"
        }
      ]
    }
  ]
}
```

### Step 8: Detect Flaky Tests

**Identify intermittent failures** (if re-running):
- Tests that pass on retry
- Tests with timing dependencies
- Tests with race conditions

```json
{
  "flaky_tests": [
    {
      "test": "should update user profile",
      "file": "tests/integration/profile.test.ts",
      "pass_rate": "3/5",
      "reason": "Timing-dependent assertion"
    }
  ]
}
```

### Step 9: Handle Test Failures

**Continue execution strategy**:
- For unit test failures: Continue to integration tests
- For integration test failures: Skip e2e tests
- Preserve all failure details

**Collect error context**:
- Full stack traces
- Environment state
- Test data used
- Related tests

### Step 10: Generate Test Summary

**Aggregate all results**:
```json
{
  "summary": {
    "total_tests": 65,
    "passed": 62,
    "failed": 3,
    "skipped": 0,
    "duration": "53.24s",
    "pass_rate": "95.4%",
    "coverage": {
      "overall": 92.5,
      "threshold": 80,
      "threshold_met": true
    },
    "status": "FAIL",
    "reason": "3 test failures"
  }
}
```

## Output Format

```json
{
  "test_results": {
    "summary": {
      "total_tests": 65,
      "passed": 62,
      "failed": 3,
      "skipped": 0,
      "duration": "53.24s",
      "pass_rate": "95.4%"
    },
    "unit_tests": {
      "total": 45,
      "passed": 43,
      "failed": 2,
      "duration": "2.34s",
      "failures": [
        {
          "test": "should send verification email",
          "file": "src/email/service.test.ts",
          "line": 45,
          "error": "Expected email to be sent but emailService.send was not called",
          "stack": "Error: Expected email...\n    at Object.<anonymous> (src/email/service.test.ts:45:5)"
        }
      ]
    },
    "integration_tests": {
      "total": 12,
      "passed": 12,
      "failed": 0,
      "duration": "5.67s"
    },
    "e2e_tests": {
      "total": 8,
      "passed": 7,
      "failed": 1,
      "duration": "45.23s",
      "failures": [
        {
          "test": "should complete registration flow",
          "file": "tests/e2e/registration.test.ts",
          "screenshot": "tests/e2e/screenshots/registration-failure.png"
        }
      ]
    }
  },
  "coverage_metrics": {
    "overall": {
      "statements": 92.5,
      "branches": 88.3,
      "functions": 95.2,
      "lines": 91.8
    },
    "threshold": 80,
    "threshold_met": true,
    "files_below_threshold": [
      {
        "file": "src/email/service.ts",
        "coverage": 78.5,
        "uncovered_lines": [23, 24, 89, 90, 91]
      }
    ]
  },
  "failed_tests": [
    {
      "type": "unit",
      "test": "should send verification email",
      "file": "src/email/service.test.ts",
      "error": "Expected email to be sent but emailService.send was not called"
    },
    {
      "type": "e2e",
      "test": "should complete registration flow",
      "file": "tests/e2e/registration.test.ts",
      "error": "Timeout: Element 'Submit' not found"
    }
  ]
}
```

## Success Criteria

- ✅ All test suites executed in correct order
- ✅ Test results captured (pass/fail/skip counts)
- ✅ Execution time recorded
- ✅ Failure details with stack traces collected
- ✅ Coverage metrics generated
- ✅ Coverage threshold evaluated
- ✅ Flaky tests detected (if applicable)

## Rules

**DO**:
- ✅ Run tests in appropriate order (unit → integration → e2e)
- ✅ Capture full stack traces for failures
- ✅ Generate coverage reports
- ✅ Continue execution even if tests fail (to gather all results)
- ✅ Apply scope filters correctly
- ✅ Record timing information

**DON'T**:
- ❌ Don't stop at first failure
- ❌ Don't skip coverage generation
- ❌ Don't ignore flaky tests
- ❌ Don't run tests in parallel if they have dependencies
- ❌ Don't proceed if test framework fails to start

