# Completeness Assertion Checklist

**Scope**: [File paths or commit range]
**Date**: [YYYY-MM-DD]
**Validator**: [Agent/Human]

---

## Instructions

Quick binary validation of implementation completeness. Mark each item Y (Yes), N (No), or N/A (Not Applicable). Target completion: ~2 minutes.

---

## 1. Acceptance Criteria Coverage

| # | Criterion | Implemented | Tested | Notes |
|---|-----------|-------------|--------|-------|
| AC-1 | [Criterion from task] | [ ] Y / [ ] N | [ ] Y / [ ] N | |
| AC-2 | [Criterion from task] | [ ] Y / [ ] N | [ ] Y / [ ] N | |
| AC-3 | [Criterion from task] | [ ] Y / [ ] N | [ ] Y / [ ] N | |

**Coverage**: [ ] / [ ] criteria implemented ([ ]%)

---

## 2. Feature Completeness

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 2.1 | All required files created/modified | [ ] Y / [ ] N | |
| 2.2 | No placeholder/stub implementations | [ ] Y / [ ] N | |
| 2.3 | No TODO/FIXME comments in new code | [ ] Y / [ ] N | |
| 2.4 | All imports resolved | [ ] Y / [ ] N | |
| 2.5 | All exports properly defined | [ ] Y / [ ] N | |

**Score**: [ ] / 5 items passed

---

## 3. Error Handling

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 3.1 | Happy path implemented | [ ] Y / [ ] N | |
| 3.2 | Error cases handled | [ ] Y / [ ] N | |
| 3.3 | Edge cases considered | [ ] Y / [ ] N | |
| 3.4 | Validation for user input | [ ] Y / [ ] N | |
| 3.5 | Meaningful error messages | [ ] Y / [ ] N | |

**Score**: [ ] / 5 items passed

---

## 4. Integration Points

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 4.1 | API contracts satisfied | [ ] Y / [ ] N / [ ] N/A | |
| 4.2 | Database operations complete | [ ] Y / [ ] N / [ ] N/A | |
| 4.3 | External service calls implemented | [ ] Y / [ ] N / [ ] N/A | |
| 4.4 | Event handlers connected | [ ] Y / [ ] N / [ ] N/A | |
| 4.5 | Configuration values set | [ ] Y / [ ] N / [ ] N/A | |

**Score**: [ ] / [ ] applicable items passed

---

## 5. Test Coverage

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 5.1 | Unit tests for new functions | [ ] Y / [ ] N | |
| 5.2 | Integration tests for APIs | [ ] Y / [ ] N / [ ] N/A | |
| 5.3 | Edge case tests present | [ ] Y / [ ] N | |
| 5.4 | Error scenario tests | [ ] Y / [ ] N | |
| 5.5 | Tests are passing | [ ] Y / [ ] N | |

**Score**: [ ] / [ ] applicable items passed

---

## Summary

| Section | Passed | Total | Percentage |
|---------|--------|-------|------------|
| 1. Acceptance Criteria | | | |
| 2. Feature Completeness | | 5 | |
| 3. Error Handling | | 5 | |
| 4. Integration Points | | | |
| 5. Test Coverage | | | |
| **TOTAL** | | | |

---

## Verdict

**Minimum threshold**: 80% overall, 100% acceptance criteria

| Result | Criteria |
|--------|----------|
| [ ] **PASS** | >= 80% overall AND 100% acceptance criteria |
| [ ] **WARN** | >= 60% overall OR < 100% acceptance criteria |
| [ ] **BLOCKED** | < 60% overall OR critical items missing |

---

## Blocking Issues

| # | Issue | Location | Remediation |
|---|-------|----------|-------------|
| 1 | | | |
| 2 | | | |

---

## Next Step

- If PASS: Proceed to `/test`
- If WARN: Address issues, then `/test`
- If BLOCKED: Return to `/implement`
