---
name: pre-check
description: Run automated code quality pre-checks (linting, type validation, security audit) before manual review to reduce review time by 50%
experimental: true
argument-hint: '[--fix] [--strict] [--ci] [--report-format=summary|detailed|json]'
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
    - stage: execute
      prompt: test.execute-pre-checks
      required: true
      inputs:
        fix: $ARG_fix
        strict: $ARG_strict
        ci: $ARG_ci
      outputs:
        - check_results
        - issues_found
        - auto_fixes_applied
        - overall_status
    - stage: report
      prompt: test.generate-precheck-report
      required: true
      inputs:
        check_results: $STAGE_execute.check_results
        issues_found: $STAGE_execute.issues_found
        report_format: $ARG_report_format
      outputs:
        - precheck_report
        - recommendations
  merge_strategy: sequential
  cache_strategy: none
---

# Pre-Check Command

## Role

Use the [agent] profile (@qa)

## Goal

**Run automated code quality pre-checks before manual review** to catch common issues early and allow reviewers to focus on architectural concerns. This reduces manual review time from ~10 min to ~5 min by eliminating time spent on automated-detectable issues.

**Primary Objectives**:

1. **TypeScript validation** - Catch type errors and compilation issues
2. **Linting** - Enforce code style and common error patterns
3. **Formatting** - Verify consistent code formatting
4. **Security audit** - Detect known vulnerabilities in dependencies
5. **Quick tests** - Run fast unit tests to catch regressions
6. **Build verification** - Ensure code compiles successfully

**This command answers**: "Is the code ready for manual architectural review?"

## Context

### Input Arguments

```plaintext
$ARGUMENTS
```

### Configuration Parameters

```structured
<details>
<summary>Pre-Check Configuration</summary>

**--fix** (default: false)
- Automatically fix issues where possible
- Applies ESLint auto-fixes, Prettier formatting
- Does NOT fix TypeScript errors (require manual attention)

**--strict** (default: false)
- Enable strict mode with zero tolerance for warnings
- Treats warnings as errors
- Requires 100% lint pass

**--ci** (default: false)
- CI/CD mode with machine-readable output
- Non-interactive, fails fast
- Outputs JSON for pipeline integration

**--report-format** (default: summary)
- `summary` - Brief pass/fail with key metrics
- `detailed` - Full issue breakdown with locations
- `json` - Machine-readable JSON format

</details>
```

## Rules

### Automated Checks

The following checks are executed in parallel:

| Check           | Command                             | Purpose                    | Duration |
| --------------- | ----------------------------------- | -------------------------- | -------- |
| **TypeScript**  | `pnpm tsc:check`                    | Type validation            | ~12s     |
| **ESLint**      | `pnpm lint`                         | Code quality rules         | ~8s      |
| **Prettier**    | `pnpm format --check`               | Code formatting            | ~3s      |
| **Security**    | `pnpm audit --audit-level=moderate` | Dependency vulnerabilities | ~5s      |
| **Quick Tests** | `pnpm test:quick`                   | Fast unit tests            | ~20s     |
| **Build**       | `pnpm build`                        | Compilation check          | ~15s     |

**Total duration**: ~1-2 minutes (parallel execution)

### Check Priority

| Priority | Check                    | Must Pass               |
| -------- | ------------------------ | ----------------------- |
| CRITICAL | TypeScript               | Yes                     |
| CRITICAL | Security (high/critical) | Yes                     |
| HIGH     | ESLint errors            | Yes                     |
| MEDIUM   | Prettier formatting      | No (auto-fixable)       |
| MEDIUM   | ESLint warnings          | No (in non-strict mode) |
| LOW      | Quick tests              | Depends on change scope |

### Decision Criteria

| TypeScript | Lint Errors | Security | Decision |
| ---------- | ----------- | -------- | -------- |
| PASS       | 0           | PASS     | **PASS** |
| PASS       | 0           | WARN     | **WARN** |
| PASS       | > 0         | *        | **FAIL** |
| FAIL       | *           | *        | **FAIL** |

## Process Steps

### Step 1: Run Parallel Checks

Execute all automated checks in parallel for speed.

```bash
# Run all checks in parallel
pnpm tsc:check &
pnpm lint &
pnpm format --check &
pnpm audit --audit-level=moderate &
pnpm test:quick &
wait
```

### Step 2: Collect Results

Aggregate results from all checks.

