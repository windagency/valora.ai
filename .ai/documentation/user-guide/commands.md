# Command Reference

> Complete reference for all 24 commands in VALORA.

## Global Flags

These flags can be used with any command:

| Flag                  | Short | Description                                                                                               |
| --------------------- | ----- | --------------------------------------------------------------------------------------------------------- |
| `--dry-run`           | `-n`  | Preview what would be executed without making changes. See [Dry Run Mode](./dry-run-mode.md) for details. |
| `--verbose`           | `-v`  | Enable verbose output with detailed logging                                                               |
| `--quiet`             | `-q`  | Suppress non-essential output                                                                             |
| `--interactive`       |       | Enable interactive mode with approval prompts (default: true)                                             |
| `--no-interactive`    |       | Disable interactive mode                                                                                  |
| `--model <name>`      |       | Override the default AI model                                                                             |
| `--agent <role>`      |       | Override the default agent                                                                                |
| `--provider <name>`   |       | Override the default LLM provider                                                                         |
| `--session-id <id>`   |       | Resume or use a specific session                                                                          |
| `--output <format>`   |       | Output format: markdown, json, yaml                                                                       |
| `--log-level <level>` |       | Set log level: debug, info, warn, error                                                                   |

### Example: Using Global Flags

```bash
# Preview implementation in dry-run mode
valora implement "Add feature" --dry-run

# Use a specific model with verbose output
valora plan "Refactor module" --model=claude-sonnet-4.5 --verbose

# Run quietly without interactive prompts
valora test --quiet --no-interactive
```

---

## Command Overview

| Command                      | Agent            | Model               | Description                                        |
| ---------------------------- | ---------------- | ------------------- | -------------------------------------------------- |
| `refine-specs`               | @product-manager | GPT-5 Thinking High | Collaboratively refine specifications              |
| `create-prd`                 | @product-manager | GPT-5 Thinking High | Generate PRD from specifications                   |
| `create-backlog`             | @product-manager | Claude Haiku 4.5    | Decompose PRD into tasks                           |
| `generate-docs`              | @lead            | Claude Haiku 4.5    | Generate technical documentation                   |
| `generate-all-documentation` | @lead            | Claude Sonnet 4.5   | Parallel documentation generation (5-7 min faster) |
| `fetch-task`                 | @product-manager | Claude Haiku 4.5    | Retrieve task from backlog                         |
| `refine-task`                | @product-manager | Claude Haiku 4.5    | Clarify task requirements                          |
| `gather-knowledge`           | @lead            | GPT-5 Thinking High | Analyse codebase context                           |
| `validate-parallel`          | @lead            | Claude Sonnet 4.5   | Run assert + review-code in parallel (~50% faster) |
| `plan`                       | @lead            | GPT-5 Thinking High | Create implementation plan                         |
| `plan-architecture`          | @lead            | Claude Sonnet 4.5   | Create high-level architecture plan (Phase 1)      |
| `plan-implementation`        | @lead            | Claude Sonnet 4.5   | Create detailed implementation plan (Phase 2)      |
| `validate-plan`              | @lead            | Claude Haiku 4.5    | Pre-review validation (catches 60-70% of issues)   |
| `validate-coverage`          | @qa              | Claude Haiku 4.5    | Test coverage validation gate with quality scoring |
| `pre-check`                  | @qa              | Claude Haiku 4.5    | Automated code quality pre-checks before review    |
| `review-plan`                | @lead            | GPT-5 Thinking High | Validate implementation plan                       |
| `implement`                  | Dynamic          | Claude Sonnet 4.5   | Execute code changes                               |
| `assert`                     | @asserter        | Claude Haiku 4.5    | Validate implementation                            |
| `test`                       | @qa              | Claude Haiku 4.5    | Execute test suites                                |
| `review-code`                | @lead            | Claude Sonnet 4.5   | Code quality review                                |
| `review-functional`          | @lead            | Claude Sonnet 4.5   | Functional review                                  |
| `commit`                     | @lead            | Claude Sonnet 4.5   | Create conventional commits                        |
| `create-pr`                  | @lead            | Claude Sonnet 4.5   | Generate pull request                              |
| `feedback`                   | @product-manager | Claude Haiku 4.5    | Capture outcomes                                   |

