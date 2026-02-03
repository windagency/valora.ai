---
id: code.verify-implementation
version: 1.0.0
category: code
experimental: true
name: Verify Implementation
description: Validate implementation quality through linting, type checking, and testing
tags:
  - verification
  - quality-assurance
  - validation
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - software-engineer-typescript-backend
  - software-engineer-typescript-frontend
  - platform-engineer
  - secops-engineer
dependencies:
  requires:
    - code.implement-changes
    - code.implement-tests
    - documentation.update-inline-docs
  optional:
    - review.validate-completeness
inputs:
  - name: code_changes
    description: Changes from implement-changes
    type: object
    required: true
  - name: test_files
    description: Test files from implement-tests
    type: array
    required: true
  - name: plan_summary
    description: Original plan summary
    type: object
    required: true
outputs:
  - verification_status
  - linter_results
  - type_check_results
  - test_results
  - coverage_results
  - implementation_complete
  - issues_found
tokens:
  avg: 2500
  max: 6000
  min: 1500
---

# Verify Implementation

## Objective

Validate that implementation meets quality standards through automated checks: linting, type checking, testing, and coverage analysis.

## Verification Checklist

This prompt verifies:
1. **Linter** - Code style and quality standards
2. **Type Checker** - Type safety (TypeScript, mypy, etc.)
3. **Tests** - All tests pass
4. **Coverage** - Meets coverage threshold (80%+)
5. **Build** - Project builds successfully
6. **Security** - No obvious vulnerabilities
7. **Performance** - No obvious inefficiencies
8. **Completeness** - All plan requirements met

## Instructions

### Step 1: Run Linter

Execute linter based on project configuration:

**Node.js/TypeScript**:
```bash
# ESLint
npx eslint . --ext .ts,.tsx,.js,.jsx

# With auto-fix (read-only check first)
npx eslint . --ext .ts,.tsx,.js,.jsx --max-warnings 0
```

**Python**:
```bash
# Pylint
pylint src/

# Or flake8
flake8 src/

# Or ruff (faster)
ruff check src/
```

**Go**:
```bash
# golangci-lint
golangci-lint run
```

**Capture results**:
```json
{
  "linter": {
    "tool": "eslint",
    "exit_code": 0,
    "errors": 0,
    "warnings": 0,
    "issues": [],
    "status": "pass"
  }
}
```

**If linter fails**:
```json
{
  "linter": {
    "tool": "eslint",
    "exit_code": 1,
    "errors": 3,
    "warnings": 2,
    "issues": [
      {
        "file": "src/services/email.ts",
        "line": 45,
        "column": 12,
        "rule": "no-unused-vars",
        "severity": "error",
        "message": "'token' is defined but never used"
      }
    ],
    "status": "fail"
  }
}
```

**Action**: If linter fails with errors, fix issues before proceeding.

### Step 2: Run Type Checker

Execute type checker if applicable:

**TypeScript**:
```bash
# Type check only (no emit)
npx tsc --noEmit

# With specific config
npx tsc --noEmit --project tsconfig.json
```

**Python**:
```bash
# mypy
mypy src/

# Or pyright
pyright src/
```

**Capture results**:
```json
{
  "type_checker": {
    "tool": "tsc",
    "exit_code": 0,
    "errors": 0,
    "issues": [],
    "status": "pass"
  }
}
```

**If type check fails**:
```json
{
  "type_checker": {
    "tool": "tsc",
    "exit_code": 2,
    "errors": 2,
    "issues": [
      {
        "file": "src/services/email.ts",
        "line": 52,
        "message": "Type 'string | undefined' is not assignable to type 'string'"
      }
    ],
    "status": "fail"
  }
}
```

**Action**: If type check fails, fix type errors before proceeding.

### Step 3: Run Tests

Execute test suite:

**Node.js**:
```bash
# Jest
npm test

# With coverage
npm test -- --coverage

# Specific files
npm test -- src/services/email.test.ts
```

**Python**:
```bash
# pytest
pytest

# With coverage
pytest --cov=src --cov-report=term-missing

# Verbose
pytest -v
```

**Capture results**:
```json
{
  "tests": {
    "tool": "jest",
    "exit_code": 0,
    "total": 45,
    "passed": 45,
    "failed": 0,
    "skipped": 0,
    "duration": "3.52s",
    "status": "pass",
    "suites": [
      {
        "name": "EmailService",
        "file": "src/services/email.test.ts",
        "tests": 12,
        "passed": 12,
        "failed": 0,
        "duration": "0.85s"
      }
    ]
  }
}
```

