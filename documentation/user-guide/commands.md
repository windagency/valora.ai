# Command Reference

> Complete reference for all 24 commands in VALORA v2.3.4.

## Commands Quick Reference

| Command                      | Agent            | Purpose                                            | Key flags                                                |
| ---------------------------- | ---------------- | -------------------------------------------------- | -------------------------------------------------------- |
| `refine-specs`               | @product-manager | Collaboratively refine specifications              | `--domain`, `--stakeholders`                             |
| `create-prd`                 | @product-manager | Generate PRD from specifications                   | `--specs-file`, `--template`                             |
| `create-backlog`             | @product-manager | Decompose PRD into tasks                           | `--granularity`, `--format`                              |
| `generate-docs`              | @lead            | Generate technical documentation                   | `--domain`, `--quick`, `--extract-only`                  |
| `generate-all-documentation` | @lead            | Parallel documentation generation (~6 min faster)  | `--skip-review`, `--cache-context`, `--security-context` |
| `fetch-task`                 | @product-manager | Retrieve task from backlog                         | `--task-id`, `--priority`, `--domain`                    |
| `refine-task`                | @product-manager | Clarify task requirements                          | `--task-id`, `--interactive`                             |
| `gather-knowledge`           | @lead            | Analyse codebase context                           | `--scope`, `--domain`, `--depth`                         |
| `plan`                       | @lead            | Create implementation plan                         | `--mode`, `--pattern`, `--complexity-threshold`          |
| `plan-architecture`          | @lead            | High-level architecture plan (Phase 1)             | `--task-id`, `--backlog-file`                            |
| `plan-implementation`        | @lead            | Detailed implementation plan (Phase 2)             | `--arch-plan`, `--task-id`                               |
| `validate-plan`              | @lead            | Pre-review validation (catches 60–70% of issues)   | `--fix`, `--strict`                                      |
| `validate-coverage`          | @qa              | Test coverage validation with quality scoring      | `--threshold`, `--strict`, `--fail-on-decrease`          |
| `pre-check`                  | @qa              | Automated code quality pre-checks before review    | `--fix`, `--strict`, `--ci`                              |
| `review-plan`                | @lead            | Validate implementation plan                       | `--strict-mode`, `--focus`, `--checklist`                |
| `implement`                  | Dynamic          | Execute code changes                               | `--agent`, `--mode`, `--step`                            |
| `assert`                     | @asserter        | Validate implementation                            | `--severity`, `--quick`                                  |
| `test`                       | @qa              | Execute test suites                                | `--type`, `--coverage-threshold`                         |
| `validate-parallel`          | @lead            | Run assert + review-code in parallel (~50% faster) | `--quick`, `--severity`, `--focus`                       |
| `review-code`                | @lead            | Code quality review                                | `--severity`, `--focus`, `--checklist`, `--auto-only`    |
| `review-functional`          | @lead            | Functional review                                  | `--severity`, `--check-a11y`                             |
| `commit`                     | @lead            | Create conventional commits                        | `--scope`, `--breaking`, `--update-changelog`            |
| `create-pr`                  | @lead            | Generate pull request                              | `--draft`, `--auto-assign`, `--link-issues`              |
| `feedback`                   | @product-manager | Capture outcomes                                   | `--command`, `--satisfaction`, `--suggest-improvements`  |