---

## Planning & Requirements

### refine-specs

Collaboratively refine product specifications through structured questioning.

```bash
valora refine-specs '<initial-concept>' [options]
```

**Options:**

| Option                  | Description                             |
| ----------------------- | --------------------------------------- |
| `--domain=<domain>`     | Target domain (backend, frontend, etc.) |
| `--stakeholders=<list>` | Comma-separated stakeholder list        |

**Example:**

```bash
valora refine-specs "User authentication system" --domain=backend
```

**Pipeline Stages:**

1. `context.understand-intent` - Extract initial understanding
2. `onboard.refine-specifications` - Generate clarifying questions
3. `review.validate-completeness` - Validate quality (≥90% target)
4. `onboard.collect-clarifications` - **Interactive**: Collect user answers
5. `documentation.apply-specification-refinement` - Write answers into FUNCTIONAL.md

**Interactive Stage:** When clarifying questions are generated, the pipeline pauses to collect user answers. These answers are incorporated into the final specification document with a "User Clarifications" section.

**Agent:** @product-manager
**Model:** GPT-5 Thinking High

---

### create-prd

Generate a comprehensive Product Requirements Document from refined specifications.

```bash
valora create-prd [options]
```

**Options:**

| Option                | Description                             |
| --------------------- | --------------------------------------- |
| `--specs-file=<path>` | Path to specifications file             |
| `--template=<type>`   | Template: standard, technical, business |

**Example:**

```bash
valora create-prd --template=technical
```

**Pipeline Stages:**

1. `context.load-specifications` - Load specs from file or knowledge-base
2. `onboard.analyze-requirements` - Decompose requirements, generate clarifying questions
3. `onboard.collect-clarifications` - **Interactive**: Collect user answers
4. `documentation.generate-prd` - Generate PRD with user clarifications applied
5. `review.validate-completeness` - Validate quality (≥95% target)

**Interactive Stage:** When requirements analysis generates clarifying questions, the pipeline pauses to collect user answers before generating the PRD.

**Agent:** @product-manager
**Model:** GPT-5 Thinking High

---

### create-backlog

Decompose Product Requirements Document into prioritised, actionable tasks.

```bash
valora create-backlog [options]
```

**Options:**

| Option                  | Description                    |
| ----------------------- | ------------------------------ |
| `--prd-file=<path>`     | Path to PRD file               |
| `--granularity=<level>` | Level: fine, medium, coarse    |
| `--format=<type>`       | Format: github, jira, markdown |

**Example:**

```bash
valora create-backlog --granularity=fine --format=github
```

**Agent:** @product-manager
**Model:** Claude Haiku 4.5

---

### generate-docs

Generate comprehensive technical documentation across infrastructure, backend, and frontend domains.

```bash
valora generate-docs [options]
```

**Options:**

| Option                | Description                                                       |
| --------------------- | ----------------------------------------------------------------- |
| `--domain=<domain>`   | Domain: infrastructure, backend, frontend, all (default: all)     |
| `--doc-type=<type>`   | Specific document type: HLD, API, ARCHITECTURE, etc.              |
| `--output-dir=<path>` | Output directory (default: knowledge-base/)                       |
| `--quick`             | Use quick templates for faster generation (~50% time reduction)   |
| `--extract-only`      | Run extraction phase only (generates DOC_EXTRACTION_CHECKLIST.md) |

**Quick Mode (`--quick`):**
Uses pre-built templates for faster documentation:

- `DOC_API_QUICK.md` - API documentation skeleton
- `DOC_COMPONENT_QUICK.md` - Component documentation
- Standard structures for all document types

**Extraction Mode (`--extract-only`):**
Generates extraction checklist with automated commands to extract documentation from code:

- API endpoints, data models, services
- Configuration, error handling, middleware
- Tests, dependencies, infrastructure

**Example:**

```bash
# Full generation
valora generate-docs --domain=backend

# Quick generation (~50% faster)
valora generate-docs --quick

# Extraction only
valora generate-docs --extract-only
```

**Target Documentation (15 files):**

