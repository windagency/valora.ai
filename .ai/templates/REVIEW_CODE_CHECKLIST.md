# Code Review Checklist

**Scope**: [File paths or commit range]
**Reviewer**: [Agent/Human]
**Date**: [YYYY-MM-DD]

---

## Instructions

Quick binary validation for code review. Mark each item Y (Yes), N (No), or N/A (Not Applicable). Target completion: ~3 minutes.

**Pre-review automated checks** (run before manual review):
```bash
pnpm tsc:check && pnpm lint && pnpm test:quick
```

---

## 1. Automated Quality Checks (CRITICAL)

| # | Check | Status | Command |
|---|-------|--------|---------|
| 1.1 | TypeScript check passes | [ ] Y / [ ] N | `pnpm tsc:check` |
| 1.2 | Linting passes | [ ] Y / [ ] N | `pnpm lint` |
| 1.3 | Formatting correct | [ ] Y / [ ] N | `pnpm format --check` |
| 1.4 | Tests passing | [ ] Y / [ ] N | `pnpm test:quick` |
| 1.5 | No security vulnerabilities | [ ] Y / [ ] N | `pnpm audit` |

**Score**: [ ] / 5 items passed

**Auto-gate**: If any item is N, stop review and return to implementation.

---

## 2. Security Review (CRITICAL)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 2.1 | No hard-coded secrets/credentials | [ ] Y / [ ] N | |
| 2.2 | User input validated | [ ] Y / [ ] N / [ ] N/A | |
| 2.3 | SQL/injection prevention | [ ] Y / [ ] N / [ ] N/A | |
| 2.4 | XSS prevention (output escaped) | [ ] Y / [ ] N / [ ] N/A | |
| 2.5 | Auth/authz on protected routes | [ ] Y / [ ] N / [ ] N/A | |

**Score**: [ ] / [ ] applicable items passed

---

## 3. Architecture Compliance

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 3.1 | Follows existing patterns | [ ] Y / [ ] N | |
| 3.2 | No circular dependencies | [ ] Y / [ ] N | |
| 3.3 | Layer boundaries respected | [ ] Y / [ ] N | |
| 3.4 | Adapter pattern for third-party | [ ] Y / [ ] N / [ ] N/A | |
| 3.5 | Single responsibility (no God classes) | [ ] Y / [ ] N | |

**Score**: [ ] / [ ] applicable items passed

---

## 4. Code Quality

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 4.1 | No `any` without justification | [ ] Y / [ ] N | |
| 4.2 | No `@ts-ignore` without justification | [ ] Y / [ ] N | |
| 4.3 | Meaningful variable/function names | [ ] Y / [ ] N | |
| 4.4 | No magic numbers (use constants) | [ ] Y / [ ] N | |
| 4.5 | Functions under 50 lines | [ ] Y / [ ] N | |

**Score**: [ ] / 5 items passed

---

## 5. Error Handling

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 5.1 | Errors properly caught and handled | [ ] Y / [ ] N | |
| 5.2 | No swallowed errors (empty catch) | [ ] Y / [ ] N | |
| 5.3 | Meaningful error messages | [ ] Y / [ ] N | |
| 5.4 | Errors logged with context | [ ] Y / [ ] N | |
| 5.5 | Async errors handled (try/catch) | [ ] Y / [ ] N | |

**Score**: [ ] / 5 items passed

---

## 6. Performance

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 6.1 | No N+1 query problems | [ ] Y / [ ] N / [ ] N/A | |
| 6.2 | No memory leaks (cleanup done) | [ ] Y / [ ] N | |
| 6.3 | Appropriate caching used | [ ] Y / [ ] N / [ ] N/A | |
| 6.4 | No blocking operations in hot paths | [ ] Y / [ ] N | |
| 6.5 | Efficient algorithms (no O(n^2) where O(n) possible) | [ ] Y / [ ] N | |

**Score**: [ ] / [ ] applicable items passed

---

## 7. Testing

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 7.1 | Unit tests for new functions | [ ] Y / [ ] N | |
| 7.2 | Edge cases covered | [ ] Y / [ ] N | |
| 7.3 | Error cases tested | [ ] Y / [ ] N | |
| 7.4 | No skipped tests (.skip) | [ ] Y / [ ] N | |
| 7.5 | Coverage threshold met (>60%) | [ ] Y / [ ] N | |

**Score**: [ ] / 5 items passed

---

## 8. Maintainability

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 8.1 | Code is self-documenting | [ ] Y / [ ] N | |
| 8.2 | Complex logic has comments | [ ] Y / [ ] N / [ ] N/A | |
| 8.3 | No duplicate code | [ ] Y / [ ] N | |
| 8.4 | Props drilling < 3 levels | [ ] Y / [ ] N / [ ] N/A | |
| 8.5 | Dependencies injected | [ ] Y / [ ] N / [ ] N/A | |

**Score**: [ ] / [ ] applicable items passed

---

## Summary

| Section | Passed | Total | Critical |
|---------|--------|-------|----------|
| 1. Automated Checks | | 5 | Yes |
| 2. Security | | | Yes |
| 3. Architecture | | | No |
| 4. Code Quality | | 5 | No |
| 5. Error Handling | | 5 | No |
| 6. Performance | | | No |
| 7. Testing | | 5 | No |
| 8. Maintainability | | | No |
| **TOTAL** | | | |

---

## Verdict

**Minimum threshold**: 80% overall, critical sections 100%

| Result | Criteria |
|--------|----------|
| [ ] **APPROVE** | Critical sections 100% AND overall >= 80% |
| [ ] **REQUEST_CHANGES** | Overall >= 60% but critical issues or < 80% |
| [ ] **BLOCK** | Critical section failures OR overall < 60% |

---

## Pre-Review Automation Script

Run this before starting the manual review:

```bash
#!/bin/bash
# Quick automated review checks

echo "=== Running Automated Code Review Checks ==="

echo "1. TypeScript check..."
pnpm tsc:check || echo "FAIL: TypeScript errors"

echo "2. Linting..."
pnpm lint || echo "FAIL: Linting errors"

echo "3. Formatting..."
pnpm format --check || echo "FAIL: Formatting issues"

echo "4. Quick tests..."
pnpm test:quick || echo "FAIL: Test failures"

echo "5. Security audit..."
pnpm audit --audit-level=high || echo "WARN: Security vulnerabilities"

echo "=== Automated checks complete ==="
```

---

## Issues Found

| # | Severity | File:Line | Issue | Recommendation |
|---|----------|-----------|-------|----------------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

---

## Positive Observations

- [ ] Clean code structure
- [ ] Good test coverage
- [ ] Follows established patterns
- [ ] Well-documented
- [ ] Efficient implementation

---

## Review Decision

| Decision | Rationale |
|----------|-----------|
| [ ] **APPROVE** | Code meets quality standards, ready for functional review |
| [ ] **REQUEST_CHANGES** | Issues found that need addressing |
| [ ] **BLOCK** | Critical issues prevent merge |

---

## Next Step

- If APPROVE: `/review-functional` for feature validation
- If REQUEST_CHANGES: `/implement` to address feedback
- If BLOCK: Escalate or revisit `/plan`
