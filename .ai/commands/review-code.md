---
name: review-code
description: Perform comprehensive code quality review including standards, security, maintainability, and best practices validation
experimental: true
argument-hint: '<scope> [--severity=critical|high|medium|low] [--focus=security|performance|maintainability|all] [--checklist] [--auto-only]'
allowed-tools:
  - codebase_search
  - read_file
  - grep
  - list_dir
  - glob_file_search
  - run_terminal_cmd  # Required for modern CLI tools (jq, yq, rg, fd)
  - read_lints
  # MCP: GitHub for PR review context
  - mcp_github
  # MCP: AI-powered code analysis
  - mcp_serena
model: claude-opus-4.5
agent: lead
prompts:
  pipeline:
    - stage: context
      prompt: context.analyze-changes-for-review
      required: true
      inputs:
        scope: $ARG_1
        severity: $ARG_severity
        focus: $ARG_focus
      outputs:
        - changed_files
        - change_scope
        - review_focus_areas
        - risk_level
    - stage: review
      prompt: review.assess-code-quality
      required: true
      inputs:
        scope: $ARG_1
        severity: $ARG_severity
        focus: $ARG_focus
        changed_files: $STAGE_context.changed_files
        change_scope: $STAGE_context.change_scope
        review_focus_areas: $STAGE_context.review_focus_areas
        risk_level: $STAGE_context.risk_level
      outputs:
        - quality_score
        - issues_found
        - security_concerns
        - blocking_issues
        - review_decision
        - validation_results
    - stage: documentation
      prompt: documentation.generate-code-review-report
      required: true
      inputs:
        quality_score: $STAGE_review.quality_score
        issues_found: $STAGE_review.issues_found
        review_decision: $STAGE_review.review_decision
        blocking_issues: $STAGE_review.blocking_issues
        validation_results: $STAGE_review.validation_results
        changed_files: $STAGE_context.changed_files
      outputs:
        - review_report
        - recommendations
        - next_steps
  merge_strategy: sequential
  cache_strategy: none
  retry_policy:
    max_attempts: 1
    backoff_ms: 0
    retry_on: []
---

# Code Review Command

## Role

You are the **@lead** engineer conducting a comprehensive code quality review to ensure implementation meets production standards.

## Goal

Conduct thorough code quality review to ensure code adheres to:

- **Security** best practices and vulnerability prevention
- **Architecture** patterns and design principles
- **Performance** optimization and scalability
- **Maintainability** standards and code health
- **Standards** compliance (linting, formatting, conventions)
- **Type Safety** and contract correctness

Provide actionable feedback with prioritized recommendations.

## Context

```plaintext
$ARGUMENTS
```

**Argument Mapping**:

- `$ARG_1`: Review scope (file path, directory, git diff, or empty for current changes)
- `$ARG_severity`: Minimum severity level (critical|high|medium|low), defaults to "low" (show all)
- `$ARG_focus`: Focus area (security|performance|maintainability|all), defaults to "all"
- `$ARG_checklist`: Use REVIEW_CODE_CHECKLIST.md for quick binary validation (~3 min)
- `$ARG_auto_only`: Run automated checks only (tsc, lint, test) without manual review (~1 min)

## Process

This command executes a **three-stage pipeline** that orchestrates specialized prompts:

### Stage 1: Context Analysis

**Prompt**: `context.analyze-changes-for-review`

**Purpose**: Identify what changed and determine review focus

**Inputs**:

- `scope`: Review scope from $ARG_1 (file/directory/git diff)
- `severity`: Minimum severity filter from $ARG_severity
- `focus`: Focus area from $ARG_focus

**Outputs**:

- `changed_files`: List of files with change types and criticality
- `change_scope`: Categorization by functional area
- `review_focus_areas`: Prioritized areas for review
- `risk_level`: Calculated risk (low/medium/high/critical)

**Details**: See [`02_context/analyze-changes-for-review.md`](../.ai/prompts/02_context/analyze-changes-for-review.md)

---

### Stage 2: Quality Assessment

**Prompt**: `review.assess-code-quality`

**Purpose**: Orchestrate comprehensive quality validations

**This stage internally coordinates 6 specialized validation prompts**:

1. **`review.validate-security`** - Security vulnerabilities, OWASP compliance
2. **`review.validate-architecture`** - Design patterns, layer boundaries
3. **`review.validate-performance`** - Bottlenecks, efficiency, optimization
4. **`review.validate-maintainability`** - Complexity, code smells, technical debt
5. **`review.validate-standards-compliance`** - Linting, formatting, conventions
6. **`review.validate-type-safety`** - Type correctness, contract compliance