| Domain             | Files                                                               |
| ------------------ | ------------------------------------------------------------------- |
| Infrastructure (6) | HLD.md, CONTAINER.md, DEPLOYMENT.md, LOGGING.md, LZ.md, WORKFLOW.md |
| Backend (5)        | ARCHITECTURE.md, API.md, DATA.md, TESTING.md, CODING-ASSERTIONS.md  |
| Frontend (4)       | ARCHITECTURE.md, DESIGN.md, TESTING.md, CODING-ASSERTIONS.md        |

**Pipeline Stages:**

1. **context** - Load PRD, FUNCTIONAL, BACKLOG, codebase
2. **analyze** - Plan documentation structure, identify diagrams
3. **generate-infra** - Generate 6 infrastructure docs (parallel)
4. **generate-backend** - Generate 5 backend docs (parallel)
5. **generate-frontend** - Generate 4 frontend docs (parallel)
6. **review** - Validate completeness (>= 85% threshold)
7. **persist** - Write files, create backups

**Prerequisites:**

- PRD.md exists in knowledge-base/
- FUNCTIONAL.md exists in knowledge-base/
- BACKLOG.md exists in knowledge-base/

**Agent:** @lead (orchestration), @platform-engineer (infra), @software-engineer-typescript-backend (backend), @software-engineer-typescript-frontend (frontend)
**Model:** Claude Haiku 4.5

---

### generate-all-documentation

Generate comprehensive technical documentation using parallel subprocesses, saving 5-7 minutes per workflow compared to sequential execution.

```bash
valora generate-all-documentation [options]
```

**Options:**

| Option                      | Description                                                     |
| --------------------------- | --------------------------------------------------------------- |
| `--output-dir=<path>`       | Output directory (default: knowledge-base/)                     |
| `--skip-review`             | Skip validation stage for fastest generation (~5.5 min)         |
| `--security-context=<path>` | Path to security requirements file for compliance documentation |
| `--cache-context`           | Use cached context from previous run (saves ~30s)               |

**Time Savings:**

| Stage              | Sequential  | Parallel        | Saved      |
| ------------------ | ----------- | --------------- | ---------- |
| Context + Analyse  | 105s        | 90s (merged)    | 15s        |
| Generate 3 Domains | 540s        | 240s (parallel) | 300s       |
| Review + Persist   | 210s        | 150s (merged)   | 60s        |
| **Total**          | **~14 min** | **~8 min**      | **~6 min** |

**Optimisation Strategies:**

1. **Merged Context + Analyse Stage** - Single stage instead of two
2. **True Parallel Domain Generation** - 3 subprocesses run concurrently
3. **Merged Review + Persist Stage** - Streaming validation and file writing
4. **Aggressive Caching** - 2-hour TTL, includes analysis results

**Pipeline Stages:**

1. **contextAndAnalyse** - Load documents + plan documentation (merged, ~90s)
2. **generateAll** - 3 parallel subprocesses for infra/backend/frontend (~240s)
3. **reviewAndPersist** - Validate + write files (merged, ~150s)

**Security Context Integration:**

When `--security-context` is provided:

- HLD.md includes full security architecture section
- DEPLOYMENT.md includes security gates
- LOGGING.md includes audit trail requirements
- LZ.md includes compliance implementation details

**Example:**

```bash
# Standard parallel generation (~8 min)
valora generate-all-documentation

# With cached context (~6.5 min)
valora generate-all-documentation --cache-context

# Fastest generation, skip review (~5.5 min)
valora generate-all-documentation --skip-review

# With security documentation
valora generate-all-documentation --security-context=.ai/security-requirements.json

# Custom output directory
valora generate-all-documentation --output-dir=docs/technical/
```

**Comparison with generate-docs:**

| Aspect           | generate-docs | generate-all-documentation |
| ---------------- | ------------- | -------------------------- |
| Pipeline stages  | 7             | 3                          |
| Duration         | ~14 min       | ~8 min                     |
| Time saved       | Baseline      | 5-7 min                    |
| Skip review      | No            | Yes                        |
| Security context | No            | Yes                        |
| Cache TTL        | 1 hour        | 2 hours                    |

**When to Use:**

- **generate-docs**: Single domain, quick templates, extraction mode, lower cost
- **generate-all-documentation**: Full suite, time-critical, cached context, security documentation

