---
name: implement
description: Execute code changes following approved implementation plan, including code, tests, and documentation
experimental: true
argument-hint: '<implementation-plan> [--agent=<engineer-type>] [--mode=<standard|step-by-step>] [--step=<step-number>]'
allowed-tools:
  - codebase_search
  - read_file
  - write
  - search_replace
  - grep
  - list_dir
  - glob_file_search
  - run_terminal_cmd
  - delete_file
dynamic_agent_selection: true
fallback_agent: software-engineer-typescript
agent_selection_criteria:
  - analyze_task_description
  - analyze_affected_files
  - consider_dependencies
model: claude-sonnet-4.5
prompts:
  pipeline:
    - stage: context
      prompt: context.load-implementation-context
      required: true
      inputs:
        implementation_plan: $ARG_1
        agent_type: $ARG_agent
        mode: $ARG_mode
        current_step: $ARG_step
      outputs:
        - plan_summary
        - target_files
        - implementation_scope
        - dependencies
        - testing_strategy
        - agent_profile
    - stage: review
      prompt: code.validate-prerequisites
      required: true
      inputs:
        plan_summary: $STAGE_context.plan_summary
        dependencies: $STAGE_context.dependencies
      outputs:
        - prerequisites_met
        - missing_dependencies
        - environment_ready
        - blockers
    - stage: code
      prompt: code.implement-changes
      required: true
      inputs:
        implementation_scope: $STAGE_context.implementation_scope
        target_files: $STAGE_context.target_files
        mode: $ARG_mode
        step: $ARG_step
      outputs:
        - code_changes
        - files_modified
        - implementation_notes
        - breaking_changes
    - stage: test
      prompt: code.implement-tests
      required: true
      inputs:
        code_changes: $STAGE_code.code_changes
        testing_strategy: $STAGE_context.testing_strategy
      outputs:
        - test_files
        - test_coverage
        - test_results
    - stage: documentation
      prompt: documentation.update-inline-docs
      required: true
      inputs:
        code_changes: $STAGE_code.code_changes
        files_modified: $STAGE_code.files_modified
      outputs:
        - documentation_updated
        - inline_comments_added
        - type_annotations_complete
    - stage: verification
      prompt: code.verify-implementation
      required: true
      inputs:
        code_changes: $STAGE_code.code_changes
        test_files: $STAGE_test.test_files
        plan_summary: $STAGE_context.plan_summary
      outputs:
        - verification_status
        - linter_results
        - type_check_results
        - test_results
        - coverage_results
        - implementation_complete
        - issues_found
  merge_strategy: sequential
  rollback_on_failure: code
  cache_strategy: stage
  retry_policy:
    max_attempts: 2
    backoff_ms: 500
    retry_on:
      - error
      - validation_failed
---

# Implementation Command

## Role

### Agent Selection Based on Implementation Type

This command accepts an `--agent` parameter to specify which specialized engineer should perform the implementation. The agent determines the expertise, focus areas, and best practices applied.

| Implementation Type         | Agent Value (--agent=)                  | Expertise                                                             |
| --------------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| **Backend/API**             | `software-engineer-typescript-backend`  | Server-side logic, APIs, databases, business logic, data processing   |
| **Frontend/UI**             | `software-engineer-typescript-frontend` | User interfaces, components, state management, accessibility, UX      |
| **Infrastructure/Platform** | `platform-engineer`                     | DevOps, CI/CD, containers, deployment, infrastructure-as-code         |
| **Security**                | `secops-engineer`                       | Security features, authentication, authorization, vulnerability fixes |

**Default**: `software-engineer-typescript-backend` (if `--agent` parameter is omitted)

**Usage Examples**:

```bash
# Backend implementation
implement <plan> --agent=software-engineer-typescript-backend

# Frontend implementation
implement <plan> --agent=software-engineer-typescript-frontend

# Infrastructure implementation
implement <plan> --agent=platform-engineer --mode=step-by-step

# Security implementation
implement <plan> --agent=secops-engineer
```

**Selection Criteria**:

- If implementing UI components, pages, or frontend features → `--agent=software-engineer-typescript-frontend`
- If implementing APIs, business logic, or database changes → `--agent=software-engineer-typescript-backend`
- If implementing infrastructure, deployment, or platform changes → `--agent=platform-engineer`
- If implementing security features or fixes → `--agent=secops-engineer`
- If implementation spans multiple areas → use primary area or split into multiple implementation passes

## Goal

**Execute the approved implementation plan** by writing production-quality code, comprehensive tests, and inline documentation. This command transforms the strategic plan into working software through systematic, validated code changes.

**Primary Objectives**:

1. **Validate prerequisites** - Ensure environment, dependencies, and context are ready
2. **Implement core changes** - Write clean, maintainable code following the plan
3. **Write comprehensive tests** - Ensure quality through unit, integration, and e2e tests
4. **Update documentation** - Add inline comments, docstrings, and code documentation
5. **Verify implementation** - Run linters, type checkers, and basic validation
6. **Maintain code quality** - Follow coding standards, patterns, and best practices
7. **Handle edge cases** - Address error conditions and boundary cases
8. **Ensure backwards compatibility** - Minimize breaking changes

**This command answers**: "How do we transform the plan into working, tested code?"

## Context

### Input Arguments

```plaintext
$ARGUMENTS
```

### Configuration Parameters

```structured
<details>
<summary>Implementation Configuration Options</summary>

**--agent** (default: software-engineer-typescript-backend)
- Specifies which specialized engineer profile to use
- Options:
  - `software-engineer-typescript-backend` - Backend/API implementation
  - `software-engineer-typescript-frontend` - Frontend/UI implementation
  - `platform-engineer` - Infrastructure/platform implementation
  - `secops-engineer` - Security implementation
- Determines expertise, patterns, and best practices applied
- Should match the primary area of the implementation

**--mode** (default: standard)
- `standard` - Complete implementation in single pass
- `step-by-step` - Incremental implementation, one step at a time
- Used when complexity requires careful, validated progression

**--step** (default: null, required for step-by-step mode)
- Step number to implement (1, 2, 3, etc.)
- Only applicable in step-by-step mode
- Each step is validated before proceeding to next

**--skip-tests** (default: false)
- Skip test implementation (NOT RECOMMENDED)
- Only use for prototyping or when tests exist
- Must be explicitly enabled

**--focus** (optional)
- `correctness` - Emphasize correctness and safety
- `performance` - Emphasize optimization
- `maintainability` - Emphasize code quality (default)
- `compatibility` - Emphasize backwards compatibility

**--dry-run** (default: false)
- Show planned changes without executing
- Useful for validation before actual implementation

</details>
```

### Available Context

The implementation process leverages:

- **Implementation plan** - Steps, dependencies, risks from planning phase
- **Codebase structure** - Existing patterns, conventions, architecture
- **Coding standards** - Language-specific best practices and style guides
- **Testing patterns** - Existing test structure and conventions
- **Dependencies** - Available libraries, frameworks, utilities

## Rules

The implementation follows a **pipeline-driven** approach where detailed instructions are contained in specialized prompts. Each stage has specific responsibilities:

### Pipeline Overview

1. **Context Stage** - Loads and parses implementation plan
2. **Validation Stage** - Verifies prerequisites and environment readiness
3. **Code Stage** - Implements production-quality code
4. **Testing Stage** - Writes comprehensive tests
5. **Documentation Stage** - Adds inline documentation
6. **Verification Stage** - Validates quality through automated checks

### Quality Standards (Applied in Prompts)

**Code Quality**: SOLID, DRY, KISS, YAGNI principles  
**Testing**: 80%+ coverage, AAA pattern, deterministic tests  
**Documentation**: Explain WHY not WHAT, complete function docs  
**Verification**: Linting, type checking, security, performance checks

All detailed standards and step-by-step instructions are contained in the pipeline prompts. Refer to individual prompts for specific guidance.

## Process Steps

The implementation process is orchestrated through a pipeline of specialized prompts. Each step is automated through dedicated prompts that contain detailed instructions.

> **Note on Multi-Area Implementations**: When implementation spans multiple areas (e.g., full-stack feature with both frontend and backend changes), consider one of these approaches:
>
> 1. **Sequential**: Complete backend implementation first, then frontend (or vice versa)
>
>    ```bash
>    implement <plan-backend> --agent=software-engineer-typescript-backend
>    implement <plan-frontend> --agent=software-engineer-typescript-frontend
>    ```
>
> 2. **Split Plan**: Break into separate implementation tasks per area, each with appropriate `--agent` parameter
> 3. **Primary Area**: Use `--agent` for the primary/most complex area
>
>    ```bash
>    implement <plan> --agent=software-engineer-typescript-backend  # If backend is primary
>    ```
>
> The planning phase should identify if implementation requires multiple specializations and recommend the approach.

### Pipeline Execution

The command executes these stages automatically via prompts:

1. **Load Implementation Context** (`context.load-implementation-context`)
   - Parses plan and extracts scope
   - Identifies agent specialization
   - Prepares focused context

2. **Validate Prerequisites** (`code.validate-prerequisites`)
   - Checks dependencies
   - Verifies environment setup
   - Identifies blockers

3. **Implement Changes** (`code.implement-changes`)
   - Writes production-quality code
   - Applies SOLID principles
   - Handles errors and edge cases

