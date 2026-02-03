---
name: validate-parallel
description: Run assert and review-code commands in parallel to reduce validation time by ~50%
experimental: true
argument-hint: '[--quick] [--severity=<level>] [--focus=<area>]'
allowed-tools:
  - codebase_search
  - read_file
  - grep
  - list_dir
  - glob_file_search
  - run_terminal_cmd
model: claude-sonnet-4.5
agent: lead
prompts:
  pipeline:
    - stage: parallel-validation
      prompt: validation.run-parallel-checks
      required: true
      parallel: true
      inputs:
        quick_mode: $ARG_quick
        severity: $ARG_severity
        focus: $ARG_focus
      outputs:
        - assert_results
        - review_results
        - combined_verdict
        - blocking_issues
      timeout_ms: 300000
  merge_strategy: parallel
  cache_strategy: none
  retry_policy:
    max_attempts: 1
    backoff_ms: 0
    retry_on: []
---

# Parallel Validation Command

## Role

Use the **@lead** agent profile to orchestrate parallel validation.

## Goal

**Execute `assert` and `review-code` commands in parallel** to reduce total validation time by ~50%. This command combines both validation phases into a single concurrent execution.

**Time savings**: ~9 minutes per workflow (from ~18 min sequential to ~9 min parallel)

## Context

### Input Arguments

```plaintext
$ARGUMENTS
```

### Configuration Parameters

**--quick** (default: false)
- Use quick validation modes for both commands
- `assert --quick=all` + `review-code --checklist`
- Further reduces time: ~5 min total vs ~9 min

**--severity** (default: all)
- Filter issues by severity level
- Passed to both assert and review-code

**--focus** (default: all)
- Focus area for review-code
- Options: security, performance, maintainability, all

## Parallel Execution

### Standard Mode

Runs in parallel:
1. `valora assert --severity=<level>` (~9 min)
2. `valora review-code --severity=<level> --focus=<area>` (~10 min)

**Total time**: ~10 min (limited by slower command)

### Quick Mode (`--quick`)

Runs in parallel:
1. `valora assert --quick=all` (~5 min)
2. `valora review-code --checklist` (~3 min)

**Total time**: ~5 min (limited by slower command)

## Process

### Step 1: Launch Parallel Processes

```bash
# Standard mode
valora assert &
valora review-code &
wait

# Quick mode
valora assert --quick=all &
valora review-code --checklist &
wait
```

### Step 2: Collect Results

Both commands complete and results are merged:

- **Assert Results**: Completeness, correctness, compliance
- **Review Results**: Code quality, security, maintainability
- **Combined Verdict**: PASS / WARN / FAIL

### Step 3: Report Combined Results

Unified report showing both validation outcomes.

## Output Requirements

### Combined Validation Report

```markdown
## Parallel Validation Complete

**Mode**: [Standard / Quick]
**Duration**: [X] min (saved ~[Y] min vs sequential)

---

### Assert Results

**Status**: [PASS / WARN / FAIL]
**Score**: [XX]%

| Category     | Status      | Issues |
| ------------ | ----------- | ------ |
| Completeness | [PASS/FAIL] | [N]    |
| Correctness  | [PASS/FAIL] | [N]    |
| Compliance   | [PASS/FAIL] | [N]    |

### Review Results

**Status**: [APPROVE / REQUEST_CHANGES / BLOCK]
**Score**: [XX]/100

| Category     | Status      | Issues |
| ------------ | ----------- | ------ |
| Security     | [PASS/FAIL] | [N]    |
| Architecture | [PASS/FAIL] | [N]    |
| Code Quality | [PASS/FAIL] | [N]    |
| Performance  | [PASS/FAIL] | [N]    |

---

### Combined Verdict

**Overall**: [PASS / WARN / FAIL]

### Blocking Issues

[List of any blocking issues from either validation]

### Next Step

- If PASS: `/commit` to create commit
- If WARN: Address issues, then `/commit`
- If FAIL: `/implement` to fix issues
```

## Verdict Logic

| Assert | Review          | Combined |
| ------ | --------------- | -------- |
| PASS   | APPROVE         | **PASS** |
| PASS   | REQUEST_CHANGES | **WARN** |
| WARN   | APPROVE         | **WARN** |
| WARN   | REQUEST_CHANGES | **WARN** |
| FAIL   | Any             | **FAIL** |
| Any    | BLOCK           | **FAIL** |

## Usage Examples

### Standard Parallel Validation

```bash
valora validate-parallel
```

Runs both validations in parallel (~10 min).

### Quick Parallel Validation

```bash
valora validate-parallel --quick
```

Uses quick modes for faster validation (~5 min).

### With Filters

```bash
valora validate-parallel --severity=critical --focus=security
```

Focus on critical security issues only.

## Integration with Workflow

### Before

```bash
# Sequential (~18 min)
valora implement
valora assert           # ~9 min
valora review-code      # ~10 min (after assert)
valora commit
```

### After

```bash
# Parallel (~10 min)
valora implement
valora validate-parallel  # ~10 min (both in parallel)
valora commit
```

### With Quick Mode

```bash
# Quick parallel (~5 min)
valora implement
valora validate-parallel --quick  # ~5 min
valora commit
```

## Command Output Summary

Print the following summary at command completion:

```markdown
## ✅ Parallel Validation: PASS

**Duration**: 9.2 min (saved 8.8 min vs sequential)

### Results Summary

| Validation | Status  | Score  | Issues  |
| ---------- | ------- | ------ | ------- |
| Assert     | PASS    | 92%    | 2 minor |
| Review     | APPROVE | 85/100 | 3 low   |

### Time Breakdown

| Command             | Duration    | Mode     |
| ------------------- | ----------- | -------- |
| assert              | 8.5 min     | standard |
| review-code         | 9.2 min     | standard |
| **Total**           | **9.2 min** | parallel |
| Sequential would be | 17.7 min    | -        |
| **Saved**           | **8.5 min** | -        |

### Next Step
→ `/commit` to create commit
```

## Notes

- Commands run truly in parallel using background processes
- Results are collected and merged after both complete
- Either command failing causes combined failure
- Quick mode further reduces time with template-based validation
- No additional dependencies required