**Agent:** @lead (orchestration), @platform-engineer (infra), @software-engineer-typescript-backend (backend), @software-engineer-typescript-frontend (frontend)
**Model:** Claude Sonnet 4.5

---

### fetch-task

Retrieve and contextualise a task from the project backlog.

```bash
valora fetch-task [options]
```

**Options:**

| Option                | Description                                       |
| --------------------- | ------------------------------------------------- |
| `--task-id=<id>`      | Specific task ID                                  |
| `--keywords=<search>` | Fuzzy search keywords                             |
| `--priority=<level>`  | Priority: p0, p1, p2                              |
| `--domain=<area>`     | Domain: frontend, backend, infra, data, test, doc |

**Example:**

```bash
valora fetch-task --priority=p0 --domain=backend
```

**Agent:** @product-manager
**Model:** Claude Haiku 4.5

---

### refine-task

Clarify task requirements, acceptance criteria, and implementation details.

```bash
valora refine-task [options]
```

**Options:**

| Option                       | Description                  |
| ---------------------------- | ---------------------------- |
| `--task-id=<id>`             | Specific task ID             |
| `--interactive`              | Interactive mode             |
| `--acceptance-criteria-only` | Focus on acceptance criteria |

**Example:**

```bash
valora refine-task --interactive
```

**Pipeline Stages:**

1. `context.load-task` - Load task details from backlog
2. `onboard.analyze-clarity` - Calculate clarity score, identify gaps
3. `onboard.refine-requirements` - Generate clarifying questions
4. `review.validate-testability` - Validate acceptance criteria
5. `onboard.collect-clarifications` - **Interactive**: Collect user answers
6. `documentation.apply-task-refinement` - Apply answers to task document

**Interactive Stage:** When clarity gaps are identified, the pipeline pauses to collect user answers. These are incorporated into the refined task before proceeding to planning.

**Agent:** @product-manager
**Model:** Claude Haiku 4.5

---

### gather-knowledge

Analyse codebase, dependencies, patterns, and constraints.

```bash
valora gather-knowledge [options]
```

**Options:**

| Option              | Description                                     |
| ------------------- | ----------------------------------------------- |
| `--scope=<scope>`   | Scope: project, task                            |
| `--domain=<domain>` | Domain: backend, frontend, infrastructure, data |
| `--depth=<depth>`   | Depth: shallow, deep                            |

**Example:**

```bash
valora gather-knowledge --scope=task --domain=backend --depth=deep
```

**Agent:** @lead
**Model:** GPT-5 Thinking High

---

## Planning & Review

### plan

Analyse task and create detailed implementation plan.

```bash
valora plan '<task-description>' [options]
```

**Options:**

| Option                       | Description                                  |
| ---------------------------- | -------------------------------------------- |
| `--complexity-threshold=<n>` | Threshold for step-by-step mode (default: 5) |
| `--mode=<mode>`              | Mode: standard, incremental, tiered          |

**Modes:**

- `standard` - Single-pass implementation (complexity <= 5)
- `incremental` - Step-by-step implementation
- `tiered` - Two-phase: architecture → implementation (recommended for complexity > 5)
- `auto` - Automatically selects based on complexity score

**Pattern Templates:**
Use `--pattern` to accelerate planning with pre-built templates:

- `rest-api` - REST API endpoints (`PLAN_PATTERN_REST_API.md`)
- `react-feature` - React features/components (`PLAN_PATTERN_REACT_FEATURE.md`)
- `database` - Database schema/migrations (`PLAN_PATTERN_DATABASE.md`)
- `auth` - Authentication/authorization (`PLAN_PATTERN_AUTH.md`)
- `background-job` - Background jobs/workers (`PLAN_PATTERN_BACKGROUND_JOB.md`)

**Pipeline Stages:**

1. `context.load-task` - Load task details from backlog
2. `context.analyze-task-context` - Parse requirements, identify components
3. `plan.assess-complexity` - Evaluate complexity, generate questions
4. `plan.identify-dependencies` - Map dependencies, generate questions
5. `plan.assess-risks` - Identify risks, generate questions
6. `onboard.collect-clarifications` - **Interactive**: Collect user answers (aggregated from complexity, dependencies, risks)
7. `plan.breakdown-implementation` - Create implementation steps with user clarifications applied