```json
{
  "typescript": {
    "status": "PASS",
    "errors": 0,
    "duration": "12.3s"
  },
  "eslint": {
    "status": "PASS",
    "errors": 0,
    "warnings": 3,
    "duration": "8.1s"
  },
  "prettier": {
    "status": "FAIL",
    "files_unformatted": 2,
    "duration": "3.2s"
  },
  "security": {
    "status": "WARN",
    "vulnerabilities": {
      "critical": 0,
      "high": 0,
      "moderate": 2,
      "low": 5
    },
    "duration": "5.4s"
  },
  "tests": {
    "status": "PASS",
    "passed": 45,
    "failed": 0,
    "skipped": 2,
    "duration": "20.1s"
  }
}
```

### Step 3: Apply Auto-Fixes (if --fix)

When `--fix` is enabled:

```bash
# Apply ESLint auto-fixes
pnpm lint --fix

# Apply Prettier formatting
pnpm format

# Re-run checks to verify fixes
pnpm lint
pnpm format --check
```

### Step 4: Generate Report

Output pre-check report in requested format.

## Output Requirements

### Summary Report (Default)

```markdown
## Pre-Check: PASS

**Duration**: 1.2 min
**Ready for**: Manual architectural review

### Check Results
| Check       | Status | Time |
| ----------- | ------ | ---- |
| TypeScript  | ✅ PASS | 12s  |
| ESLint      | ✅ PASS | 8s   |
| Prettier    | ✅ PASS | 3s   |
| Security    | ⚠️ WARN | 5s   |
| Quick Tests | ✅ PASS | 20s  |

### Warnings
- 2 moderate vulnerabilities in dependencies (non-blocking)
- 3 ESLint warnings (style suggestions)

### Next Step
→ `valora review-code --focus=architecture` for manual review
```

### Detailed Report

```markdown
## Pre-Check: FAIL

**Duration**: 1.5 min
**Status**: Fix required before review

### Check Results
| Check       | Status | Errors  | Warnings |
| ----------- | ------ | ------- | -------- |
| TypeScript  | ❌ FAIL | 3       | 0        |
| ESLint      | ⚠️ WARN | 0       | 5        |
| Prettier    | ❌ FAIL | 2 files | -        |
| Security    | ✅ PASS | 0       | 2        |
| Quick Tests | ✅ PASS | 45/45   | -        |

### TypeScript Errors (3)
1. `src/services/user.ts:45` - Property 'email' does not exist on type 'void'
2. `src/services/user.ts:67` - Argument of type 'string' is not assignable to parameter of type 'number'
3. `src/controllers/auth.ts:23` - Cannot find name 'userService'

### ESLint Warnings (5)
1. `src/utils/format.ts:12` - Unexpected console statement (no-console)
2. `src/utils/format.ts:34` - Unexpected any type (@typescript-eslint/no-explicit-any)
...

### Unformatted Files (2)
- `src/services/user.ts`
- `src/controllers/auth.ts`

### Actions Required
1. Fix TypeScript errors (manual)
2. Run `pnpm format` to fix formatting (auto-fixable)
3. Review ESLint warnings (optional)

### Quick Fix
```bash
pnpm format  # Fix formatting
```

### Next Step
→ Fix TypeScript errors, then re-run `valora pre-check`
```

### JSON Report (for CI/CD)

```json
{
  "status": "PASS",
  "duration_seconds": 72,
  "ready_for_review": true,
  "checks": {
    "typescript": {
      "status": "PASS",
      "errors": 0,
      "duration_seconds": 12
    },
    "eslint": {
      "status": "PASS",
      "errors": 0,
      "warnings": 3,
      "duration_seconds": 8
    },
    "prettier": {
      "status": "PASS",
      "unformatted_files": 0,
      "duration_seconds": 3
    },
    "security": {
      "status": "WARN",
      "critical": 0,
      "high": 0,
      "moderate": 2,
      "low": 5,
      "duration_seconds": 5
    },
    "tests": {
      "status": "PASS",
      "passed": 45,
      "failed": 0,
      "skipped": 2,
      "duration_seconds": 20
    }
  },
  "recommendations": [
    "Consider upgrading lodash to fix moderate vulnerability",
    "Review 3 ESLint warnings for code quality improvement"
  ],
  "next_step": "valora review-code --focus=architecture"
}
```

## Success Criteria

- ✅ All checks executed successfully
- ✅ TypeScript compiles without errors
- ✅ No ESLint errors (warnings acceptable)
- ✅ No critical/high security vulnerabilities
- ✅ Quick tests pass
- ✅ Clear PASS/WARN/FAIL decision

## Failure Conditions