**Note**: These validation prompts are **NOT** separate pipeline stages. They are invoked internally by `assess-code-quality` which orchestrates their execution based on the focus area and aggregates their results.

**Execution**: Validations run in parallel within the prompt based on focus area

**Inputs**:

- `scope`: Review scope from $ARG_1
- `severity`: Minimum severity filter from $ARG_severity
- `focus`: Focus area from $ARG_focus
- `changed_files`: Files changed from context stage
- `change_scope`: Categorization from context stage
- `review_focus_areas`: Prioritized focus areas from context stage
- `risk_level`: Calculated risk level from context stage

**Outputs**:

- `quality_score`: Objective score (0-100)
- `issues_found`: Aggregated issues from all validations
- `security_concerns`: Critical security vulnerabilities
- `blocking_issues`: Issues preventing merge
- `review_decision`: APPROVE | REQUEST_CHANGES | BLOCK
- `validation_results`: Per-validation status

**Details**: See [`05_review/assess-code-quality.md`](../.ai/prompts/05_review/assess-code-quality.md)

---

### Stage 3: Report Generation

**Prompt**: `documentation.generate-code-review-report`

**Purpose**: Synthesize results into actionable review report

**Inputs**:

- `quality_score`: Overall quality score from review stage
- `issues_found`: Aggregated issues from review stage
- `review_decision`: Decision (APPROVE/REQUEST_CHANGES/BLOCK) from review stage
- `blocking_issues`: Critical blocking issues from review stage
- `validation_results`: Per-validation status from review stage
- `changed_files`: Files list from context stage (for report context)

**Outputs**:

- `review_report`: Complete markdown report
- `recommendations`: Prioritized action items
- `next_steps`: Clear path forward

**Details**: See [`07_documentation/generate-code-review-report.md`](../.ai/prompts/07_documentation/generate-code-review-report.md)

---

## Command Responsibilities

**The command itself**:

- ✅ Execute pipeline stages sequentially
- ✅ Pass data between stages via outputs/inputs
- ✅ Handle errors and retries per policy
- ✅ Save final report to `.ai/.history/review-code/`

**The command does NOT**:

- ❌ Contain detailed review logic (delegated to prompts)
- ❌ Implement validation algorithms (in specialized prompts)
- ❌ Generate report structure (in documentation prompt)

## Review Criteria

### Severity Levels

- **CRITICAL**: Security vulnerabilities, data loss risks, breaking changes
- **HIGH**: Major bugs, performance issues, architectural violations
- **MEDIUM**: Code smells, maintainability concerns, minor bugs
- **LOW**: Style inconsistencies, documentation gaps, optimizations

### Blocking Issues

Issues that **MUST** be fixed before merge:

- Critical/high security vulnerabilities (CVSS ≥ 7.0)
- Type errors in strict mode
- Major architectural violations
- Breaking changes without migration
- N+1 query problems
- Memory leaks in production code

### Quality Thresholds

- **Score ≥ 70**: Acceptable quality
- **Score < 70**: Needs improvement
- **No critical issues**: Required for approval
- **No blocking issues**: Required for merge

## Success Criteria

- ✅ All stages completed successfully
- ✅ Comprehensive review across all dimensions
- ✅ Blocking issues clearly identified
- ✅ Quality score calculated objectively
- ✅ Actionable recommendations provided
- ✅ Clear APPROVE/REQUEST_CHANGES/BLOCK decision
- ✅ Report saved for reference

## Integration Points

**Before this command**:

- `/test` must have passed successfully
- All tests must be green
- Coverage thresholds must be met

**After this command**:

- **If APPROVED**: Proceed to `/review-functional`
- **If REQUEST_CHANGES**: Return to `/implement`
- **If BLOCKED**: Address critical issues and re-review

**Recommended Next Step**:

- APPROVED → `/review-functional` to validate feature completeness
- CHANGES REQUESTED → `/implement` to address issues
- BLOCKED → Escalate architectural/security concerns

## Usage Examples

### Basic Usage

```bash
# Review current uncommitted changes (staged + unstaged)
valora review-code

# Review specific file
valora review-code src/api/auth.ts

# Review entire directory
valora review-code src/backend/

# Review multiple files
valora review-code src/api/auth.ts src/services/user.service.ts
```

### With Focus Areas