**Interactive Stage:** Questions from complexity assessment, dependency analysis, and risk assessment are aggregated and presented to the user. Answers inform the final implementation breakdown.

**Example:**

```bash
valora plan "Add OAuth authentication" --mode=tiered

# Using pattern templates
valora plan "Add users API" --pattern=rest-api
valora plan "Add dashboard" --pattern=react-feature
```

**Agent:** @lead
**Model:** GPT-5 Thinking High

---

### plan-architecture

Create high-level architectural plan (Phase 1 of tiered planning).

```bash
valora plan-architecture [options]
```

**Options:**

| Option                  | Description                  |
| ----------------------- | ---------------------------- |
| `--task-id=<id>`        | Task ID to load from backlog |
| `--backlog-file=<path>` | Path to backlog file         |

**Output:** `knowledge-base/PLAN-ARCH-[TASK-ID].md`

**Covers:**

- Technology choices with rationale
- Component boundaries and responsibilities
- Integration points mapping
- Constraints and trade-offs
- Go/No-Go decision gate

**Target Duration:** ~5 minutes

**Example:**

```bash
valora plan-architecture --task-id=TASK-001
```

**Agent:** @lead
**Model:** Claude Sonnet 4.5

---

### plan-implementation

Create detailed implementation plan (Phase 2 of tiered planning).

```bash
valora plan-implementation [options]
```

**Options:**

| Option               | Description                              |
| -------------------- | ---------------------------------------- |
| `--arch-plan=<path>` | Path to approved architecture plan       |
| `--task-id=<id>`     | Task ID to derive architecture plan path |

**Requires:** Approved architecture plan from `plan-architecture`

**Output:** `knowledge-base/PLAN-IMPL-[TASK-ID].md`

**Covers:**

- Step-by-step tasks with file paths
- Dependencies mapped explicitly
- Risk mitigations per step
- Testing strategy per step
- Rollback procedures

**Target Duration:** ~10 minutes

**Example:**

```bash
valora plan-implementation --arch-plan=knowledge-base/PLAN-ARCH-TASK-001.md
```

**Agent:** @lead
**Model:** Claude Sonnet 4.5

---

### validate-plan

Automated pre-review validation to catch missing plan parameters early.

```bash
valora validate-plan [<plan-path>] [options]
```

**Options:**

| Option     | Description                                      |
| ---------- | ------------------------------------------------ |
| `--fix`    | Auto-fix missing sections with TODO placeholders |
| `--strict` | Require 100% completeness for pass               |

**Validation Checks:**

- Required sections (overview, steps, dependencies, risks, testing, rollback, effort)
- Step completeness (file paths, implementation details, validation criteria)
- Dependency availability and versioning
- Risk coverage with mitigations
- Testing strategy defined
- Effort estimates with confidence

**Time Savings:**

- Without pre-validation: ~14 min review (multiple iterations)
- With pre-validation: ~2 min validation + ~5 min review = **~7 min total**

**Example:**

```bash
# Basic validation
valora validate-plan

# Validate specific plan
valora validate-plan knowledge-base/PLAN-IMPL-TASK-001.md

# With auto-fix
valora validate-plan --fix

# Strict mode (100% required)
valora validate-plan --strict
```

**Agent:** @lead
**Model:** Claude Haiku 4.5

---

### validate-coverage

Automated test coverage validation gate with specific thresholds and quality scoring. Addresses low test quality scores by enforcing minimum coverage requirements.

```bash
valora validate-coverage [options]
```

**Options:**

| Option                     | Description                                         |
| -------------------------- | --------------------------------------------------- |
| `--threshold=<n>`          | Minimum line coverage percentage (default: 80)      |
| `--strict`                 | Enable strict mode requiring ALL thresholds to pass |
| `--new-code-only`          | Only validate changed/new files                     |
| `--report-format=<format>` | Output: summary, detailed, json (default: summary)  |
| `--fail-on-decrease`       | Fail if coverage decreased from baseline            |

**Coverage Thresholds:**