> **Note on batch stages:** Several commands have stages marked `batch: true`, eligible when `--batch` is set and the provider supports it (Anthropic and OpenAI only). See [Batch Processing](#batch-processing) for details.

---

## Global Flags

These flags apply to any command:

| Flag                  | Short | Description                                                                       |
| --------------------- | ----- | --------------------------------------------------------------------------------- |
| `--dry-run`           | `-n`  | Preview what would be executed without making changes                             |
| `--verbose`           | `-v`  | Enable verbose output with detailed logging                                       |
| `--quiet`             | `-q`  | Suppress non-essential output                                                     |
| `--interactive`       |       | Enable interactive mode with approval prompts (default: true)                     |
| `--no-interactive`    |       | Disable interactive mode                                                          |
| `--model <name>`      |       | Override the default AI model                                                     |
| `--agent <role>`      |       | Override the default agent                                                        |
| `--provider <name>`   |       | Override the default LLM provider                                                 |
| `--session-id <id>`   |       | Resume or use a specific session                                                  |
| `--output <format>`   |       | Output format: `markdown`, `json`, `yaml`                                         |
| `--log-level <level>` |       | Log level: `debug`, `info`, `warn`, `error`                                       |
| `--batch`             |       | Submit LLM calls via batch API for ~50% token cost reduction (async, 24 h window) |

```bash
# Preview implementation without making changes
valora implement "Add feature" --dry-run

# Use a specific model with verbose output
valora plan "Refactor module" --model=claude-sonnet-4.6 --verbose

# Run quietly without interactive prompts
valora test --quiet --no-interactive
```

---

## Model Tier Summary

| Tier          | Model               | Commands                                                                                                                                        |
| ------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Strategic** | GPT-5 Thinking High | `refine-specs`, `create-prd`, `gather-knowledge`, `plan`, `review-plan`                                                                         |
| **Execution** | Claude Sonnet 4.5   | `implement`, `review-code`, `review-functional`, `commit`, `create-pr`, `generate-all-documentation`, `validate-parallel`                       |
| **Fast**      | Claude Haiku 4.5    | `create-backlog`, `generate-docs`, `fetch-task`, `refine-task`, `assert`, `test`, `validate-plan`, `validate-coverage`, `pre-check`, `feedback` |

---

## Planning & Requirements

### refine-specs

Collaboratively refine product specifications through structured questioning.

```bash
valora refine-specs '<initial-concept>' [options]
```

| Option                  | Description                             |
| ----------------------- | --------------------------------------- |
| `--domain=<domain>`     | Target domain (backend, frontend, etc.) |
| `--stakeholders=<list>` | Comma-separated stakeholder list        |

```bash
valora refine-specs "User authentication system" --domain=backend
```

<details>
<summary><strong>Pipeline stages and interactive behaviour</strong></summary>

1. `context.understand-intent` — Extract initial understanding
2. `onboard.refine-specifications` — Generate clarifying questions ⚡
3. `review.validate-completeness` — Validate quality (≥90% target) ⚡
4. `onboard.collect-clarifications` — **Interactive**: Collect user answers
5. `documentation.apply-specification-refinement` — Write answers into FUNCTIONAL.md

⚡ = batch-eligible when `--batch` is set

When clarifying questions are generated, the pipeline pauses to collect user answers. These answers are incorporated into the final specification document under a "User Clarifications" section.

**Agent:** @product-manager | **Model:** GPT-5 Thinking High

</details>

---

### create-prd

Generate a comprehensive Product Requirements Document from refined specifications.

```bash
valora create-prd [options]
```

| Option                | Description                                   |
| --------------------- | --------------------------------------------- |
| `--specs-file=<path>` | Path to specifications file                   |
| `--template=<type>`   | Template: `standard`, `technical`, `business` |

```bash
valora create-prd --template=technical
```

<details>
<summary><strong>Pipeline stages and interactive behaviour</strong></summary>

1. `context.load-specifications` — Load specs from file or knowledge-base
2. `onboard.analyze-requirements` — Decompose requirements, generate clarifying questions ⚡
3. `onboard.collect-clarifications` — **Interactive**: Collect user answers
4. `documentation.generate-prd` — Generate PRD with user clarifications applied ⚡
5. `review.validate-completeness` — Validate quality (≥95% target) ⚡

⚡ = batch-eligible when `--batch` is set

When requirements analysis generates clarifying questions, the pipeline pauses to collect user answers before generating the PRD.

**Agent:** @product-manager | **Model:** GPT-5 Thinking High

</details>

---

### create-backlog

Decompose a Product Requirements Document into prioritised, actionable tasks.

```bash
valora create-backlog [options]
```

| Option                  | Description                          |
| ----------------------- | ------------------------------------ |
| `--prd-file=<path>`     | Path to PRD file                     |
| `--granularity=<level>` | Level: `fine`, `medium`, `coarse`    |
| `--format=<type>`       | Format: `github`, `jira`, `markdown` |

```bash
valora create-backlog --granularity=fine --format=github
```

**Batch-eligible stages:** `onboard`, `breakdown`, `review`, `generate` (4 of 5 stages — all after the PRD is loaded)

**Agent:** @product-manager | **Model:** Claude Haiku 4.5

---

### generate-docs

Generate comprehensive technical documentation across infrastructure, backend, and frontend domains.

```bash
valora generate-docs [options]
```

| Option                | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `--domain=<domain>`   | Domain: `infrastructure`, `backend`, `frontend`, `all` (default: `all`) |
| `--doc-type=<type>`   | Specific document type: `HLD`, `API`, `ARCHITECTURE`, etc.              |
| `--output-dir=<path>` | Output directory (default: `knowledge-base/`)                           |
| `--quick`             | Use pre-built templates (~50% time reduction)                           |
| `--extract-only`      | Run extraction phase only, generating `DOC_EXTRACTION_CHECKLIST.md`     |

```bash
# Full generation for a single domain
valora generate-docs --domain=backend

# Faster generation with templates
valora generate-docs --quick

# Generate extraction checklist only
valora generate-docs --extract-only
```

<details>
<summary><strong>Target documentation, pipeline stages, and prerequisites</strong></summary>

**Target documentation (15 files):**

| Domain             | Files                                                               |
| ------------------ | ------------------------------------------------------------------- |
| Infrastructure (6) | HLD.md, CONTAINER.md, DEPLOYMENT.md, LOGGING.md, LZ.md, WORKFLOW.md |
| Backend (5)        | ARCHITECTURE.md, API.md, DATA.md, TESTING.md, CODING-ASSERTIONS.md  |
| Frontend (4)       | ARCHITECTURE.md, DESIGN.md, TESTING.md, CODING-ASSERTIONS.md        |

**Quick mode (`--quick`)** uses pre-built templates: `DOC_API_QUICK.md`, `DOC_COMPONENT_QUICK.md`, and standard structures for all document types.

**Extraction mode (`--extract-only`)** generates a checklist with automated commands to extract: API endpoints, data models, services, configuration, error handling, middleware, tests, dependencies, and infrastructure.

**Pipeline stages:**

1. **context** — Load PRD, FUNCTIONAL, BACKLOG, codebase
2. **analyze** — Plan documentation structure, identify diagrams
3. **generate-infra** — Generate 6 infrastructure docs ⚡
4. **generate-backend** — Generate 5 backend docs ⚡
5. **generate-frontend** — Generate 4 frontend docs ⚡
6. **review** — Validate completeness (≥85% threshold) ⚡
7. **persist** — Write files, create backups

⚡ = batch-eligible when `--batch` is set

**Prerequisites:** `PRD.md`, `FUNCTIONAL.md`, and `BACKLOG.md` must exist in `knowledge-base/`.

**Agent:** @lead (orchestration), @platform-engineer (infra), @software-engineer-typescript-backend (backend), @software-engineer-typescript-frontend (frontend) | **Model:** Claude Haiku 4.5

</details>

---

### generate-all-documentation

Generate all 15 technical documentation files using parallel subprocesses, saving 5–7 minutes compared to sequential `generate-docs`.

```bash
valora generate-all-documentation [options]
```

| Option                      | Description                                        |
| --------------------------- | -------------------------------------------------- |
| `--output-dir=<path>`       | Output directory (default: `knowledge-base/`)      |
| `--skip-review`             | Skip validation stage (~5.5 min total)             |
| `--security-context=<path>` | Path to security requirements file                 |
| `--cache-context`           | Use cached context from previous run (saves ~30 s) |

```bash
# Standard parallel generation (~8 min)
valora generate-all-documentation

# With cached context (~6.5 min)
valora generate-all-documentation --cache-context

# Fastest, skip review (~5.5 min)
valora generate-all-documentation --skip-review

# Include security documentation
valora generate-all-documentation --security-context=.valora/security-requirements.json
```

<details>
<summary><strong>Timing breakdown, optimisation strategies, and comparison with generate-docs</strong></summary>

**Time savings:**

| Stage              | Sequential  | Parallel         | Saved      |
| ------------------ | ----------- | ---------------- | ---------- |
| Context + Analyse  | 105 s       | 90 s (merged)    | 15 s       |
| Generate 3 domains | 540 s       | 240 s (parallel) | 300 s      |
| Review + Persist   | 210 s       | 150 s (merged)   | 60 s       |
| **Total**          | **~14 min** | **~8 min**       | **~6 min** |

**Optimisation strategies:**

1. Merged context + analyse stage — single stage instead of two
2. True parallel domain generation — 3 subprocesses run concurrently
3. Merged review + persist stage — streaming validation and file writing
4. Aggressive caching — 2-hour TTL, includes analysis results

**Pipeline stages:**

1. **contextAndAnalyse** — Load documents + plan documentation (merged, ~90 s)
2. **generateAll** — 3 parallel subprocesses for infra/backend/frontend (~240 s)
3. **reviewAndPersist** — Validate + write files (merged, ~150 s)

**Security context integration:** When `--security-context` is provided, HLD.md gains a full security architecture section, DEPLOYMENT.md includes security gates, LOGGING.md includes audit trail requirements, and LZ.md includes compliance implementation details.

**When to prefer generate-docs:** single domain, quick templates, extraction mode, or lower cost.
**When to prefer generate-all-documentation:** full suite, time-critical workflows, cached context, or security documentation.

| Aspect           | `generate-docs` | `generate-all-documentation` |
| ---------------- | --------------- | ---------------------------- |
| Pipeline stages  | 7               | 3                            |
| Duration         | ~14 min         | ~8 min                       |
| Skip review      | No              | Yes                          |
| Security context | No              | Yes                          |
| Cache TTL        | 1 hour          | 2 hours                      |

**Agent:** @lead (orchestration), @platform-engineer (infra), @software-engineer-typescript-backend (backend), @software-engineer-typescript-frontend (frontend) | **Model:** Claude Sonnet 4.5

</details>

---

### fetch-task

Retrieve and contextualise a task from the project backlog.

```bash
valora fetch-task [options]
```

| Option                | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| `--task-id=<id>`      | Specific task ID                                              |
| `--keywords=<search>` | Fuzzy search keywords                                         |
| `--priority=<level>`  | Priority: `p0`, `p1`, `p2`                                    |
| `--domain=<area>`     | Domain: `frontend`, `backend`, `infra`, `data`, `test`, `doc` |

```bash
valora fetch-task --priority=p0 --domain=backend
```

**Agent:** @product-manager | **Model:** Claude Haiku 4.5

---

### refine-task

Clarify task requirements, acceptance criteria, and implementation details.

```bash
valora refine-task [options]
```

| Option                       | Description                  |
| ---------------------------- | ---------------------------- |
| `--task-id=<id>`             | Specific task ID             |
| `--interactive`              | Interactive mode             |
| `--acceptance-criteria-only` | Focus on acceptance criteria |

```bash
valora refine-task --interactive
```

<details>
<summary><strong>Pipeline stages and interactive behaviour</strong></summary>

1. `context.load-task` — Load task details from backlog
2. `onboard.analyze-clarity` — Calculate clarity score, identify gaps ⚡
3. `onboard.refine-requirements` — Generate clarifying questions
4. `review.validate-testability` — Validate acceptance criteria ⚡
5. `onboard.collect-clarifications` — **Interactive**: Collect user answers
6. `documentation.apply-task-refinement` — Apply answers to task document

⚡ = batch-eligible when `--batch` is set

When clarity gaps are identified, the pipeline pauses to collect user answers, which are incorporated into the refined task before proceeding to planning.

**Agent:** @product-manager | **Model:** Claude Haiku 4.5

</details>

---

### gather-knowledge

Analyse codebase, dependencies, patterns, and constraints.

```bash
valora gather-knowledge [options]
```

| Option              | Description                                             |
| ------------------- | ------------------------------------------------------- |
| `--scope=<scope>`   | Scope: `project`, `task`                                |
| `--domain=<domain>` | Domain: `backend`, `frontend`, `infrastructure`, `data` |
| `--depth=<depth>`   | Depth: `shallow`, `deep`                                |

```bash
valora gather-knowledge --scope=task --domain=backend --depth=deep
```

**Agent:** @lead | **Model:** GPT-5 Thinking High

---

## Planning & Review

### plan

Analyse a task and create a detailed implementation plan.

```bash
valora plan '<task-description>' [options]
```

| Option                       | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| `--complexity-threshold=<n>` | Threshold for step-by-step mode (default: 5)      |
| `--mode=<mode>`              | Mode: `standard`, `incremental`, `tiered`, `auto` |
| `--pattern=<name>`           | Pattern template to accelerate planning           |

```bash
# Standard plan
valora plan "Add OAuth authentication" --mode=tiered

# Accelerate with a pattern template
valora plan "Add users API" --pattern=rest-api
valora plan "Add dashboard" --pattern=react-feature
```

<details>
<summary><strong>Modes, pattern templates, pipeline stages, and interactive behaviour</strong></summary>

**Modes:**

- `standard` — Single-pass implementation (complexity ≤ 5)
- `incremental` — Step-by-step implementation
- `tiered` — Two-phase: architecture → implementation (recommended for complexity > 5)
- `auto` — Automatically selects based on complexity score

**Pattern templates (`--pattern`):**

| Value            | Template file                    | Use case                     |
| ---------------- | -------------------------------- | ---------------------------- |
| `rest-api`       | `PLAN_PATTERN_REST_API.md`       | REST API endpoints           |
| `react-feature`  | `PLAN_PATTERN_REACT_FEATURE.md`  | React features/components    |
| `database`       | `PLAN_PATTERN_DATABASE.md`       | Database schema/migrations   |
| `auth`           | `PLAN_PATTERN_AUTH.md`           | Authentication/authorisation |
| `background-job` | `PLAN_PATTERN_BACKGROUND_JOB.md` | Background jobs/workers      |

**Pipeline stages:**

1. `context.load-task` — Load task details from backlog
2. `context.analyze-task-context` — Parse requirements, identify components
3. `plan.assess-complexity` — Evaluate complexity, generate questions
4. `plan.identify-dependencies` — Map dependencies, generate questions
5. `plan.assess-risks` — Identify risks, generate questions
6. `onboard.collect-clarifications` — **Interactive**: Collect aggregated user answers
7. `plan.breakdown-implementation` — Create implementation steps with clarifications applied

Questions from stages 3–5 are aggregated and presented together before the final breakdown.

**Agent:** @lead | **Model:** GPT-5 Thinking High

</details>

---

### plan-architecture

Create a high-level architectural plan (Phase 1 of tiered planning). Output: `knowledge-base/PLAN-ARCH-[TASK-ID].md`. Target duration: ~5 minutes.

```bash
valora plan-architecture [options]
```

| Option                  | Description                  |
| ----------------------- | ---------------------------- |
| `--task-id=<id>`        | Task ID to load from backlog |
| `--backlog-file=<path>` | Path to backlog file         |

```bash
valora plan-architecture --task-id=TASK-001
```

<details>
<summary><strong>Output coverage and batch behaviour</strong></summary>

**Covers:** technology choices with rationale, component boundaries and responsibilities, integration point mapping, constraints and trade-offs, and a Go/No-Go decision gate.

**Batch-eligible stage:** `architecture` — the architecture definition runs entirely from pre-analysed context with no further file reads.

**Agent:** @lead | **Model:** Claude Sonnet 4.5

</details>

---

### plan-implementation

Create a detailed implementation plan (Phase 2 of tiered planning). Requires an approved architecture plan from `plan-architecture`. Output: `knowledge-base/PLAN-IMPL-[TASK-ID].md`. Target duration: ~10 minutes.

```bash
valora plan-implementation [options]
```

| Option               | Description                              |
| -------------------- | ---------------------------------------- |
| `--arch-plan=<path>` | Path to approved architecture plan       |
| `--task-id=<id>`     | Task ID to derive architecture plan path |

```bash
valora plan-implementation --arch-plan=knowledge-base/PLAN-ARCH-TASK-001.md
```

<details>
<summary><strong>Output coverage and batch behaviour</strong></summary>

**Covers:** step-by-step tasks with file paths, explicitly mapped dependencies, risk mitigations per step, testing strategy per step, and rollback procedures.

**Batch-eligible stages:** `risks`, `breakdown` — risk assessment and implementation step decomposition both operate entirely on pre-loaded architecture text.

**Agent:** @lead | **Model:** Claude Sonnet 4.5

</details>

---

### validate-plan

Automated pre-review validation to catch missing plan parameters early. Catches 60–70% of review issues, reducing total review time from ~14 min to ~7 min.

```bash
valora validate-plan [<plan-path>] [options]
```

| Option     | Description                                      |
| ---------- | ------------------------------------------------ |
| `--fix`    | Auto-fix missing sections with TODO placeholders |
| `--strict` | Require 100% completeness for pass               |

```bash
# Validate the current plan
valora validate-plan

# Validate a specific plan file with auto-fix
valora validate-plan knowledge-base/PLAN-IMPL-TASK-001.md --fix

# Strict mode requiring 100% completeness
valora validate-plan --strict
```

<details>
<summary><strong>Validation checks performed</strong></summary>

- Required sections: overview, steps, dependencies, risks, testing, rollback, effort
- Step completeness: file paths, implementation details, validation criteria
- Dependency availability and versioning
- Risk coverage with mitigations
- Testing strategy defined
- Effort estimates with confidence

**Agent:** @lead | **Model:** Claude Haiku 4.5

</details>

---

### validate-coverage

Automated test coverage validation gate with specific thresholds and quality scoring.

```bash
valora validate-coverage [options]
```

| Option                     | Description                                                |
| -------------------------- | ---------------------------------------------------------- |
| `--threshold=<n>`          | Minimum line coverage percentage (default: 80)             |
| `--strict`                 | Enable strict mode requiring all thresholds to pass        |
| `--new-code-only`          | Validate only changed/new files                            |
| `--report-format=<format>` | Output: `summary`, `detailed`, `json` (default: `summary`) |
| `--fail-on-decrease`       | Fail if coverage decreased from baseline                   |

```bash
# Quick validation
valora validate-coverage

# Strict mode for CI/CD
valora validate-coverage --strict --fail-on-decrease

# JSON report for automation
valora validate-coverage --report-format=json
```

<details>
<summary><strong>Coverage thresholds and quality score grades</strong></summary>

| Metric            | Default | Strict mode |
| ----------------- | ------- | ----------- |
| Line coverage     | ≥ 80%   | ≥ 85%       |
| Branch coverage   | ≥ 70%   | ≥ 75%       |
| Function coverage | ≥ 85%   | ≥ 90%       |
| New code coverage | ≥ 85%   | ≥ 95%       |

**Quality score grades:**

- A (≥ 80): PASS
- B (70–79): PASS with recommendations
- C (60–69): WARN
- D/F (< 60): FAIL

**Agent:** @qa | **Model:** Claude Haiku 4.5

</details>

---

### pre-check

Run automated code quality pre-checks (linting, type validation, security audit) before manual review. Reduces review time by ~50% by allowing reviewers to focus on architectural concerns. Total duration: ~1.5 minutes with parallel execution.

```bash
valora pre-check [options]
```

| Option                     | Description                                                |
| -------------------------- | ---------------------------------------------------------- |
| `--fix`                    | Automatically fix issues where possible (ESLint, Prettier) |
| `--strict`                 | Treat warnings as errors                                   |
| `--ci`                     | CI/CD mode with JSON output, fails fast                    |
| `--report-format=<format>` | Output: `summary`, `detailed`, `json` (default: `summary`) |

```bash
# Standard pre-check
valora pre-check

# Auto-fix and re-check
valora pre-check --fix

# CI/CD mode
valora pre-check --ci --report-format=json

# Recommended pre-review workflow
valora pre-check && valora review-code --focus=architecture
```

<details>
<summary><strong>Checks performed and durations</strong></summary>

| Check       | Command                     | Duration |
| ----------- | --------------------------- | -------- |
| TypeScript  | `npm run tsc:check`         | ~12 s    |
| ESLint      | `npm run lint`              | ~8 s     |
| Prettier    | `npm run format -- --check` | ~3 s     |
| Security    | `npm audit`                 | ~5 s     |
| Quick tests | `npm run test:quick`        | ~20 s    |

**Agent:** @qa | **Model:** Claude Haiku 4.5

</details>

---

### review-plan

Validate implementation plan quality, completeness, and feasibility.

```bash
valora review-plan '<plan-document>' [options]
```

| Option           | Description                                   |
| ---------------- | --------------------------------------------- |
| `--strict-mode`  | Enable strict validation                      |
| `--focus=<area>` | Focus: `completeness`, `risks`, `feasibility` |
| `--checklist`    | Quick binary validation (~3 min vs ~14 min)   |

```bash
# Full review with focus on risks
valora review-plan --strict-mode --focus=risks

# Quick checklist validation
valora review-plan --checklist
```

<details>
<summary><strong>Quick mode details and batch-eligible stages</strong></summary>

**`--checklist` mode** uses `PLAN_QUALITY_CHECKLIST.md`: 35 items across 7 sections (Y/N answers), 80% pass threshold (28/35 items), 3 critical items that must pass. Target: ~3 minutes.

**Batch-eligible stages:** `completeness`, `risks`, `steps`, `tests`, `synthesis` (5 of 7 stages). The `context` load stage and the `feasibility` stage (which uses `codebase_search`) always run in real time.

**Agent:** @lead | **Model:** GPT-5 Thinking High

</details>

---

## Implementation

### implement

Execute code changes following an approved implementation plan.

```bash
valora implement '<implementation-plan>' [options]
```

| Option           | Description                      |
| ---------------- | -------------------------------- |
| `--agent=<type>` | Specific engineer type           |
| `--mode=<mode>`  | Mode: `standard`, `step-by-step` |
| `--step=<n>`     | Specific step number             |

```bash
valora implement --mode=step-by-step --step=1
```

<details>
<summary><strong>Dynamic agent selection</strong></summary>

The `implement` command automatically selects the appropriate agent based on task description analysis, affected file patterns, and dependencies and context. This is controlled by the `dynamic_agent_selection_implement_only` feature flag (enabled by default in Phase 1). See [Feature Flags](./configuration.md#feature-flags) in the configuration guide.

**Agent:** Dynamic | **Model:** Claude Sonnet 4.5

</details>

---

## Validation

### assert

Validate implementation completeness, correctness, and compliance.

```bash
valora assert [options]
```

| Option                     | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `--severity=<level>`       | Level: `critical`, `high`, `all`               |
| `--report-format=<format>` | Format: `structured`, `summary`, `detailed`    |
| `--quick=<template>`       | Quick template validation (~2–5 min vs ~9 min) |

```bash
# Full assertion
valora assert --severity=critical --report-format=detailed

# Quick template validation
valora assert --quick=typescript
valora assert --quick=all
```

<details>
<summary><strong>Quick mode templates</strong></summary>

| Template       | What it checks                       | Duration |
| -------------- | ------------------------------------ | -------- |
| `completeness` | Acceptance criteria, features, tests | ~2 min   |
| `security`     | OWASP, secrets, input validation     | ~2 min   |
| `typescript`   | Type safety, conventions, patterns   | ~2 min   |
| `all`          | All templates sequentially           | ~5 min   |

**Agent:** @asserter | **Model:** Claude Haiku 4.5

</details>

---

### test

Execute comprehensive test suites.

```bash
valora test '<test-scope>' [options]
```

| Option                     | Description                               |
| -------------------------- | ----------------------------------------- |
| `--type=<type>`            | Type: `unit`, `integration`, `e2e`, `all` |
| `--coverage-threshold=<n>` | Minimum coverage percentage (default: 80) |

```bash
valora test --type=all --coverage-threshold=90
```

**Agent:** @qa | **Model:** Claude Haiku 4.5

---

### validate-parallel

Run `assert` and `review-code` in parallel to reduce validation time by ~50%.

```bash
valora validate-parallel [options]
```

| Option               | Description                                                |
| -------------------- | ---------------------------------------------------------- |
| `--quick`            | Use quick validation modes (~5 min vs ~10 min)             |
| `--severity=<level>` | Filter by severity: `critical`, `high`, `all`              |
| `--focus=<area>`     | Focus: `security`, `performance`, `maintainability`, `all` |

```bash
# Standard parallel validation (~10 min)
valora validate-parallel

# Quick parallel validation (~5 min)
valora validate-parallel --quick

# Security-focused validation
valora validate-parallel --focus=security --severity=critical
```

<details>
<summary><strong>Timing and combined verdict logic</strong></summary>

- Sequential: `assert` (~9 min) + `review-code` (~10 min) = ~19 min
- Parallel: both run concurrently = ~10 min
- Quick parallel: both quick modes = ~5 min

**Combined verdict:**

| Assert | Review          | Combined |
| ------ | --------------- | -------- |
| PASS   | APPROVE         | **PASS** |
| PASS   | REQUEST_CHANGES | **WARN** |
| FAIL   | Any             | **FAIL** |
| Any    | BLOCK           | **FAIL** |

**Agent:** @lead | **Model:** Claude Sonnet 4.5

</details>

---

## Review

### review-code

Perform a comprehensive code quality review.

```bash
valora review-code '<scope>' [options]
```

| Option               | Description                                               |
| -------------------- | --------------------------------------------------------- |
| `--severity=<level>` | Level: `critical`, `high`, `medium`, `low`                |
| `--focus=<area>`     | Area: `security`, `performance`, `maintainability`, `all` |
| `--checklist`        | Quick binary validation (~3 min vs ~10 min)               |
| `--auto-only`        | Run automated checks only (~1 min)                        |

```bash
# Full review focused on security
valora review-code --severity=high --focus=security

# Automated checks only
valora review-code --auto-only

# Quick checklist review
valora review-code --checklist
```

<details>
<summary><strong>Quick mode details and batch behaviour</strong></summary>

**`--auto-only` (~1 min):** TypeScript check, linting, formatting, tests, security audit. No manual review.

**`--checklist` (~3 min):** 40-item binary checklist (Y/N answers) across 8 sections: automated, security, architecture, code quality, and more. 80% pass threshold.

**Batch-eligible stage:** `documentation` — the review report generation receives pre-scored outputs (`quality_score`, `issues_found`, `review_decision`) and produces a markdown report with no further file access. The `context` and `review` stages always run in real time.

**Agent:** @lead | **Model:** Claude Sonnet 4.5

</details>

---

### review-functional

Validate feature completeness, acceptance criteria, and user experience.

```bash
valora review-functional '<scope>' [options]
```

| Option                | Description                                |
| --------------------- | ------------------------------------------ |
| `--severity=<level>`  | Level: `critical`, `high`, `medium`, `low` |
| `--check-a11y=<bool>` | Check accessibility: `true`, `false`       |

```bash
valora review-functional --check-a11y=true
```

<details>
<summary><strong>Batch behaviour</strong></summary>

**Batch-eligible stage:** `documentation` — functional review report generation from pre-scored outputs. The `context` stage (which may use browser/Figma tools) and the `review` stage always run in real time.

**Agent:** @lead | **Model:** Claude Sonnet 4.5

</details>

---

## Delivery

### commit

Analyse changes and create atomic, conventional commits.

```bash
valora commit [options]
```

| Option                  | Description                             |
| ----------------------- | --------------------------------------- |
| `--scope=<area>`        | Commit scope                            |
| `--breaking`            | Mark as breaking change                 |
| `--message=<msg>`       | Custom commit message                   |
| `--amend`               | Amend previous commit                   |
| `--no-verify`           | Skip pre-commit hooks                   |
| `--version-bump=<type>` | Bump: `auto`, `major`, `minor`, `patch` |
| `--tag`                 | Create version tag                      |
| `--update-changelog`    | Update CHANGELOG                        |
| `--interactive`         | Interactive mode                        |
| `--insights`            | Include quality insights                |
| `--sign`                | Sign commit                             |
| `--auto-ticket`         | Auto-link tickets                       |
| `--template=<name>`     | Use commit template                     |

```bash
valora commit --scope=auth --update-changelog --insights
```

**Agent:** @lead | **Model:** Claude Sonnet 4.5

---

### create-pr

Generate and submit pull requests with intelligent description generation.

```bash
valora create-pr [options]
```

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

```bash
valora create-pr --draft --auto-assign --link-issues
```

**Agent:** @lead | **Model:** Claude Sonnet 4.5

---

## Feedback

### feedback

Capture outcomes and user feedback for continuous improvement.

```bash
valora feedback [options]
```

| Option                   | Description                |
| ------------------------ | -------------------------- |
| `--command=<name>`       | Specific command to review |
| `--pr=<number>`          | PR number for feedback     |
| `--satisfaction=<n>`     | Satisfaction score (1–10)  |
| `--interactive`          | Interactive mode           |
| `--metrics`              | Include metrics            |
| `--suggest-improvements` | Generate suggestions       |
| `--export=<format>`      | Export format              |

```bash
valora feedback --command=implement --satisfaction=8 --suggest-improvements
```

**Agent:** @product-manager | **Model:** Claude Haiku 4.5

---

## Monitoring & Dashboard

### dash

Launch the real-time TUI dashboard for monitoring sessions, system health, and git worktrees.

```bash
valora dash
```

```plaintext
┌─────────────────────────────────────────────────────────────────┐
│                    VALORA - Real-Time Dashboard                  │
├───────────────────────────────┬──────────────────────────────────┤
│ Recent Sessions (65%)        │ System Health                    │
│ ▶ ● abc123...  2m ago  3 cmd │ API Status: ✓ HEALTHY           │
│   ● def456...  5m ago  1 cmd │ Total Sessions: 12              │
│                              │ Disk Usage: 4.2 MB              │
│ Background Tasks             │                                  │
│ ⟳ abc123: implement (2m 3s) │ Git Worktrees (3)          NEW  │
│                              │ ● main  abc1234                 │
│                              │ ├── exploration/exp-abc-jwt     │
│                              │ │   def5678  ▶ RUNNING          │
│                              │ └── feature/new-api             │
│                              │     ghi9012                     │
│                              │                                  │
│                              │ Recent Commands                  │
│                              │ ✓ implement  2m ago              │
│                              │ ✓ plan       5m ago              │
├───────────────────────────────┴──────────────────────────────────┤
│ 1-6: Tab  j/k: Navigate  Enter: View Details  r: Refresh  q: Quit │
└─────────────────────────────────────────────────────────────────┘
```

**Keyboard controls:**

| Key       | Action                   |
| --------- | ------------------------ |
| `1`–`6`   | Switch dashboard tab     |
| `j` / `k` | Navigate session list    |
| `Enter`   | View session details     |
| `r`       | Refresh data             |
| `q`       | Quit dashboard           |
| `Esc`     | Back (from details view) |
| `Ctrl+C`  | Force quit               |

<details>
<summary><strong>Panel layout, session detail sub-tabs, worktree diagram, and edge cases</strong></summary>

**Panels:**

| Panel            | Location    | Description                                        |
| ---------------- | ----------- | -------------------------------------------------- |
| Recent Sessions  | Left (65%)  | Top 10 sessions with status, age, commands, tokens |
| Background Tasks | Left (65%)  | Currently running sessions with progress bars      |
| System Health    | Right (35%) | API status, session count, disk usage, uptime      |
| Git Worktrees    | Right (35%) | Live tree diagram of git worktrees                 |
| Recent Commands  | Right (35%) | Last 5 commands with success/failure indicators    |

**Session details sub-tabs** (switch with `[` / `]`):

| Sub-tab          | Contents                                                               |
| ---------------- | ---------------------------------------------------------------------- |
| **Overview**     | Session info, running task, exploration panel, command history         |
| **Optimisation** | Agent selection analytics and model selection metrics                  |
| **Quality**      | Quality gate scores and thresholds                                     |
| **Tokens**       | Per-command token usage bar chart and context-window utilisation       |
| **Spending**     | Session cost totals, per-command cost bars, top 5 most expensive calls |

**Worktree diagram panel** icons: `●` main worktree (cyan), `├──` / `└──` tree structure, yellow for exploration branches, red for prunable worktrees. Status icons: `▶` running, `✓` completed, `✗` failed, `⏱` timed out, `○` pending. Maximum 4 worktrees displayed with `...and N more` for overflow.

If a session is linked to an exploration, an **Exploration** panel appears showing the exploration task, status, branch completion, and per-worktree details.

**Edge cases:**

- No git repository → worktree panel shows "No git repository detected"
- No worktrees → shows "No additional worktrees" under the main entry
- No exploration data → worktrees render without status icons
- Session without worktrees → Worktree Usage panel is hidden
- Session without exploration → Exploration panel is hidden
- Session without spending records → Spending panel shows "No spending recorded this session"

</details>

---

### monitoring

Runtime performance metrics, resource usage, and LLM cost data.

```bash
# Current metrics snapshot
valora monitoring metrics
valora monitoring metrics --format prometheus

# Performance profiling report
valora monitoring performance
valora monitoring performance --detailed

# Current system resource usage
valora monitoring resources

# Overall monitoring status
valora monitoring status

# LLM cost history
valora monitoring spending
valora monitoring spending --top 10
valora monitoring spending --by-model
valora monitoring spending --since 2026-03-01

# Cross-session usage analytics
valora monitoring usage
valora monitoring usage --since-days 14
valora monitoring usage --by-model
valora monitoring usage --by-command
valora monitoring usage --daily
valora monitoring usage --format markdown --output usage-report.md
valora monitoring usage --model claude-sonnet-4-6 --since 2026-04-01

# Reset all in-process metrics
valora monitoring reset
```

**`monitoring spending` flags:**

| Flag                 | Description                               | Default |
| -------------------- | ----------------------------------------- | ------- |
| `-t, --top <n>`      | Show top N most expensive requests        | —       |
| `--by-model`         | Group summary by model instead of command | —       |
| `--since <date>`     | Filter records on or after this date      | —       |
| `-f, --format <fmt>` | `table` or `json`                         | `table` |

**`monitoring usage` flags:**

| Flag               | Description                                   | Default |
| ------------------ | --------------------------------------------- | ------- |
| `--since <date>`   | Filter records on or after this ISO 8601 date | —       |
| `--since-days <n>` | Show last N days of usage                     | `7`     |
| `--top <n>`        | Top N costliest requests to display           | `10`    |
| `--by-model`       | Show model breakdown only                     | `false` |
| `--by-command`     | Show command breakdown only                   | `false` |
| `--daily`          | Show daily breakdown only                     | `false` |
| `--model <name>`   | Filter analytics to a single model            | —       |
| `--command <name>` | Filter analytics to a single command          | —       |
| `--format <fmt>`   | Output format: `table`, `json`, or `markdown` | `table` |
| `--output <path>`  | Write report to file instead of stdout        | —       |

<details>
<summary><strong>Spending ledger format and example output</strong></summary>

The ledger is stored as append-only JSONL at `.valora/spending.jsonl`. Each record captures command, stage, model, token breakdown, cost, cache savings, duration, and a timestamp.

**Endpoint summary example:**

```
💸 Spending by Endpoint
══════════════════════════════════════════════════════════════
  review          12 req  $0.1423  48.8k avg tok  saved $0.0218
  test             8 req  $0.0891  31.2k avg tok  saved $0.0145
  plan             5 req  $0.0521  22.1k avg tok
──────────────────────────────────────────────────────────────
  Total:          25 req  $0.2835  saved $0.0363
```

**Top requests example:**

```
🔴 Top 5 Most Expensive Requests:
  1. review    10/03/2026, 14:23:01  $0.0214  claude-3-5-sonnet  82k tok
  2. review    10/03/2026, 09:11:44  $0.0198  claude-3-5-sonnet  76k tok
```

</details>

---

### explore parallel

Start multiple parallel explorations with different strategies using Docker containers and git worktrees.

```bash
valora explore parallel <task> [options]
```

| Flag                      | Description                     | Default                                              |
| ------------------------- | ------------------------------- | ---------------------------------------------------- |
| `-b, --branches <n>`      | Number of parallel explorations | `3`                                                  |
| `-s, --strategies <list>` | Comma-separated approach tags   | —                                                    |
| `-t, --timeout <minutes>` | Max duration per exploration    | `60`                                                 |
| `--docker-image <image>`  | Custom Docker image             | `mcr.microsoft.com/devcontainers/javascript-node:24` |
| `--cpu-limit <cores>`     | CPU limit per container         | `1.5`                                                |
| `--memory-limit <size>`   | Memory limit per container      | `2g`                                                 |
| `--auto-merge`            | Auto-merge winning exploration  | `false`                                              |
| `--no-cleanup`            | Keep explorations for debugging | `false`                                              |
| `--skip-safety`           | Skip pre-flight safety checks   | `false`                                              |

```bash
# Explore 3 authentication approaches
valora explore parallel "Implement user authentication" \
  --branches 3 \
  --strategies "jwt,session,oauth" \
  --timeout 30

# Skip safety checks in constrained dev environment
valora explore parallel "Add caching" --skip-safety
```

<details>
<summary><strong>Safety checks performed</strong></summary>

Pre-flight checks verify: sufficient memory (1 GB per branch), disk space (5 GB), Docker availability, and a clean git state. Use `--skip-safety` to bypass these in constrained environments.

</details>

---

### explore cleanup

Clean up exploration resources (containers, worktrees, branches).

```bash
valora explore cleanup [exploration-id] [options]
```

| Flag               | Description                               |
| ------------------ | ----------------------------------------- |
| `--all`            | Clean up all explorations                 |
| `--failed-only`    | Clean up only failed explorations         |
| `--older-than <h>` | Clean up explorations older than N hours  |
| `--dry-run`        | Preview cleanup without removing anything |

If the exploration state has already been removed (e.g., from a previous partial cleanup), the command falls back to pattern-based cleanup of leftover git branches and worktrees.

---

## Batch Processing

The `--batch` global flag submits eligible pipeline stages to the provider's batch API instead of executing them in real time, reducing token costs by ~50% in exchange for asynchronous processing (results available within 24 hours).

**Eligibility requirements** (all three must be met):

1. The pipeline stage has `batch: true` in its definition.
2. The `--batch` CLI flag is set.
3. The resolved provider supports batching (Anthropic and OpenAI only; others fall back to real time).

**Provider support:**

| Provider      | Batch API                      | Discount |
| ------------- | ------------------------------ | -------- |
| **Anthropic** | Message Batches API            | ~50%     |
| **OpenAI**    | Batch API (JSONL file upload)  | ~50%     |
| **Google**    | Not yet supported (falls back) | —        |
| **Cursor**    | Not supported (falls back)     | —        |

```bash
# Submit with batch processing
valora review-code --batch
# → Batch submitted: batch_local_abc123

# Check status
valora batch status batch_local_abc123

# Wait for and retrieve results
valora batch results batch_local_abc123 --wait
```

**`batch` sub-commands:**

| Sub-command                               | Description                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `valora batch list`                       | List all known batch jobs                                                          |
| `valora batch status <localId>`           | Show status: `queued`, `processing`, `completed`, `failed`, `cancelled`, `expired` |
| `valora batch results <localId> [--wait]` | Retrieve results; `--wait` polls until complete                                    |
| `valora batch cancel <localId>`           | Cancel a pending or processing job                                                 |

<details>
<summary><strong>Batch-eligible stages by command</strong></summary>

Only stages where every input comes from a prior stage's output — no direct file reads, no tool loops, no interactive prompts, no file writes — are eligible.

| Command               | Batch-eligible stages                                            | What they do                                    |
| --------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| `review-code`         | `documentation`                                                  | Generate code review report from scored outputs |
| `review-plan`         | `completeness`, `risks`, `steps`, `tests`, `synthesis`           | Plan validation dimensions + final aggregation  |
| `review-functional`   | `documentation`                                                  | Generate functional review report               |
| `create-prd`          | `onboard`, `documentation`, `review`                             | Requirement analysis, PRD generation, QA check  |
| `refine-specs`        | `onboard`, `review`                                              | Spec refinement and completeness validation     |
| `refine-task`         | `analyze`, `review`                                              | Clarity scoring and testability validation      |
| `create-backlog`      | `onboard`, `breakdown`, `review`, `generate`                     | Full backlog pipeline after PRD is loaded       |
| `generate-docs`       | `generateInfra`, `generateBackend`, `generateFrontend`, `review` | All parallel doc generation + validation        |
| `plan-architecture`   | `architecture`                                                   | Architecture definition from analysed context   |
| `plan-implementation` | `risks`, `breakdown`                                             | Risk assessment and step decomposition          |

**Stages never batch-eligible** (by design): any `context`/`load`/`execute`/`persist`/`apply` stage (reads files or runs commands), `user_answers` stages (interactive), and stages whose prompts use `codebase_search` during execution.

</details>

---

## Allowed Tools by Command

| Command                      | Tools                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `plan`                       | `codebase_search`, `read_file`, `grep`, `list_dir`, `glob_file_search`                                                               |
| `plan-architecture`          | `codebase_search`, `read_file`, `grep`, `list_dir`, `glob_file_search`                                                               |
| `plan-implementation`        | `codebase_search`, `read_file`, `grep`, `list_dir`, `glob_file_search`                                                               |
| `implement`                  | `codebase_search`, `read_file`, `write`, `search_replace`, `grep`, `list_dir`, `glob_file_search`, `run_terminal_cmd`, `delete_file` |
| `test`                       | `codebase_search`, `read_file`, `grep`, `list_dir`, `glob_file_search`, `run_terminal_cmd`                                           |
| `commit`                     | `codebase_search`, `read_file`, `grep`, `list_dir`, `glob_file_search`, `run_terminal_cmd`, `web_search`                             |
| `create-pr`                  | `codebase_search`, `read_file`, `grep`, `list_dir`, `glob_file_search`, `run_terminal_cmd`, GitHub MCP tools                         |
| `generate-docs`              | `read_file`, `write`, `list_dir`, `glob_file_search`, `codebase_search`, `grep`                                                      |
| `generate-all-documentation` | `read_file`, `write`, `list_dir`, `glob_file_search`, `codebase_search`, `grep`, `run_terminal_cmd`                                  |