**If tests fail**:
```json
{
  "tests": {
    "tool": "jest",
    "exit_code": 1,
    "total": 45,
    "passed": 43,
    "failed": 2,
    "skipped": 0,
    "duration": "3.52s",
    "status": "fail",
    "failures": [
      {
        "test": "should send verification email",
        "file": "src/services/email.test.ts",
        "line": 45,
        "error": "Expected mock to be called with 'user@example.com', but received 'undefined'",
        "stack": "..."
      }
    ]
  }
}
```

**Action**: If tests fail, fix failing tests before proceeding.

### Step 4: Check Code Coverage

Analyze test coverage:

**Parse coverage report**:
```json
{
  "coverage": {
    "overall": {
      "statements": 92.5,
      "branches": 88.3,
      "functions": 95.2,
      "lines": 91.8
    },
    "by_file": [
      {
        "file": "src/services/email.ts",
        "statements": 95.2,
        "branches": 90.0,
        "functions": 100.0,
        "lines": 94.5,
        "uncovered_lines": [47, 48]
      },
      {
        "file": "src/routes/auth.ts",
        "statements": 88.5,
        "branches": 85.0,
        "functions": 90.0,
        "lines": 87.8,
        "uncovered_lines": [112, 113, 125]
      }
    ],
    "threshold": 80.0,
    "meets_threshold": true,
    "status": "pass"
  }
}
```

**Coverage evaluation**:
- ✅ **≥80%**: Meets threshold
- ⚠️ **70-79%**: Warning (acceptable for some projects)
- ❌ **<70%**: Below threshold

**Identify coverage gaps**:
```json
{
  "coverage_gaps": [
    {
      "file": "src/services/email.ts",
      "lines": [47, 48],
      "reason": "Error recovery path - requires mocking external service failure",
      "severity": "low",
      "recommendation": "Add test case for email service unavailability"
    }
  ]
}
```

### Step 5: Build Project (Smoke Test)

Attempt to build the project:

**Node.js**:
```bash
# Build
npm run build

# Or with specific command
npx tsc && npx vite build
```

**Python**:
```bash
# Check imports work
python -c "from src.services.email import EmailService"

# Or run application
python src/main.py --check
```

**Capture results**:
```json
{
  "build": {
    "exit_code": 0,
    "duration": "12.5s",
    "output_size": "2.4 MB",
    "status": "pass"
  }
}
```

**If build fails**:
```json
{
  "build": {
    "exit_code": 1,
    "error": "Module 'nodemailer' not found",
    "status": "fail"
  }
}
```

**Action**: If build fails, resolve dependency or configuration issues.

### Step 6: Security Check

Review for common vulnerabilities:

**Automated checks** (optional but recommended):
```bash
# Node.js - Check dependencies
npm audit

# Python - Check dependencies
pip-audit

# Snyk (if available)
snyk test
```

**Manual review checklist**:
- [ ] Input validation present for all external inputs
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (output encoding)
- [ ] CSRF protection (if applicable)
- [ ] Authentication/authorization checks
- [ ] Sensitive data not logged
- [ ] Secrets not hardcoded
- [ ] Rate limiting implemented (if needed)

**Capture results**:
```json
{
  "security": {
    "automated_scan": {
      "tool": "npm audit",
      "vulnerabilities": 0,
      "status": "pass"
    },
    "manual_review": {
      "input_validation": "present",
      "sql_injection_safe": true,
      "xss_safe": true,
      "auth_checks": true,
      "secrets_secure": true,
      "status": "pass"
    }
  }
}
```

### Step 7: Performance Check

Review for obvious inefficiencies:

**Check for**:
- [ ] No N+1 query patterns
- [ ] Appropriate caching strategy
- [ ] No synchronous blocking operations in async code
- [ ] Reasonable algorithmic complexity
- [ ] No memory leaks (event listeners cleaned up)
- [ ] Proper connection pooling (database, HTTP)

**Capture results**:
```json
{
  "performance": {
    "issues": [],
    "recommendations": [
      "Consider caching email templates (reduces DB queries)"
    ],
    "status": "pass"
  }
}
```

### Step 8: Validate Completeness vs Plan

Compare implementation against plan:

**From `plan_summary`, verify**:
- [ ] All implementation steps completed
- [ ] All target files modified/created
- [ ] All acceptance criteria met
- [ ] All features implemented
- [ ] All edge cases handled
- [ ] All risks addressed