| Metric            | Default | Strict Mode |
| ----------------- | ------- | ----------- |
| Line Coverage     | >= 80%  | >= 85%      |
| Branch Coverage   | >= 70%  | >= 75%      |
| Function Coverage | >= 85%  | >= 90%      |
| New Code Coverage | >= 85%  | >= 95%      |

**Quality Score Grades:**

- A (>= 80): PASS
- B (70-79): PASS with recommendations
- C (60-69): WARN
- D/F (< 60): FAIL

**Example:**

```bash
# Quick validation
valora validate-coverage

# Strict mode for CI/CD
valora validate-coverage --strict --fail-on-decrease

# JSON report for automation
valora validate-coverage --report-format=json
```

**Agent:** @qa
**Model:** Claude Haiku 4.5

---

### pre-check

Run automated code quality pre-checks (linting, type validation, security audit) before manual review. Reduces review time by 50% by allowing reviewers to focus on architectural concerns.

```bash
valora pre-check [options]
```

**Options:**

| Option                     | Description                                                |
| -------------------------- | ---------------------------------------------------------- |
| `--fix`                    | Automatically fix issues where possible (ESLint, Prettier) |
| `--strict`                 | Enable strict mode (warnings treated as errors)            |
| `--ci`                     | CI/CD mode with JSON output, fails fast                    |
| `--report-format=<format>` | Output: summary, detailed, json (default: summary)         |

**Automated Checks:**

| Check       | Command               | Duration |
| ----------- | --------------------- | -------- |
| TypeScript  | `pnpm tsc:check`      | ~12s     |
| ESLint      | `pnpm lint`           | ~8s      |
| Prettier    | `pnpm format --check` | ~3s      |
| Security    | `pnpm audit`          | ~5s      |
| Quick Tests | `pnpm test:quick`     | ~20s     |

**Total Duration:** ~1.5 minutes (parallel execution)

**Example:**

```bash
# Standard pre-check
valora pre-check

# Auto-fix issues and re-check
valora pre-check --fix

# CI/CD mode with JSON output
valora pre-check --ci --report-format=json

# Recommended workflow (reduces review time by 50%)
valora pre-check && valora review-code --focus=architecture
```

**Agent:** @qa
**Model:** Claude Haiku 4.5

---

### review-plan

Validate implementation plan quality, completeness, and feasibility.

```bash
valora review-plan '<plan-document>' [options]
```

**Options:**

| Option           | Description                                 |
| ---------------- | ------------------------------------------- |
| `--strict-mode`  | Enable strict validation                    |
| `--focus=<area>` | Focus: completeness, risks, feasibility     |
| `--checklist`    | Quick binary validation (~3 min vs ~14 min) |

**Quick Mode (`--checklist`):**
Uses PLAN_QUALITY_CHECKLIST.md template for fast validation:

- 35 items across 7 sections (Y/N answers)
- 80% pass threshold (28/35 items)
- 3 critical items that must pass
- Target: ~3 minutes

**Example:**

```bash
# Full review
valora review-plan --strict-mode --focus=risks

# Quick checklist validation
valora review-plan --checklist
```

**Agent:** @lead
**Model:** GPT-5 Thinking High

---

## Implementation

### implement

Execute code changes following approved implementation plan.

```bash
valora implement '<implementation-plan>' [options]
```

**Options:**

| Option           | Description                  |
| ---------------- | ---------------------------- |
| `--agent=<type>` | Specific engineer type       |
| `--mode=<mode>`  | Mode: standard, step-by-step |
| `--step=<n>`     | Specific step number         |

**Example:**

```bash
valora implement --mode=step-by-step --step=1
```

**Agent:** Dynamic (based on task analysis)
**Model:** Claude Sonnet 4.5

**Dynamic Agent Selection:**
The implement command automatically selects the appropriate agent based on:

- Task description analysis
- Affected file patterns
- Dependencies and context

---

## Validation

### assert

Validate implementation completeness, correctness, and compliance.

```bash
valora assert [options]
```

**Options:**

| Option                     | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `--severity=<level>`       | Level: critical, high, all                     |
| `--report-format=<format>` | Format: structured, summary, detailed          |
| `--quick=<template>`       | Quick template validation (~2-5 min vs ~9 min) |

**Quick Mode (`--quick`):**
Uses assertion templates for fast validation:

- `completeness` - Acceptance criteria, features, tests (~2 min)
- `security` - OWASP, secrets, input validation (~2 min)
- `typescript` - Type safety, conventions, patterns (~2 min)
- `all` - All templates sequentially (~5 min)

**Example:**

```bash
# Full assertion
valora assert --severity=critical --report-format=detailed

# Quick template validation
valora assert --quick=typescript
valora assert --quick=all
```

**Agent:** @asserter
**Model:** Claude Haiku 4.5

---

### test

Execute comprehensive test suites.

```bash
valora test '<test-scope>' [options]
```

**Options:**

| Option                     | Description                               |
| -------------------------- | ----------------------------------------- |
| `--type=<type>`            | Type: unit, integration, e2e, all         |
| `--coverage-threshold=<n>` | Minimum coverage percentage (default: 80) |

**Example:**

```bash
valora test --type=all --coverage-threshold=90
```

**Agent:** @qa
**Model:** Claude Haiku 4.5

---

### validate-parallel

Run assert and review-code commands in parallel to reduce validation time by ~50%.

```bash
valora validate-parallel [options]
```

**Options:**

| Option               | Description                                             |
| -------------------- | ------------------------------------------------------- |
| `--quick`            | Use quick validation modes (~5 min vs ~10 min)          |
| `--severity=<level>` | Filter by severity: critical, high, all                 |
| `--focus=<area>`     | Focus area: security, performance, maintainability, all |

**Time Savings:**

- Sequential: `assert` (~9 min) + `review-code` (~10 min) = ~19 min
- Parallel: Both run concurrently = ~10 min
- Quick parallel: Both quick modes = ~5 min

**Verdict Logic:**

| Assert | Review          | Combined |
| ------ | --------------- | -------- |
| PASS   | APPROVE         | **PASS** |
| PASS   | REQUEST_CHANGES | **WARN** |
| FAIL   | Any             | **FAIL** |
| Any    | BLOCK           | **FAIL** |

**Example:**

```bash
# Standard parallel validation
valora validate-parallel

# Quick parallel validation
valora validate-parallel --quick

# Security-focused validation
valora validate-parallel --focus=security --severity=critical
```

**Agent:** @lead
**Model:** Claude Sonnet 4.5

---

## Review

### review-code

Perform comprehensive code quality review.

```bash
valora review-code '<scope>' [options]
```

**Options:**

| Option               | Description                                       |
| -------------------- | ------------------------------------------------- |
| `--severity=<level>` | Level: critical, high, medium, low                |
| `--focus=<area>`     | Area: security, performance, maintainability, all |
| `--checklist`        | Quick binary validation (~3 min vs ~10 min)       |
| `--auto-only`        | Run automated checks only (~1 min)                |

**Quick Modes:**

`--auto-only` (~1 min):

- TypeScript check, linting, formatting, tests, security audit
- No manual review, just tooling

`--checklist` (~3 min):

- 40-item binary checklist (Y/N answers)
- 8 sections: automated, security, architecture, code quality, etc.
- 80% pass threshold

**Example:**

```bash
# Full review
valora review-code --severity=high --focus=security

# Automated checks only
valora review-code --auto-only

# Quick checklist review
valora review-code --checklist
```

**Agent:** @lead
**Model:** Claude Sonnet 4.5

---

### review-functional

Validate feature completeness, acceptance criteria, and user experience.

```bash
valora review-functional '<scope>' [options]
```

**Options:**

| Option                | Description                        |
| --------------------- | ---------------------------------- |
| `--severity=<level>`  | Level: critical, high, medium, low |
| `--check-a11y=<bool>` | Check accessibility: true, false   |

**Example:**

```bash
valora review-functional --check-a11y=true
```

**Agent:** @lead
**Model:** Claude Sonnet 4.5

---

## Delivery

### commit

Analyse changes and create atomic, conventional commits.

```bash
valora commit [options]
```

**Options:**

