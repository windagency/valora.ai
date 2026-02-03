# Plan Quality Checklist

**Plan**: [PLAN-ARCH-[TASK-ID].md / PLAN-IMPL-[TASK-ID].md]
**Reviewer**: [Name/Agent]
**Date**: [YYYY-MM-DD]

---

## Instructions

Complete this checklist before submitting a plan for approval. All items must be marked Y (Yes) or N (No). Plans with any N items should include remediation notes.

---

## 1. Dependencies Validation

| # | Criterion | Status | Evidence/Notes |
|---|-----------|--------|----------------|
| 1.1 | All technical dependencies identified with versions | [ ] Y / [ ] N | |
| 1.2 | All external service dependencies documented | [ ] Y / [ ] N | |
| 1.3 | Dependency availability confirmed | [ ] Y / [ ] N | |
| 1.4 | No circular dependencies present | [ ] Y / [ ] N | |
| 1.5 | Critical path dependencies marked | [ ] Y / [ ] N | |

**Dependencies Score**: [ ] / 5 items passed

---

## 2. Risk Assessment

| # | Criterion | Status | Evidence/Notes |
|---|-----------|--------|----------------|
| 2.1 | All high-impact risks identified | [ ] Y / [ ] N | |
| 2.2 | Each risk has mitigation strategy | [ ] Y / [ ] N | |
| 2.3 | Risk likelihood assessed | [ ] Y / [ ] N | |
| 2.4 | Risk impact assessed | [ ] Y / [ ] N | |
| 2.5 | Fallback strategies defined for critical risks | [ ] Y / [ ] N | |

**Risk Score**: [ ] / 5 items passed

---

## 3. Step Atomicity

| # | Criterion | Status | Evidence/Notes |
|---|-----------|--------|----------------|
| 3.1 | Each step has single clear objective | [ ] Y / [ ] N | |
| 3.2 | Each step includes specific file paths | [ ] Y / [ ] N | |
| 3.3 | Each step has validation criteria | [ ] Y / [ ] N | |
| 3.4 | Steps can be completed independently (where applicable) | [ ] Y / [ ] N | |
| 3.5 | Step order respects dependencies | [ ] Y / [ ] N | |

**Atomicity Score**: [ ] / 5 items passed

---

## 4. Testing Strategy

| # | Criterion | Status | Evidence/Notes |
|---|-----------|--------|----------------|
| 4.1 | Unit test coverage planned | [ ] Y / [ ] N | |
| 4.2 | Integration test coverage planned | [ ] Y / [ ] N | |
| 4.3 | E2E test coverage planned (if applicable) | [ ] Y / [ ] N | |
| 4.4 | Test scenarios cover happy path | [ ] Y / [ ] N | |
| 4.5 | Test scenarios cover error cases | [ ] Y / [ ] N | |

**Testing Score**: [ ] / 5 items passed

---

## 5. Rollback Procedures

| # | Criterion | Status | Evidence/Notes |
|---|-----------|--------|----------------|
| 5.1 | Quick rollback procedure documented | [ ] Y / [ ] N | |
| 5.2 | Database rollback procedure documented (if applicable) | [ ] Y / [ ] N | |
| 5.3 | Rollback verification steps defined | [ ] Y / [ ] N | |
| 5.4 | Rollback can be executed in < 15 minutes | [ ] Y / [ ] N | |
| 5.5 | No data loss scenarios identified | [ ] Y / [ ] N | |

**Rollback Score**: [ ] / 5 items passed

---

## 6. Effort Estimation

| # | Criterion | Status | Evidence/Notes |
|---|-----------|--------|----------------|
| 6.1 | Each step has effort estimate | [ ] Y / [ ] N | |
| 6.2 | Confidence level stated | [ ] Y / [ ] N | |
| 6.3 | Assumptions documented | [ ] Y / [ ] N | |
| 6.4 | Buffer for unknowns included | [ ] Y / [ ] N | |
| 6.5 | Historical comparison provided (if available) | [ ] Y / [ ] N | |

**Effort Score**: [ ] / 5 items passed

---

## 7. Architecture Alignment (Architecture Plans Only)

| # | Criterion | Status | Evidence/Notes |
|---|-----------|--------|----------------|
| 7.1 | Technology choices align with existing stack | [ ] Y / [ ] N | |
| 7.2 | Component boundaries clearly defined | [ ] Y / [ ] N | |
| 7.3 | Integration points documented | [ ] Y / [ ] N | |
| 7.4 | Constraints and trade-offs explicit | [ ] Y / [ ] N | |
| 7.5 | Go/no-go criteria defined | [ ] Y / [ ] N | |

**Architecture Score**: [ ] / 5 items passed

---

## Summary

| Section | Passed | Total | Percentage |
|---------|--------|-------|------------|
| 1. Dependencies | | 5 | |
| 2. Risk Assessment | | 5 | |
| 3. Step Atomicity | | 5 | |
| 4. Testing Strategy | | 5 | |
| 5. Rollback Procedures | | 5 | |
| 6. Effort Estimation | | 5 | |
| 7. Architecture Alignment | | 5 | |
| **TOTAL** | | **35** | |

---

## Quality Gate

**Minimum passing threshold**: 80% (28/35 items)

| Result | Criteria |
|--------|----------|
| [ ] **PASS** | >= 28 items passed AND no critical items failed |
| [ ] **CONDITIONAL PASS** | >= 25 items passed, remediation plan provided |
| [ ] **FAIL** | < 25 items passed OR critical items failed |

### Critical Items (Must Pass)

The following items are critical and must be marked Y:
- 2.2 - Each risk has mitigation strategy
- 3.2 - Each step includes specific file paths
- 5.1 - Quick rollback procedure documented

---

## Remediation Notes

| Item # | Issue | Remediation Action | Owner | Due |
|--------|-------|-------------------|-------|-----|
| | | | | |
| | | | | |

---

## Approval

| Role | Name | Decision | Date |
|------|------|----------|------|
| Reviewer | | [ ] Approved / [ ] Needs Work | |

**Next Step**:
- If PASS: Proceed to implementation
- If CONDITIONAL PASS: Address remediation items, then proceed
- If FAIL: Revise plan and re-submit for review
