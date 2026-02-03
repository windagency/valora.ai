# TypeScript Assertion Checklist

**Scope**: [File paths or commit range]
**Date**: [YYYY-MM-DD]
**Validator**: [Agent/Human]

---

## Instructions

Quick TypeScript-specific validation. Mark each item Y (Yes), N (No), or N/A (Not Applicable). Target completion: ~2 minutes.

---

## 1. Type Safety (CRITICAL)

| # | Check | Status | Command/Notes |
|---|-------|--------|---------------|
| 1.1 | `pnpm tsc:check` passes | [ ] Y / [ ] N | `pnpm tsc:check` |
| 1.2 | No `any` types without justification | [ ] Y / [ ] N | `grep -r ": any"` |
| 1.3 | No `@ts-ignore` without justification | [ ] Y / [ ] N | `grep -r "@ts-ignore"` |
| 1.4 | No `as unknown as` casts | [ ] Y / [ ] N | `grep -r "as unknown as"` |
| 1.5 | Strict mode enabled in tsconfig | [ ] Y / [ ] N | Check `strict: true` |

**Score**: [ ] / 5 items passed

---

## 2. Naming Conventions

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 2.1 | Classes/Interfaces: PascalCase | [ ] Y / [ ] N | |
| 2.2 | Functions/Methods: camelCase | [ ] Y / [ ] N | |
| 2.3 | Constants: UPPER_SNAKE_CASE | [ ] Y / [ ] N | |
| 2.4 | Files: kebab-case.ts | [ ] Y / [ ] N | |
| 2.5 | No Hungarian notation (IInterface) | [ ] Y / [ ] N | |

**Score**: [ ] / 5 items passed

---

## 3. Code Quality

| # | Check | Status | Command/Notes |
|---|-------|--------|---------------|
| 3.1 | `pnpm lint` passes | [ ] Y / [ ] N | `pnpm lint` |
| 3.2 | `pnpm format` shows no changes | [ ] Y / [ ] N | `pnpm format --check` |
| 3.3 | No circular dependencies | [ ] Y / [ ] N | |
| 3.4 | Absolute imports used (path aliases) | [ ] Y / [ ] N | Check for `../../../` |
| 3.5 | No console.log in production code | [ ] Y / [ ] N | `grep -r "console.log"` |

**Score**: [ ] / 5 items passed

---

## 4. Type Definitions

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 4.1 | Interfaces for extensible objects | [ ] Y / [ ] N | |
| 4.2 | Types for unions/primitives | [ ] Y / [ ] N | |
| 4.3 | Function parameters explicitly typed | [ ] Y / [ ] N | |
| 4.4 | Public API return types explicit | [ ] Y / [ ] N | |
| 4.5 | No implicit any in function params | [ ] Y / [ ] N | |

**Score**: [ ] / 5 items passed

---

## 5. Modern Patterns

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 5.1 | Prefer `const` over `let` | [ ] Y / [ ] N | |
| 5.2 | Use functional array methods | [ ] Y / [ ] N | map/filter/reduce |
| 5.3 | Use object literal lookups | [ ] Y / [ ] N | Not switch for mappings |
| 5.4 | Use async/await (not callbacks) | [ ] Y / [ ] N | |
| 5.5 | Use optional chaining (?.) | [ ] Y / [ ] N | |

**Score**: [ ] / 5 items passed

---

## 6. Error Handling

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 6.1 | Custom error classes where appropriate | [ ] Y / [ ] N / [ ] N/A | |
| 6.2 | try/catch in async operations | [ ] Y / [ ] N | |
| 6.3 | Error types properly narrowed | [ ] Y / [ ] N | |
| 6.4 | No swallowed errors (empty catch) | [ ] Y / [ ] N | |
| 6.5 | Errors logged with context | [ ] Y / [ ] N | |

**Score**: [ ] / 5 items passed

---

## 7. Testing (Vitest)

| # | Check | Status | Command/Notes |
|---|-------|--------|---------------|
| 7.1 | Tests use Vitest (not Jest) | [ ] Y / [ ] N | |
| 7.2 | Test files: `*.test.ts` or `*.spec.ts` | [ ] Y / [ ] N | |
| 7.3 | `pnpm test:quick` passes | [ ] Y / [ ] N | `pnpm test:quick` |
| 7.4 | Coverage meets threshold (>60%) | [ ] Y / [ ] N | `pnpm test:coverage` |
| 7.5 | No skipped tests (.skip) committed | [ ] Y / [ ] N | `grep -r ".skip("` |

**Score**: [ ] / 5 items passed

---

## 8. Architecture Compliance

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 8.1 | Adapter pattern for third-party libs | [ ] Y / [ ] N / [ ] N/A | |
| 8.2 | Dependency injection used | [ ] Y / [ ] N / [ ] N/A | |
| 8.3 | No God classes (SRP violation) | [ ] Y / [ ] N | |
| 8.4 | Props drilling < 3 levels | [ ] Y / [ ] N / [ ] N/A | |
| 8.5 | Zod for input validation | [ ] Y / [ ] N / [ ] N/A | |

**Score**: [ ] / [ ] applicable items passed

---

## Summary

| Section | Passed | Total | Critical |
|---------|--------|-------|----------|
| 1. Type Safety | | 5 | Yes |
| 2. Naming Conventions | | 5 | No |
| 3. Code Quality | | 5 | Yes |
| 4. Type Definitions | | 5 | No |
| 5. Modern Patterns | | 5 | No |
| 6. Error Handling | | 5 | No |
| 7. Testing | | 5 | Yes |
| 8. Architecture | | | No |
| **TOTAL** | | | |

---

## Verdict

**Minimum threshold**: 80% overall, critical sections 100%

| Result | Criteria |
|--------|----------|
| [ ] **PASS** | Critical sections 100% AND overall >= 80% |
| [ ] **WARN** | Critical sections 100% AND overall >= 60% |
| [ ] **BLOCKED** | Any critical section < 100% OR overall < 60% |

---

## Quick Validation Commands

```bash
# Type check
pnpm tsc:check

# Lint
pnpm lint

# Format check
pnpm format --check

# Quick tests
pnpm test:quick

# Find any types
grep -rn ": any" src/ --include="*.ts" --include="*.tsx"

# Find ts-ignore
grep -rn "@ts-ignore" src/ --include="*.ts" --include="*.tsx"

# Find relative imports
grep -rn "from '\.\./\.\./\.\." src/ --include="*.ts" --include="*.tsx"
```

---

## Issues Found

| # | Severity | Issue | Location | Remediation |
|---|----------|-------|----------|-------------|
| 1 | | | | |
| 2 | | | | |

---

## Next Step

- If PASS: Proceed to `/test`
- If WARN: Address issues, then `/test`
- If BLOCKED: Return to `/implement`
