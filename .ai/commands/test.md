---
name: test
description: Execute comprehensive test suites (unit, integration, e2e) to validate implementation correctness and quality
experimental: true
argument-hint: '[test-scope] [--type=unit|integration|e2e|all] [--coverage-threshold=80]'
allowed-tools:
  - codebase_search
  - read_file
  - grep
  - list_dir
  - glob_file_search
  - run_terminal_cmd
  # MCP: Browser automation for E2E tests
  - mcp_playwright
  # MCP: Cross-browser testing (optional)
  - mcp_browserstack
model: claude-haiku-4.5
agent: qa
prompts:
  pipeline:
    - stage: context
      prompt: test.analyze-test-infrastructure
      required: true
      inputs:
        test_scope: $ARG_1
      outputs:
        - test_framework
        - test_structure
        - existing_tests
    - stage: execution
      prompt: test.execute-tests
      required: true
      inputs:
        test_scope: $ARG_1
        test_type: $ARG_type
        coverage_threshold: $ARG_coverage_threshold
        test_framework: $STAGE_context.test_framework
        test_structure: $STAGE_context.test_structure
      outputs:
        - test_results
        - coverage_metrics
        - failed_tests
    - stage: analysis
      prompt: test.analyze-results
      required: true
      inputs:
        test_results: $STAGE_execution.test_results
        coverage_metrics: $STAGE_execution.coverage_metrics
        coverage_threshold: $ARG_coverage_threshold
      outputs:
        - quality_assessment
        - recommendations
  merge_strategy: sequential
  cache_strategy: none
  retry_policy:
    max_attempts: 2
    backoff_ms: 1000
    retry_on:
      - timeout
      - error
---

# Prompt Orchestration

## Role

Use the [agent] profile

## Goal

Execute comprehensive automated test suites to validate implementation correctness, quality, and adherence to specifications. Provide detailed analysis of test results, coverage metrics, and actionable recommendations for improvement.

## Rules

### Command Orchestration

1. **Execution Flow**
   - Execute pipeline stages sequentially (cannot parallelize test execution)
   - Pass outputs from each stage to the next
   - Continue execution even if tests fail (to gather complete results)
   - Aggregate all results into final report

2. **Scope Handling**
   - Apply test scope filter from `$ARG_1` if provided
   - Support file paths, directories, and patterns
   - Default to all tests if no scope specified

3. **Threshold Enforcement**
   - Use `$ARG_coverage_threshold` or default to 80%
   - Fail if coverage below threshold
   - Report gaps for files below threshold

4. **Decision Criteria**
   - **PASS**: All tests pass AND coverage meets threshold
   - **FAIL**: Any critical tests fail OR coverage significantly below threshold
   - **WARN**: Minor test failures OR coverage slightly below threshold

### Error Handling

- If test framework not found → provide installation instructions and FAIL
- If test configuration invalid → diagnose and suggest fixes, then FAIL
- If tests fail to run → report infrastructure error and FAIL
- If critical tests fail → classify by severity and FAIL with remediation plan
- If coverage below threshold → identify gaps and FAIL (or WARN based on margin)

## Context

```plaintext
$ARGUMENTS
```

## Process Steps

The test command orchestrates a three-stage pipeline:

1. **Analyze Test Infrastructure** → Detects test framework, configuration, and relevant test files
2. **Execute Test Suites** → Runs tests by type (unit, integration, e2e) and captures results
3. **Analyze Results** → Evaluates outcomes, assesses coverage, and provides recommendations

Each stage is implemented as a dedicated prompt (see `prompts/06_test/`).

### Pipeline Flow

```mermaid
flowchart LR
    A[test.analyze-test-infrastructure] --> B[test.execute-tests]
    B --> C[test.analyze-results]
    C --> D{Pass?}
    D -->|Yes| E[/review-code]
    D -->|No| F[Fix & Retest]
```

### Expected Outputs

**Stage 1 Output**:

- Test framework identification (name, version, config)
- Test structure mapping (unit, integration, e2e locations)
- Existing test inventory
- Environment requirements

**Stage 2 Output**:

- Test execution results (pass/fail/skip counts, duration)
- Coverage metrics (statements, branches, functions, lines)
- Failed tests with stack traces
- Flaky test detection

**Stage 3 Output**:

- Quality assessment (overall status, failure severity)
- Coverage analysis (gaps, critical uncovered paths)
- Prioritized recommendations (high/medium/low priority)
- Next steps (proceed/fix/warn)

## Success Criteria

- ✅ All pipeline stages complete successfully
- ✅ Test framework detected and tests executed
- ✅ All critical tests pass (or classified failures provided)
- ✅ Coverage metrics generated and evaluated against threshold
- ✅ Quality assessment provided with actionable recommendations
- ✅ Clear pass/fail decision with justification

## Failure Conditions

- ❌ Test framework not found or not configured
- ❌ Test execution fails due to infrastructure issues
- ❌ Any critical tests fail without acceptable justification
- ❌ Coverage significantly below threshold with high-risk gaps
- ❌ Unable to generate comprehensive test report

---

**Recommended Next Step**:

- If **PASS** → `/review-code` to verify quality gates
- If **FAIL** → Address issues and re-run `/test`
- If **WARN** → Team decision based on risk assessment

## Command Output Summary

Print the following summary at command completion:

**For PASS:**

```markdown
## ✅ Tests: PASS

**Overall Status**: PASS
**Coverage**: [XX]% (threshold: 80%)

### Test Results
| Type | Pass | Fail | Skip |
|------|------|------|------|
| Unit | [N] | 0 | [N] |
| Integration | [N] | 0 | [N] |
| E2E | [N] | 0 | [N] |

### Coverage Summary
- **Statements**: [XX]%
- **Branches**: [XX]%
- **Functions**: [XX]%
- **Lines**: [XX]%

### Next Step
→ `/review-code` to verify code quality
```

**For FAIL:**

```markdown
## ❌ Tests: FAIL

**Overall Status**: FAIL
**Failures**: [N] tests failed

### Test Results
| Type | Pass | Fail | Skip |
|------|------|------|------|
| Unit | [N] | [N] | [N] |
| Integration | [N] | [N] | [N] |
| E2E | [N] | [N] | [N] |

### Failed Tests
1. **[test-name]**: [failure reason]
2. **[test-name]**: [failure reason]

### Next Step
→ Fix failing tests and re-run `/test`
```

**For WARN:**

```markdown
## ⚠️ Tests: WARN

**Overall Status**: WARN - Proceed with caution
**Coverage**: [XX]% (below threshold: 80%)

### Test Results
| Type | Pass | Fail | Skip |
|------|------|------|------|
| Unit | [N] | 0 | [N] |
| Integration | [N] | 0 | [N] |
| E2E | [N] | 0 | [N] |

### Warnings
- Coverage below threshold ([XX]% vs 80%)
- [Other warnings]

### Next Step
→ Team decision: proceed to `/review-code` or improve coverage
```