- ❌ TypeScript compilation fails
- ❌ ESLint reports errors (not warnings)
- ❌ Critical or high security vulnerabilities
- ❌ Quick tests fail
- ❌ Build fails

---

## Integration with Review Workflow

### Two-Phase Review Process

```
Phase 1: Automated Pre-Checks (~1-2 min)
    valora pre-check
        |
        v (if PASS)
Phase 2: Manual Architectural Review (~5 min)
    valora review-code --focus=architecture
        |
        v (if APPROVE)
    /review-functional
```

### Time Savings

| Review Type        | Before   | After   | Savings |
| ------------------ | -------- | ------- | ------- |
| Full Manual        | 10.2 min | -       | -       |
| Pre-Check Only     | -        | 1.5 min | N/A     |
| Architecture Only  | -        | 5 min   | N/A     |
| **Combined**       | 10.2 min | 6.5 min | **36%** |
| **With Checklist** | 10.2 min | 4.5 min | **56%** |

### Recommended Workflow

```bash
# After implementation
valora implement

# Phase 1: Automated pre-checks (~1.5 min)
valora pre-check

# If pre-check fails, fix and retry
valora pre-check --fix  # Auto-fix what's possible

# Phase 2: Manual architecture review (~5 min)
valora review-code --focus=architecture

# Continue to functional review
valora review-functional
```

### CI/CD Integration

```yaml
# .github/workflows/review.yml
jobs:
  pre-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: valora pre-check --ci --report-format=json > pre-check.json
      - uses: actions/upload-artifact@v4
        with:
          name: pre-check-report
          path: pre-check.json
```

## Command Output Summary

Print the following at command completion:

**For PASS:**

```markdown
## ✅ Pre-Check: PASS

**Duration**: 1.2 min
**Status**: Ready for manual review

### Check Results
| Check      | Status | Issues               |
| ---------- | ------ | -------------------- |
| TypeScript | ✅      | 0 errors             |
| ESLint     | ✅      | 0 errors, 3 warnings |
| Prettier   | ✅      | 0 files              |
| Security   | ✅      | 0 high/critical      |
| Tests      | ✅      | 45 passed            |

### Next Step
→ `valora review-code --focus=architecture` for manual review
→ Focus on: design patterns, layer boundaries, SOLID principles
```

**For WARN:**

```markdown
## ⚠️ Pre-Check: WARN

**Duration**: 1.4 min
**Status**: Proceed with caution

### Check Results
| Check      | Status | Issues                     |
| ---------- | ------ | -------------------------- |
| TypeScript | ✅      | 0 errors                   |
| ESLint     | ⚠️      | 0 errors, 8 warnings       |
| Security   | ⚠️      | 2 moderate vulnerabilities |

### Warnings
- ESLint: 8 style warnings (non-blocking)
- Security: 2 moderate vulnerabilities in dev dependencies

### Next Step
→ Proceed to `valora review-code --focus=architecture`
→ Consider addressing warnings in follow-up
```

**For FAIL:**

```markdown
## ❌ Pre-Check: FAIL

**Duration**: 0.8 min
**Status**: Must fix before review

### Failed Checks
| Check      | Status | Issues              |
| ---------- | ------ | ------------------- |
| TypeScript | ❌      | 3 errors            |
| Prettier   | ❌      | 2 unformatted files |

### TypeScript Errors
1. `src/services/user.ts:45` - Property 'email' does not exist
2. `src/services/user.ts:67` - Type mismatch
3. `src/controllers/auth.ts:23` - Cannot find name 'userService'

### Quick Fixes Available
```bash
pnpm format  # Fix 2 formatting issues
```

### Next Step
→ Fix TypeScript errors manually
→ Re-run `valora pre-check`
```

---

## Comparison with Existing Modes

| Command                                   | Duration | Purpose                          |
| ----------------------------------------- | -------- | -------------------------------- |
| `valora pre-check`                        | ~1.5 min | Standalone automated gate        |
| `valora review-code --auto-only`          | ~1 min   | Automated checks within review   |
| `valora review-code --checklist`          | ~3 min   | Quick manual checklist           |
| `valora review-code`                      | ~10 min  | Full comprehensive review        |
| `valora review-code --focus=architecture` | ~5 min   | Manual architectural review only |

### When to Use Each

**Use `valora pre-check`**:
- As first gate before any review
- In CI/CD pipelines
- Before committing changes
- For quick iteration during development

**Use `valora review-code --focus=architecture`** (after pre-check passes):
- For manual architectural review
- Focus on design decisions
- Skip automated concerns (already checked)
- Reduce manual review time by 50%