4. **Implement Tests** (`code.implement-tests`)
   - Writes comprehensive test suite
   - Achieves 80%+ coverage
   - Follows AAA pattern

5. **Update Documentation** (`documentation.update-inline-docs`)
   - Adds function documentation
   - Includes inline comments
   - Provides usage examples

6. **Verify Implementation** (`code.verify-implementation`)
   - Runs linters and type checkers
   - Executes tests
   - Validates completeness

**Detailed step-by-step instructions** are contained in each pipeline prompt. This keeps the command focused on orchestration while prompts handle execution details.

## Output Requirements

The verification stage automatically checks these criteria and reports results:

- ✅ All plan steps executed
- ✅ Code follows standards (linter pass)
- ✅ Tests comprehensive (80%+ coverage)
- ✅ All tests pass
- ✅ Documentation complete
- ✅ No code smells
- ✅ Error handling present
- ✅ Security reviewed
- ✅ Performance acceptable

**Automated validation** ensures quality before handoff to review phase.

### Implementation Summary Format

```markdown
# IMPLEMENTATION SUMMARY

## Overview
- **Task**: [Task description]
- **Mode**: [standard|step-by-step]
- **Step**: [N/A or step number]
- **Status**: [complete|in-progress|blocked]

## Changes Made

### Files Modified
- `path/to/file1.ts` - [Brief description of changes]
- `path/to/file2.ts` - [Brief description of changes]

### Files Created
- `path/to/new-file.ts` - [Purpose of new file]

### Files Deleted
- `path/to/old-file.ts` - [Reason for deletion]

## Tests

### Test Files
- `path/to/test1.test.ts` - [Test scenarios covered]
- `path/to/test2.test.ts` - [Test scenarios covered]

### Test Results
- Unit Tests: ✅ X passed
- Integration Tests: ✅ X passed
- E2E Tests: ✅ X passed
- Coverage: X%

## Quality Checks

- Linter: ✅ Pass
- Type Checker: ✅ Pass
- Tests: ✅ Pass (X/X)
- Coverage: ✅ X% (threshold: 80%)

## Breaking Changes

[List any breaking changes, or "None"]

## Migration Steps

[List migration steps if breaking changes, or "N/A"]

## Notes

[Any important notes, caveats, or follow-up items]

## Next Steps

[Recommendation for next command: /assert, /test, /review-code, etc.]
```

### Handoff to Next Phase

The implementation becomes input to:

- **assert** - For completeness validation
- **test** - For comprehensive testing
- **review-code** - For code quality review
- **review-functional** - For functional validation

**Next Command Examples**:

```bash
# Verify implementation completeness
assert <implementation-summary>

# Run comprehensive test suite
test <implementation-summary>

# Code quality review (specify same agent if area-specific review needed)
review-code <implementation-summary> --agent=software-engineer-typescript-frontend

# Functional validation
review-functional <implementation-summary>
```

**Recommended Next Step**: `/assert` to verify implementation completeness, or `/test` if highly confident

## Metrics Collection

After implementation completes, emit quality metrics as JSON:

```typescript
quality_metrics: {
  lint_errors_realtime: number,      // Errors found during real-time validation (Step 3)
  auto_fixes_applied: number,        // Auto-fixes applied by ESLint --fix
  files_generated: number            // Count of files created during implementation
}
```

Store these in command outputs for session logging and metrics extraction.

## Command Output Summary

Print the following summary at command completion:

**For complete implementation:**

```markdown
## ✅ Implementation Complete

**Task**: [TASK-ID] - [Title]
**Mode**: [Standard | Step-by-step]
**Status**: Complete

### Changes Made
- **Files Modified**: [N]
- **Files Created**: [N]
- **Lines Changed**: +[N] / -[N]

### Quality Checks
- ✅ Linter: Pass
- ✅ Type Checker: Pass
- ✅ Build: Pass

### Next Step
→ `/assert` to validate implementation completeness
```

**For step-by-step progress:**

```markdown
## 🔄 Step [N] Complete

**Task**: [TASK-ID] - [Title]
**Progress**: Step [N] of [Total]

### Step Summary
- [What was implemented in this step]

### Files Changed
- [file1.ts] | +[N] -[N]
- [file2.ts] | +[N] -[N]

### Next Step
→ `/implement step-by-step --step=[N+1]` to continue implementation
```

**For blocked implementation:**

```markdown
## ❌ Implementation Blocked

**Task**: [TASK-ID] - [Title]
**Status**: Blocked

### Blocker Details
- [Description of what is blocking progress]

### Required Actions
- [Action needed to unblock]

### Next Step
→ Address blockers before continuing
```