**Completeness check**:
```json
{
  "completeness": {
    "plan_steps": {
      "total": 8,
      "completed": 8,
      "skipped": 0
    },
    "target_files": {
      "planned": 5,
      "modified": 5
    },
    "acceptance_criteria": {
      "total": 6,
      "met": 6
    },
    "status": "complete"
  }
}
```

**If incomplete**:
```json
{
  "completeness": {
    "missing": [
      {
        "item": "Rate limiting implementation",
        "type": "feature",
        "severity": "high",
        "step": 7
      }
    ],
    "status": "incomplete"
  }
}
```

### Step 9: Aggregate Results

**Decision logic**:
```
IF linter fails OR type_check fails OR tests fail THEN
  verification_status = "fail"
  implementation_complete = false
ELSE IF coverage < 80% THEN
  verification_status = "warning"
  implementation_complete = true (with warnings)
ELSE IF completeness has high-severity missing items THEN
  verification_status = "incomplete"
  implementation_complete = false
ELSE
  verification_status = "pass"
  implementation_complete = true
END
```

**Provide actionable feedback**:
```json
{
  "issues_found": [
    {
      "category": "linter",
      "severity": "error",
      "message": "3 linting errors in src/services/email.ts",
      "resolution": "Run: npx eslint --fix src/services/email.ts"
    },
    {
      "category": "coverage",
      "severity": "warning",
      "message": "Coverage 78%, below 80% threshold",
      "resolution": "Add tests for uncovered lines: src/routes/auth.ts:112-113"
    }
  ]
}
```

### Step 10: Final Verification Summary

**Quality gates**:
- ✅ Linter: Pass
- ✅ Type checker: Pass
- ✅ Tests: 45/45 passed
- ✅ Coverage: 92.5% (threshold: 80%)
- ✅ Build: Success
- ✅ Security: No issues
- ✅ Performance: No issues
- ✅ Completeness: All criteria met

**Status**: ✅ **Ready for review**

## Output Format

```json
{
  "verification_status": "pass",
  "implementation_complete": true,
  "linter_results": {
    "tool": "eslint",
    "status": "pass",
    "errors": 0,
    "warnings": 0
  },
  "type_check_results": {
    "tool": "tsc",
    "status": "pass",
    "errors": 0
  },
  "test_results": {
    "tool": "jest",
    "status": "pass",
    "total": 45,
    "passed": 45,
    "failed": 0,
    "duration": "3.52s"
  },
  "coverage_results": {
    "overall": {
      "statements": 92.5,
      "branches": 88.3,
      "functions": 95.2,
      "lines": 91.8
    },
    "meets_threshold": true,
    "threshold": 80.0
  },
  "build_results": {
    "status": "pass",
    "duration": "12.5s"
  },
  "security_results": {
    "status": "pass",
    "vulnerabilities": 0
  },
  "performance_results": {
    "status": "pass",
    "issues": []
  },
  "completeness_results": {
    "status": "complete",
    "plan_steps_completed": "8/8",
    "acceptance_criteria_met": "6/6"
  },
  "issues_found": [],
  "quality_summary": {
    "linter": "✅ Pass",
    "type_checker": "✅ Pass",
    "tests": "✅ Pass (45/45)",
    "coverage": "✅ 92.5% (threshold: 80%)",
    "build": "✅ Success",
    "security": "✅ No issues",
    "performance": "✅ No issues",
    "completeness": "✅ Complete"
  },
  "next_steps": "Ready for code review (/review-code)"
}
```

## Success Criteria

- ✅ Linter passes (0 errors)
- ✅ Type checker passes (0 errors)
- ✅ All tests pass
- ✅ Coverage meets threshold (80%+)
- ✅ Build succeeds
- ✅ No security issues identified
- ✅ No performance issues identified
- ✅ Implementation complete vs plan
- ✅ All issues documented with resolutions

## Rules

**DO**:
- ✅ Run all automated checks
- ✅ Capture actual output from tools
- ✅ Provide specific error messages
- ✅ Give actionable resolution steps
- ✅ Check completeness against plan
- ✅ Fail fast on critical issues

**DON'T**:
- ❌ Don't skip checks
- ❌ Don't ignore warnings without justification
- ❌ Don't proceed if tests fail
- ❌ Don't accept coverage below threshold
- ❌ Don't ignore security issues
- ❌ Don't mark complete if plan not fully implemented