```bash
# Focus on security vulnerabilities only
valora review-code src/ --focus=security

# Focus on performance issues
valora review-code src/services/ --focus=performance

# Focus on maintainability and code quality
valora review-code --focus=maintainability

# Focus on architectural concerns only (after pre-check passes)
valora review-code --focus=architecture

# All focus areas (default)
valora review-code src/ --focus=all
```

### Architecture-Focused Review (After Pre-Check)

When automated pre-checks pass, use `--focus=architecture` for faster manual review:

```bash
# Run automated pre-checks first (~1.5 min)
valora pre-check

# Then focus on architecture only (~5 min instead of ~10 min)
valora review-code --focus=architecture
```

**Architecture Focus Areas**:
- Design patterns (SOLID, DRY, KISS)
- Layer boundaries (no cross-layer dependencies)
- Dependency injection (no hard dependencies)
- Adapter pattern for third-party libraries
- Domain model integrity
- API contract design
- Error handling strategy
- State management patterns

**Skipped in Architecture Focus** (already covered by pre-check):
- TypeScript compilation
- Linting errors
- Formatting issues
- Security vulnerabilities
- Basic test coverage

### With Severity Filtering

```bash
# Show only critical issues
valora review-code src/ --severity=critical

# Show critical and high severity issues
valora review-code src/ --severity=high

# Show medium severity and above
valora review-code src/ --severity=medium

# Show all issues (default)
valora review-code src/ --severity=low
```

### Combined Options

```bash
# Security review, only critical/high issues
valora review-code src/api/ --focus=security --severity=high

# Performance review of backend services
valora review-code src/backend/services/ --focus=performance --severity=medium

# Full review of auth module
valora review-code src/auth/ --focus=all --severity=low
```

### Git-based Reviews

```bash
# Review changes in current branch vs main
valora review-code main...HEAD

# Review specific commit range
valora review-code HEAD~3..HEAD

# Review changes in a feature branch
valora review-code main...feature/user-authentication
```

### Workflow Integration

```bash
# Typical workflow sequence after implementation:
valora implement     # Make code changes
valora assert        # Validate completeness
valora test          # Run tests
valora review-code   # Code quality review (this command)
valora review-functional  # Functional review (next step)
valora commit        # Create commit
valora create-pr     # Create pull request
```

## Output Artifacts

**Primary**: Code review report (markdown)
**Location**: `.ai/.history/review-code/REVIEW-[timestamp].md`

**Contents**:

- Executive summary with quality score
- Critical/high/medium/low issues
- Positive observations
- Quality metrics per category
- Prioritized recommendations
- Next steps and approval conditions

## Notes

- Command orchestrates; prompts implement
- Prompts are reusable across commands
- Parallel execution for performance
- Caching disabled for fresh review each time
- No retries (reviews should be deterministic)
- All logic delegated to specialized prompts

## Document Generation

**File**: `.ai/.history/review-code/REVIEW-[timestamp].md`

**Ask user**: "Would you like me to save the code review report?"

## Command Output Summary

Print the following summary at command completion:

**For APPROVED:**

```markdown
## ✅ Code Review: APPROVED

**Quality Score**: [XX]/100
**Decision**: APPROVED - Ready for functional review

### Review Summary
| Category        | Score | Issues |
| --------------- | ----- | ------ |
| Security        | [XX]  | 0      |
| Architecture    | [XX]  | 0      |
| Performance     | [XX]  | 0      |
| Maintainability | [XX]  | 0      |

### Positive Observations
- ✅ [Good practice observed]
- ✅ [Good practice observed]

### Document Generated
→ `.ai/.history/review-code/REVIEW-[timestamp].md`

### Next Step
→ `/review-functional` to validate feature completeness
```

**For REQUEST_CHANGES:**

```markdown
## 🔄 Code Review: CHANGES REQUESTED

**Quality Score**: [XX]/100
**Decision**: CHANGES REQUESTED - Issues must be addressed

### Issues Found
| Severity | Count | Category   |
| -------- | ----- | ---------- |
| High     | [N]   | [Category] |
| Medium   | [N]   | [Category] |
| Low      | [N]   | [Category] |

### Critical Issues
1. **[Issue]**: [Description]
   - Location: [file:line]
   - Fix: [Suggested fix]

### Document Generated
→ `.ai/.history/review-code/REVIEW-[timestamp].md`

### Next Step
→ `/implement` to address review feedback
```

**For BLOCKED:**

