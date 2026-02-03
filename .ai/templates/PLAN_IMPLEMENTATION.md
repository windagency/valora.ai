# Implementation Plan: [TASK-ID] - [Task Title]

## Overview

**Task**: [Brief description of the task]
**Architecture Plan**: [Link to PLAN-ARCH-[TASK-ID].md]
**Date**: [YYYY-MM-DD]
**Author**: [Agent/Human]
**Estimated Effort**: [X story points / hours]
**Confidence Level**: [High/Medium/Low]

---

## 1. Implementation Steps

### Step 1: [Step Title]

**Objective**: [What this step achieves]

**Files to modify/create**:
| File Path | Action | Description |
|-----------|--------|-------------|
| `src/path/to/file.ts` | Create/Modify/Delete | [What changes] |
| `src/path/to/file.test.ts` | Create/Modify | [Test coverage] |

**Implementation details**:
```typescript
// Key code snippets or pseudocode
```

**Validation criteria**:
- [ ] [Specific outcome to verify]
- [ ] [Another outcome to verify]

**Rollback procedure**:
```bash
# Commands to revert this step
git revert <commit-hash>
```

---

### Step 2: [Step Title]

**Objective**: [What this step achieves]

**Depends on**: Step 1

**Files to modify/create**:
| File Path | Action | Description |
|-----------|--------|-------------|
| `src/path/to/file.ts` | Create/Modify/Delete | [What changes] |

**Implementation details**:
```typescript
// Key code snippets or pseudocode
```

**Validation criteria**:
- [ ] [Specific outcome to verify]
- [ ] [Another outcome to verify]

**Rollback procedure**:
```bash
# Commands to revert this step
```

---

### Step 3: [Step Title]

**Objective**: [What this step achieves]

**Depends on**: Step 1, Step 2

**Files to modify/create**:
| File Path | Action | Description |
|-----------|--------|-------------|
| `src/path/to/file.ts` | Create/Modify/Delete | [What changes] |

**Implementation details**:
```typescript
// Key code snippets or pseudocode
```

**Validation criteria**:
- [ ] [Specific outcome to verify]
- [ ] [Another outcome to verify]

**Rollback procedure**:
```bash
# Commands to revert this step
```

---

## 2. Dependency Map

### Execution Order

```
Step 1 ─────────────────────────────────┐
                                        │
Step 2 ─────────────────────────────────┼──▶ Step 4
                                        │
Step 3 ─────────────────────────────────┘
```

### Dependency Matrix

| Step | Depends On | Blocks | Can Parallelise With |
|------|------------|--------|----------------------|
| 1 | - | 2, 3, 4 | - |
| 2 | 1 | 4 | 3 |
| 3 | 1 | 4 | 2 |
| 4 | 2, 3 | - | - |

### External Dependencies

| Dependency | Type | Source | Status |
|------------|------|--------|--------|
| [Package X v2.0] | npm package | npm registry | [ ] Available |
| [API endpoint Y] | External API | [Service] | [ ] Ready |
| [Database migration] | Infrastructure | DevOps | [ ] Complete |

---

## 3. Risk Mitigations

### Per-Step Risks

| Step | Risk | Likelihood | Impact | Mitigation |
|------|------|------------|--------|------------|
| 1 | [Risk description] | [High/Med/Low] | [High/Med/Low] | [How to address] |
| 2 | [Risk description] | [High/Med/Low] | [High/Med/Low] | [How to address] |
| 3 | [Risk description] | [High/Med/Low] | [High/Med/Low] | [How to address] |

### Fallback Strategies

| Scenario | Trigger | Fallback Action |
|----------|---------|-----------------|
| [e.g., External API unavailable] | [API timeout > 30s] | [Use cached data / queue for retry] |
| [e.g., Migration fails] | [Error in migration script] | [Restore from backup] |
| [e.g., Performance regression] | [Response time > 500ms] | [Revert and profile] |

---

## 4. Testing Strategy

### Unit Tests

| Component | Test File | Coverage Target | Key Scenarios |
|-----------|-----------|-----------------|---------------|
| [Component A] | `component-a.test.ts` | 80% | [Happy path, error cases] |
| [Component B] | `component-b.test.ts` | 80% | [Edge cases, validation] |

### Integration Tests

| Integration | Test File | Setup Required | Key Scenarios |
|-------------|-----------|----------------|---------------|
| [API endpoints] | `api.integration.test.ts` | [Testcontainers DB] | [CRUD operations, auth] |
| [Service layer] | `service.integration.test.ts` | [Mock external APIs] | [Business workflows] |

### E2E Tests (if applicable)

| Flow | Test File | Setup Required | Key Scenarios |
|------|-----------|----------------|---------------|
| [User flow A] | `flow-a.spec.ts` | [Playwright, seeded DB] | [Complete user journey] |

### Test Commands

```bash
# Unit tests
pnpm test:suite:unit

# Integration tests
pnpm test:suite:integration

# E2E tests
pnpm test:suite:e2e

# All tests with coverage
pnpm test:coverage
```

---

## 5. Rollback Procedures

### Quick Rollback (< 5 minutes)

```bash
# Revert last commit
git revert HEAD --no-edit

# Or reset to previous state
git reset --hard <last-known-good-commit>

# Redeploy
pnpm deploy:rollback
```

### Database Rollback (if applicable)

```bash
# Revert migration
pnpm db:migrate:down

# Or restore from backup
pnpm db:restore --backup=<backup-id>
```

### Feature Flag Rollback (if applicable)

```bash
# Disable feature flag
pnpm feature-flag:disable <flag-name>
```

### Rollback Verification

| Check | Command | Expected Result |
|-------|---------|-----------------|
| Service health | `curl /health` | `200 OK` |
| Database state | `pnpm db:check` | `All migrations applied` |
| Error rate | [Monitoring dashboard] | `< 0.1%` |

---

## 6. Effort Breakdown

### Per-Step Estimates

| Step | Effort (Points) | Confidence | Notes |
|------|-----------------|------------|-------|
| 1 | [X] | [High/Med/Low] | [Any assumptions] |
| 2 | [X] | [High/Med/Low] | [Any assumptions] |
| 3 | [X] | [High/Med/Low] | [Any assumptions] |
| **Total** | **[Sum]** | **[Weighted avg]** | |

### Effort Distribution

| Activity | Percentage | Points |
|----------|------------|--------|
| Implementation | 50% | [X] |
| Testing | 30% | [X] |
| Documentation | 10% | [X] |
| Review/Iteration | 10% | [X] |

### Confidence Factors

| Factor | Status | Impact on Confidence |
|--------|--------|---------------------|
| Team familiarity with tech | [High/Med/Low] | [+/-/=] |
| Requirement clarity | [High/Med/Low] | [+/-/=] |
| Dependency availability | [High/Med/Low] | [+/-/=] |
| Similar past implementations | [Yes/No] | [+/-] |

---

## 7. Implementation Checklist

### Pre-Implementation

- [ ] Architecture plan approved
- [ ] Dependencies available
- [ ] Development environment ready
- [ ] Test data prepared

### Per-Step Validation

- [ ] Step 1 complete and validated
- [ ] Step 2 complete and validated
- [ ] Step 3 complete and validated
- [ ] All tests passing

### Post-Implementation

- [ ] All acceptance criteria met
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Ready for deployment

---

## Approval

| Role | Name | Status | Date |
|------|------|--------|------|
| Tech Lead | | [ ] Approved / [ ] Rejected | |
| QA Lead | | [ ] Approved / [ ] Rejected | |

**Next Step**: If approved, proceed to `/implement --plan=PLAN-IMPL-[TASK-ID].md`
