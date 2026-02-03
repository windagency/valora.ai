# Test Coverage Validation Gate

## Quality Gate: Automated Test Coverage Validation

**Purpose**: Enforce minimum test coverage thresholds before code can proceed to review/merge.

---

## Coverage Thresholds

### Tier 1: Critical Thresholds (MUST PASS)

| Metric | Threshold | Status |
|--------|-----------|--------|
| **Overall Line Coverage** | >= 80% | [ ] PASS / [ ] FAIL |
| **Overall Branch Coverage** | >= 70% | [ ] PASS / [ ] FAIL |
| **Overall Function Coverage** | >= 85% | [ ] PASS / [ ] FAIL |
| **New Code Coverage** | >= 90% | [ ] PASS / [ ] FAIL |

### Tier 2: File-Level Thresholds

| File Type | Line Coverage | Branch Coverage |
|-----------|---------------|-----------------|
| **Service/Business Logic** | >= 85% | >= 75% |
| **Controllers/Routes** | >= 80% | >= 70% |
| **Utilities/Helpers** | >= 90% | >= 80% |
| **Models/Types** | >= 70% | >= 60% |
| **Config/Setup** | >= 50% | >= 40% |

### Tier 3: Critical Path Coverage (MUST BE 100%)

These paths MUST have complete test coverage:

- [ ] Authentication flows (login, logout, token refresh)
- [ ] Authorization checks (permission validation)
- [ ] Payment processing (if applicable)
- [ ] Data validation (input sanitisation)
- [ ] Error handling (catch blocks, error responses)
- [ ] Security-sensitive operations

---

## Test Type Requirements

### Unit Tests

| Requirement | Target | Status |
|-------------|--------|--------|
| Test count per function | >= 3 tests | [ ] |
| Happy path tested | Required | [ ] |
| Error cases tested | >= 2 per function | [ ] |
| Edge cases tested | >= 1 per function | [ ] |
| Boundary conditions | Required for numeric inputs | [ ] |

### Integration Tests

| Requirement | Target | Status |
|-------------|--------|--------|
| API endpoints | 100% covered | [ ] |
| Database operations | 100% covered | [ ] |
| External service calls | Mocked and tested | [ ] |
| Cross-service flows | >= 80% covered | [ ] |

### E2E Tests (When Applicable)

| Requirement | Target | Status |
|-------------|--------|--------|
| Critical user journeys | 100% covered | [ ] |
| Authentication flows | Required | [ ] |
| Happy path scenarios | Required | [ ] |
| Error recovery | >= 50% covered | [ ] |

---

## Quality Metrics

### Test Quality Score Calculation

```
Score = (
  Line Coverage * 0.3 +
  Branch Coverage * 0.25 +
  Function Coverage * 0.2 +
  New Code Coverage * 0.15 +
  Test Type Diversity * 0.10
) * 100

Test Type Diversity = (
  Has Unit Tests * 0.5 +
  Has Integration Tests * 0.3 +
  Has E2E Tests * 0.2
)
```

### Score Thresholds

| Score | Grade | Action |
|-------|-------|--------|
| >= 80 | A | PASS - Proceed to review |
| 70-79 | B | WARN - Proceed with recommendations |
| 60-69 | C | WARN - Requires justification |
| 50-59 | D | FAIL - Must improve coverage |
| < 50 | F | FAIL - Insufficient testing |

---

## Validation Commands

### Quick Validation (~2 min)

```bash
# Run coverage check
pnpm test:coverage

# Check thresholds
pnpm coverage:check --threshold=80
```

### Full Validation (~5 min)

```bash
# Run all tests with coverage
pnpm test --coverage --all

# Generate detailed report
pnpm coverage:report --format=json

# Validate against gates
pnpm coverage:gate --strict
```

### CI/CD Integration

```yaml
# .github/workflows/test.yml
coverage:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: pnpm test:coverage
    - run: pnpm coverage:gate --threshold=80
    - uses: codecov/codecov-action@v4
      with:
        fail_ci_if_error: true
```

---

## Coverage Gap Analysis

### Common Coverage Gaps

| Gap Type | Cause | Fix |
|----------|-------|-----|
| **Uncovered branches** | Missing edge case tests | Add tests for else/catch paths |
| **Uncovered functions** | New code without tests | Write tests before/with code |
| **Low integration coverage** | Missing API tests | Add supertest/request tests |
| **No E2E coverage** | Missing user journey tests | Add Playwright/Cypress tests |

### Prioritised Coverage Actions

1. **CRITICAL**: Cover all security-related code (auth, validation)
2. **HIGH**: Cover all business logic (services, calculations)
3. **MEDIUM**: Cover all API endpoints (controllers, routes)
4. **LOW**: Cover utility functions and helpers

---

## Exemptions

### Allowed Low-Coverage Files

| Pattern | Reason | Max Threshold |
|---------|--------|---------------|
| `*.config.ts` | Configuration files | 50% |
| `*.types.ts` | Type definitions only | 20% |
| `*.d.ts` | Declaration files | 0% |
| `index.ts` (exports only) | Re-exports | 0% |
| `*.mock.ts` | Test mocks | 0% |
| `*.fixture.ts` | Test fixtures | 0% |

### Exemption Request

To request coverage exemption:

```typescript
/* istanbul ignore next: [REASON] */
function exemptedFunction() {
  // Code that cannot be easily tested
}
```

Valid reasons:
- Platform-specific code (Windows/Mac/Linux)
- Error recovery that requires external failure
- Third-party library integration quirks
- Hardware-dependent functionality

---

## Reporting

### Coverage Report Format

```json
{
  "summary": {
    "lines": { "total": 1000, "covered": 850, "pct": 85.0 },
    "branches": { "total": 200, "covered": 150, "pct": 75.0 },
    "functions": { "total": 100, "covered": 90, "pct": 90.0 },
    "statements": { "total": 1100, "covered": 935, "pct": 85.0 }
  },
  "qualityScore": 82,
  "grade": "A",
  "status": "PASS",
  "newCodeCoverage": 92.5,
  "criticalPathsCovered": true,
  "gapsIdentified": [
    {
      "file": "src/services/payment.ts",
      "coverage": 75,
      "required": 85,
      "gap": 10,
      "priority": "HIGH"
    }
  ]
}
```

---

## Validation Checklist

### Pre-Submit Checklist

- [ ] All tests pass (`pnpm test`)
- [ ] Coverage meets threshold (`pnpm coverage:check`)
- [ ] No decrease in coverage from baseline
- [ ] New code has >= 90% coverage
- [ ] Critical paths are 100% covered
- [ ] No `istanbul ignore` without justification
- [ ] Integration tests for all API changes
- [ ] E2E tests for user-facing changes

### Quality Gate Decision

| All Tier 1 Pass | Score >= 60 | Decision |
|-----------------|-------------|----------|
| YES | YES | **PASS** |
| YES | NO | **WARN** - Improve test quality |
| NO | YES | **FAIL** - Must meet thresholds |
| NO | NO | **FAIL** - Comprehensive improvement needed |

---

## Expected Outcomes

With this validation gate:

- Test quality score increases from 40 to >= 70
- Coverage gaps identified before review
- Consistent coverage across codebase
- Critical paths always tested
- Faster feedback on test quality