| Option                  | Description                     |
| ----------------------- | ------------------------------- |
| `--scope=<area>`        | Commit scope                    |
| `--breaking`            | Mark as breaking change         |
| `--message=<msg>`       | Custom commit message           |
| `--amend`               | Amend previous commit           |
| `--no-verify`           | Skip pre-commit hooks           |
| `--version-bump=<type>` | Bump: auto, major, minor, patch |
| `--tag`                 | Create version tag              |
| `--update-changelog`    | Update CHANGELOG                |
| `--interactive`         | Interactive mode                |
| `--insights`            | Include quality insights        |
| `--sign`                | Sign commit                     |
| `--auto-ticket`         | Auto-link tickets               |
| `--template=<name>`     | Use commit template             |

**Example:**

```bash
valora commit --scope=auth --update-changelog --insights
```

**Agent:** @lead
**Model:** Claude Sonnet 4.5

---

### create-pr

Generate and submit pull requests with intelligent description generation.

```bash
valora create-pr [options]
```

**Options:**

| Option               | Description               |
| -------------------- | ------------------------- |
| `--title=<title>`    | Custom PR title           |
| `--draft`            | Create as draft           |
| `--base=<branch>`    | Base branch               |
| `--reviewers=<list>` | Comma-separated reviewers |
| `--labels=<list>`    | Comma-separated labels    |
| `--auto-assign`      | Auto-assign reviewers     |
| `--template=<name>`  | Use PR template           |
| `--link-issues`      | Link related issues       |
| `--require-checks`   | Require status checks     |
| `--auto-merge`       | Enable auto-merge         |
| `--squash`           | Squash commits            |
| `--no-push`          | Skip push                 |

**Example:**

```bash
valora create-pr --draft --auto-assign --link-issues
```

**Agent:** @lead
**Model:** Claude Sonnet 4.5

---

## Feedback

### feedback

Capture outcomes and user feedback for continuous improvement.

```bash
valora feedback [options]
```

**Options:**

| Option                   | Description                |
| ------------------------ | -------------------------- |
| `--command=<name>`       | Specific command to review |
| `--pr=<number>`          | PR number for feedback     |
| `--satisfaction=<n>`     | Satisfaction score (1-10)  |
| `--interactive`          | Interactive mode           |
| `--metrics`              | Include metrics            |
| `--suggest-improvements` | Generate suggestions       |
| `--export=<format>`      | Export format              |

**Example:**

```bash
valora feedback --command=implement --satisfaction=8 --suggest-improvements
```

**Agent:** @product-manager
**Model:** Claude Haiku 4.5

---

## Model Tier Summary

| Tier          | Model               | Commands                                                                       | Use Case                               |
| ------------- | ------------------- | ------------------------------------------------------------------------------ | -------------------------------------- |
| **Strategic** | GPT-5 Thinking High | refine-specs, create-prd, gather-knowledge, plan, review-plan                  | Deep analysis, planning                |
| **Execution** | Claude Sonnet 4.5   | implement, review-code, review-functional, commit, create-pr                   | Code generation, reviews               |
| **Execution** | Claude Sonnet 4.5   | generate-all-documentation                                                     | Parallel documentation (optimised)     |
| **Fast**      | Claude Haiku 4.5    | create-backlog, generate-docs, fetch-task, refine-task, assert, test, feedback | Quick tasks, validation, documentation |

---

## Allowed Tools by Command

Each command has access to specific tools:

| Command                      | Tools                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `plan`                       | codebase_search, read_file, grep, list_dir, glob_file_search                                                       |
| `plan-architecture`          | codebase_search, read_file, grep, list_dir, glob_file_search                                                       |
| `plan-implementation`        | codebase_search, read_file, grep, list_dir, glob_file_search                                                       |
| `implement`                  | codebase_search, read_file, write, search_replace, grep, list_dir, glob_file_search, run_terminal_cmd, delete_file |
| `test`                       | codebase_search, read_file, grep, list_dir, glob_file_search, run_terminal_cmd                                     |
| `commit`                     | codebase_search, read_file, grep, list_dir, glob_file_search, run_terminal_cmd, web_search                         |
| `create-pr`                  | codebase_search, read_file, grep, list_dir, glob_file_search, run_terminal_cmd, GitHub MCP tools                   |
| `generate-docs`              | read_file, write, list_dir, glob_file_search, codebase_search, grep                                                |
| `generate-all-documentation` | read_file, write, list_dir, glob_file_search, codebase_search, grep, run_terminal_cmd                              |