```markdown
## ❌ Code Review: BLOCKED

**Quality Score**: [XX]/100
**Decision**: BLOCKED - Critical issues require resolution

### Critical Blockers
1. **[Security/Architecture Issue]**: [Description]
   - Impact: [Why this is critical]
   - Required: [What must be done]

### Next Step
→ Escalate or major rework required
→ Consider revisiting `/plan` if architectural issues
```

---

## Quick Review Modes

To reduce code review time from ~10 min to ~3 min, use these quick modes:

### Auto-Only Mode (`--auto-only`)

Runs automated quality checks only, without manual review:

```bash
valora review-code --auto-only
```

**Duration**: ~1 minute

**Checks performed**:
- `pnpm tsc:check` - TypeScript compilation
- `pnpm lint` - ESLint validation
- `pnpm format --check` - Prettier formatting
- `pnpm test:quick` - Quick test suite
- `pnpm audit` - Security vulnerabilities

**Output**:
```markdown
## Automated Review: PASS

**Duration**: 0.8 min

### Check Results
| Check      | Status | Time |
| ---------- | ------ | ---- |
| TypeScript | PASS   | 12s  |
| Linting    | PASS   | 8s   |
| Formatting | PASS   | 3s   |
| Tests      | PASS   | 25s  |
| Security   | PASS   | 5s   |

### Next Step
→ Run `valora review-code --checklist` for quick manual review
→ Or run `valora review-code` for full review
```

### Checklist Mode (`--checklist`)

Uses REVIEW_CODE_CHECKLIST.md template for binary Y/N validation:

```bash
valora review-code --checklist
```

**Duration**: ~3 minutes

**Sections covered** (40 items total):
| Section          | Items | Critical |
| ---------------- | ----- | -------- |
| Automated Checks | 5     | Yes      |
| Security         | 5     | Yes      |
| Architecture     | 5     | No       |
| Code Quality     | 5     | No       |
| Error Handling   | 5     | No       |
| Performance      | 5     | No       |
| Testing          | 5     | No       |
| Maintainability  | 5     | No       |

**Quality gate**: 80% overall, 100% critical sections

**Output**:
```markdown
## Checklist Review: APPROVE

**Duration**: 2.5 min
**Score**: 36/40 (90%)

### Section Scores
| Section          | Passed | Total |
| ---------------- | ------ | ----- |
| Automated Checks | 5      | 5     |
| Security         | 5      | 5     |
| Architecture     | 4      | 5     |
| Code Quality     | 5      | 5     |
| Error Handling   | 5      | 5     |
| Performance      | 4      | 5     |
| Testing          | 4      | 5     |
| Maintainability  | 4      | 5     |

### Failed Items
- 3.4 - Adapter pattern not used for Stripe integration
- 6.3 - No caching for frequently accessed data
- 7.2 - Edge case for empty array not tested
- 8.3 - Duplicate validation logic in two files

### Decision: APPROVE (90% >= 80%)

### Next Step
→ `/review-functional` for feature validation
→ Consider addressing failed items in follow-up
```

### Combined Workflow

Use auto-only as a pre-filter, then checklist for quick review:

```bash
# Step 1: Automated checks (~1 min)
valora review-code --auto-only

# Step 2: Quick checklist review (~3 min)
valora review-code --checklist

# Step 3: Full review only if needed (~10 min)
valora review-code --focus=security
```

### Mode Comparison

| Mode           | Duration | Depth            | Use Case                      |
| -------------- | -------- | ---------------- | ----------------------------- |
| `--auto-only`  | ~1 min   | Automated tools  | CI integration, pre-commit    |
| `--checklist`  | ~3 min   | Binary checklist | Quick validation, iteration   |
| Full (default) | ~10 min  | Deep analysis    | Final review, complex changes |

### Workflow Integration

```
/implement
    |
    v
valora review-code --auto-only   <-- Automated gate (~1 min)
    |
    v (if PASS)
valora review-code --checklist   <-- Quick review (~3 min)
    |
    v (if APPROVE)
valora review-code               <-- Full review (optional, ~10 min)
    |
    v
/review-functional
```

### When to Use Each Mode

**Use `--auto-only`**:
- Before committing changes
- In CI/CD pipeline as first gate
- Quick iteration during development
- When you just want tooling feedback

**Use `--checklist`**:
- After automated checks pass
- For routine code changes
- When time is constrained
- Self-review before requesting human review

**Use full review**:
- For complex or high-risk changes
- Before major releases
- When training new team members
- For security-sensitive code
