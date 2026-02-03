---
name: plan
description: Analyze task and create detailed implementation plan with steps, dependencies, and risk assessment
experimental: true
argument-hint: '[--task-id=<id>] [--complexity-threshold=5] [--mode=<standard|incremental|tiered>]'
allowed-tools:
  - codebase_search
  - read_file
  - grep
  - list_dir
  - glob_file_search
model: claude-sonnet-4.5
agent: lead
prompts:
  pipeline:
    - stage: load
      prompt: context.load-task
      required: true
      inputs:
        task_id: $ARG_task_id
        backlog_file: $ARG_backlog_file
      outputs:
        - task_details
        - current_acceptance_criteria
        - linked_requirements
    - stage: context
      prompt: context.analyze-task-context
      required: true
      inputs:
        task_description: $STAGE_load.task_details
      outputs:
        - task_scope
        - affected_components
        - relevant_files
        - scope_boundaries
    - stage: complexity
      prompt: plan.assess-complexity
      required: true
      inputs:
        context_analysis: $STAGE_context.result
        complexity_threshold: $ARG_complexity_threshold
      outputs:
        - complexity_score
        - complexity_factors
        - implementation_mode
        - confidence_level
        - clarifying_questions
    - stage: dependencies
      prompt: plan.identify-dependencies
      required: true
      inputs:
        context_analysis: $STAGE_context.result
      outputs:
        - technical_dependencies
        - data_dependencies
        - integration_dependencies
        - execution_order
        - clarifying_questions
    - stage: risks
      prompt: plan.assess-risks
      required: true
      inputs:
        context_analysis: $STAGE_context.result
        complexity_analysis: $STAGE_complexity.result
      outputs:
        - technical_risks
        - business_risks
        - operational_risks
        - mitigation_strategies
        - risk_score
        - clarifying_questions
    - stage: user_answers
      prompt: onboard.collect-clarifications
      required: true
      interactive: true
      condition: ($STAGE_complexity.clarifying_questions.length > 0) OR ($STAGE_dependencies.clarifying_questions.length > 0) OR ($STAGE_risks.clarifying_questions.length > 0)
      inputs:
        clarifying_questions:
          - $STAGE_complexity.clarifying_questions
          - $STAGE_dependencies.clarifying_questions
          - $STAGE_risks.clarifying_questions
        refined_specifications: $STAGE_load.task_details
        clarity_score: 0.80
      outputs:
        - answers
        - summary
        - questions_answered
        - questions_skipped
    - stage: breakdown
      prompt: plan.breakdown-implementation
      required: true
      inputs:
        context_analysis: $STAGE_context.result
        complexity_analysis: $STAGE_complexity.result
        dependencies_analysis: $STAGE_dependencies.result
        risks_analysis: $STAGE_risks.result
        mode: $ARG_mode
        user_answers: $STAGE_user_answers.answers
        user_answers_summary: $STAGE_user_answers.summary
      outputs:
        - implementation_steps
        - estimated_effort
        - testing_strategy
        - rollback_strategy
  merge_strategy: sequential
  rollback_on_failure: context
  cache_strategy: stage
  retry_policy:
    max_attempts: 2
    backoff_ms: 1000
    retry_on:
      - error
      - validation_failed
---

# Planning Command

## Role

Use the [agent] profile

## Goal

**Create a comprehensive, actionable implementation plan** by analyzing task requirements, assessing complexity, identifying dependencies and risks, and breaking down the work into clear, executable steps. This command serves as the **strategic blueprint** for implementation.

**Primary Objectives**:

1. **Understand task scope** - Parse requirements and identify affected components
2. **Assess complexity** - Evaluate difficulty and determine implementation approach
3. **Map dependencies** - Identify technical, data, and integration dependencies
4. **Identify risks** - Spot potential issues and define mitigation strategies
5. **Break down implementation** - Create step-by-step execution plan
6. **Define testing strategy** - Outline validation and quality assurance approach
7. **Plan for failure** - Establish rollback and recovery procedures
8. **Estimate effort** - Provide realistic time/complexity estimates

**This command answers**: "How should we implement this task safely and effectively?"

## Context

### Input Arguments

```plaintext
$ARGUMENTS
```

### Configuration Parameters

```structured
<details>
<summary>Planning Configuration Options</summary>

**--task-id** (optional)
- Explicit task ID to load from BACKLOG.md
- If not provided, loads most recent task from TODO.md or uses auto-selection

**--backlog-file** (optional, default: knowledge-base/BACKLOG.md)
- Path to the backlog file to load task from

**--complexity-threshold** (default: 5)
- Threshold for switching to incremental implementation mode
- Range: 1-10 (1=trivial, 10=extremely complex)
- If complexity_score > threshold → recommend step-by-step implementation

**--mode** (default: auto)
- `standard` - Single-pass implementation (for simple tasks, complexity <= 5)
- `incremental` - Step-by-step implementation (for complex tasks)
- `tiered` - Two-phase planning: architecture -> implementation (recommended for complexity > 5)
- `auto` - Automatically determine based on complexity score:
  - complexity <= 5: uses `standard` mode
  - complexity > 5: uses `tiered` mode (architecture -> implementation)

**--template** (optional)
- Specify a pattern template to use for faster planning (3-5 min vs 13-15 min)
- Available templates: `rest-api`, `react-component`, `database-migration`
- Auto-detected based on task keywords if not specified
- Use `--no-template` to force full planning even if pattern detected
- See `.ai/templates/plans/README.md` for template details

**--focus** (optional)
- `performance` - Emphasize performance considerations
- `security` - Emphasize security considerations
- `maintainability` - Emphasize code quality and maintainability
- `speed` - Emphasize rapid delivery

</details>
```

### Available Context

The planning process leverages:

- **Task from BACKLOG.md** - Loaded via task-id or auto-selected from TODO.md
- **Acceptance criteria** - From task details and linked PRD requirements
- **Gathered knowledge** - Codebase structure, patterns, constraints
- **Existing implementations** - Similar features or patterns
- **Technical constraints** - Platform limitations, dependencies
- **Domain knowledge** - Business logic and rules

## Rules

### Technology Stack Requirements (TypeScript Projects)

When planning for a **TypeScript project**, the following technology stack is **MANDATORY**. Plans MUST enforce these tools and MUST NOT propose alternatives:

| Category                     | Required Tool  | Purpose                               | Enforcement                                          |
| ---------------------------- | -------------- | ------------------------------------- | ---------------------------------------------------- |
| **Development Environment**  | devcontainer   | Containerized development environment | MUST use `.devcontainer/` configuration              |
| **Package Manager**          | pnpm           | Dependency management                 | MUST use pnpm (NEVER npm or yarn)                    |
| **Unit/Integration Testing** | Vitest         | Fast, modern test runner              | MUST use Vitest for all unit and integration tests   |
| **E2E Testing**              | Playwright     | Browser automation and E2E tests      | MUST use Playwright for all E2E tests                |
| **Test Containers**          | Testcontainers | Containerized test dependencies       | MUST use Testcontainers for database/service testing |

#### Enforcement Rules

**Package Manager (pnpm)**:
- All dependency commands MUST use `pnpm` (e.g., `pnpm install`, `pnpm add`, `pnpm run`)
- Plans MUST NOT include `npm install`, `npm run`, `yarn add`, or `yarn` commands
- Lock file MUST be `pnpm-lock.yaml`
- Workspaces MUST use pnpm workspace protocol

**Development Environment (devcontainer)**:
- Project MUST include `.devcontainer/devcontainer.json` configuration
- All development MUST be done inside the devcontainer
- Container MUST include Node.js, pnpm, and required tooling

**Testing Framework (Vitest)**:
- All unit tests MUST use Vitest (`*.test.ts`, `*.spec.ts`)
- Test configuration MUST be in `vitest.config.ts`
- Coverage reports MUST use Vitest's built-in coverage
- Plans MUST NOT propose Jest, Mocha, or other test runners

**E2E Testing (Playwright)**:
- All E2E tests MUST use Playwright (`*.spec.ts` in e2e/ or tests/e2e/)
- Playwright configuration MUST be in `playwright.config.ts`
- Plans MUST NOT propose Cypress, Puppeteer, or other E2E frameworks

**Test Containers (Testcontainers)**:
- Database tests MUST use Testcontainers for isolated database instances
- External service tests MUST use Testcontainers when applicable
- Integration tests requiring real services MUST use Testcontainers

#### Validation Checklist

Before finalizing a plan for a TypeScript project, verify:

- [ ] All shell commands use `pnpm` (not npm/yarn)
- [ ] devcontainer configuration is included or already exists
- [ ] Test strategy specifies Vitest for unit/integration tests
- [ ] Test strategy specifies Playwright for E2E tests
- [ ] Database/service tests include Testcontainers setup

### Quality Standards

1. **Clarity** - Plan must be unambiguous and actionable
2. **Completeness** - All aspects (code, tests, docs) must be addressed
3. **Feasibility** - Steps must be realistic and achievable
4. **Safety** - Risks must be identified with mitigation strategies
5. **Testability** - Testing approach must be clearly defined
6. **Reversibility** - Rollback strategy must be documented

### Plan Structure Requirements

Every plan MUST include:

1. **OVERVIEW** - Task summary, scope boundaries, success criteria
2. **COMPLEXITY ASSESSMENT** - Score, mode recommendation, key factors
3. **DEPENDENCIES** - Technical, data, integration dependencies
4. **RISK ASSESSMENT** - Risks with severity, mitigation strategies
5. **IMPLEMENTATION STEPS** - Detailed, validated, sequential steps
6. **TESTING STRATEGY** - Test types, scenarios, acceptance criteria
7. **ROLLBACK STRATEGY** - Reversion procedures and recovery approach
8. **EFFORT ESTIMATE** - Time estimate with confidence level

**Note**: Detailed criteria for each section are defined in the pipeline prompts.

## Process Steps

The planning process executes a pipeline of specialized prompts, each focusing on a specific analysis:

### Pipeline Overview

1. **Load Task** (`context.load-task`)
   - Load task details from BACKLOG.md or TODO.md
   - Extract acceptance criteria and linked requirements
   - Identify related context and similar implementations
   - Output: Task details, acceptance criteria, linked requirements

2. **Analyze Task Context** (`context.analyze-task-context`)
   - Parse requirements and identify affected components
   - Define scope boundaries
   - Locate relevant files
   - Output: Task scope, affected components, relevant files

3. **Assess Complexity** (`plan.assess-complexity`)
   - Evaluate complexity across 7 dimensions
   - Calculate complexity score
   - Determine implementation mode (standard vs. incremental)
   - Output: Complexity score, factors, mode recommendation, clarifying questions

4. **Identify Dependencies** (`plan.identify-dependencies`)
   - Map technical, data, and integration dependencies
   - Establish execution order
   - Identify parallel work opportunities
   - Output: Dependency graph, execution order, critical path, clarifying questions

5. **Assess Risks** (`plan.assess-risks`)
   - Identify technical, business, and operational risks
   - Define mitigation strategies for high-priority risks
   - Calculate overall risk score
   - Output: Risk registry, mitigation strategies, risk score, clarifying questions

6. **Collect User Answers** (`onboard.collect-clarifications`)
   - Aggregate clarifying questions from complexity, dependencies, and risks stages
   - Present questions interactively and collect user answers
   - Generate summary for inclusion in final plan
   - Output: User answers, summary, questions answered/skipped

7. **Break Down Implementation** (`plan.breakdown-implementation`)
   - Create detailed implementation steps with validation criteria
   - Incorporate user answers into planning decisions
   - Define testing strategy (unit/integration/E2E)
   - Document rollback procedures
   - Estimate effort with confidence level
   - Output: Implementation steps, testing strategy, rollback plan, effort estimate

### Final Plan Synthesis

Compile all pipeline outputs into a comprehensive implementation plan:

```markdown
# IMPLEMENTATION PLAN: [Task Title]

## EXECUTIVE SUMMARY
[High-level overview from all analyses]

## TASK OVERVIEW
[From analyze-task-context]

## COMPLEXITY ASSESSMENT
[From assess-complexity]

## DEPENDENCIES
[From identify-dependencies]

## RISK ASSESSMENT
[From assess-risks]

## IMPLEMENTATION STEPS
[From breakdown-implementation]

## TESTING STRATEGY
[From breakdown-implementation]

## ROLLBACK STRATEGY
[From breakdown-implementation]

## EFFORT ESTIMATE
[From breakdown-implementation]
```

## Output Requirements

### Plan Quality Checklist

Verify all pipeline outputs are complete and integrated:

- [ ] **Task loaded successfully** - From load-task
- [ ] **Task scope is clear** - From analyze-task-context
- [ ] **Complexity properly assessed** - From assess-complexity
- [ ] **All dependencies mapped** - From identify-dependencies
- [ ] **Risks identified with mitigations** - From assess-risks
- [ ] **Steps are actionable** - From breakdown-implementation
- [ ] **Testing strategy complete** - From breakdown-implementation
- [ ] **Rollback plan exists** - From breakdown-implementation
- [ ] **Effort estimate realistic** - From breakdown-implementation

### Success Criteria

A successful plan enables:

1. **Confident execution** - Engineer can implement without confusion
2. **Review validation** - Reviewer can assess plan quality
3. **Progress tracking** - Can monitor completion by step
4. **Risk management** - Known risks with mitigation plans
5. **Quality assurance** - Clear testing and validation approach

## Document Generation

**File**: `knowledge-base/PLAN-[TASK-ID].md`

**Ask user**: "Would you like me to create `knowledge-base/PLAN-[TASK-ID].md` with the implementation plan?"

## Metrics Collection

After all pipeline stages complete, emit optimization metrics as JSON to track workflow performance:

```typescript
optimization_metrics: {
  complexity_score: number,              // From $STAGE_complexity.complexity_score
  pattern_detected: string | undefined,  // From $STAGE_complexity.pattern_detected
  pattern_confidence: number | undefined,// From $STAGE_complexity.pattern_confidence
  planning_mode: 'express' | 'template' | 'standard', // Determine from:
    // - 'express' if complexity_score < 3
    // - 'template' if pattern_detected and pattern_confidence > 0.7
    // - 'standard' otherwise
  template_used: string | undefined,     // Template name if planning_mode === 'template'
  time_saved_minutes: number | undefined // Estimate based on:
    // - express: 10-12 min saved (vs 13-15 min standard)
    // - template: 8-10 min saved (vs 13-15 min standard)
    // - standard: 0 min saved
}
```

Store this in command outputs for session logging and metrics extraction.

## Command Output Summary

Print the following summary at command completion:

```markdown
## ✅ Implementation Plan Created

**Task**: [TASK-ID] - [Title]
**Complexity Score**: [X]/10
**Implementation Mode**: [Standard | Incremental]
**Planning Mode**: [Express | Template | Standard]

### Plan Summary
- **Steps**: [N] implementation steps
- **Estimated Effort**: [X] story points
- **Risk Level**: [Low | Medium | High]
- **Time Saved**: [X] minutes (via [express/template] planning)

### Key Sections
- ✅ Task Overview
- ✅ Complexity Assessment
- ✅ Dependencies
- ✅ Risk Assessment
- ✅ Implementation Steps
- ✅ Testing Strategy
- ✅ Rollback Strategy

### Document Generated
→ `knowledge-base/PLAN-[TASK-ID].md`

### Next Step
→ `/review-plan` to validate plan quality before implementation
```

### Handoff to Next Phase

The plan document becomes input to:

- **review-plan** - For validation before implementation
- **implement** - For direct execution (if plan approved)
- **implement step-by-step** - For incremental execution (if complex)

**Recommended Next Command**: `/review-plan` to validate before implementation

---

## Tiered Planning Mode

When `--mode=tiered` is used (or auto-selected for complexity > 5), planning is split into two phases:

### Phase 1: Architecture Planning (~5 min)
Executed via `/plan-architecture`:
- Technology choices with rationale
- Component boundaries and responsibilities
- Integration points mapping
- Constraints and trade-offs
- Go/No-Go decision gate

**Output**: `knowledge-base/PLAN-ARCH-[TASK-ID].md`

### Phase 2: Implementation Planning (~10 min)
Executed via `/plan-implementation`:
- Step-by-step tasks with file paths
- Dependencies mapped explicitly
- Risk mitigations per step
- Testing strategy per step
- Rollback procedures

**Output**: `knowledge-base/PLAN-IMPL-[TASK-ID].md`

### Benefits of Tiered Approach
1. **Faster validation** - Architecture issues caught in 5 min, not 18 min
2. **Reduced rework** - No detailed planning on rejected architectures
3. **Clearer ownership** - Architecture vs implementation decisions separated
4. **Better quality** - Focused attention on each planning aspect

### When to Use Tiered Mode
- Complexity score > 5
- Multiple architectural options to evaluate
- Significant technology decisions required
- Cross-team coordination needed
- High-risk changes

### Workflow

```
/plan --mode=tiered
    |
    v
/plan-architecture --> PLAN-ARCH-[TASK-ID].md
    |
    v (if GO)
/plan-implementation --> PLAN-IMPL-[TASK-ID].md
    |
    v
/review-plan --checklist
    |
    v
/implement
```

---

## Pattern Templates

For common architectural patterns, use pre-built templates to accelerate planning. These templates provide standard implementation steps, file structures, dependencies, and risk mitigations.

### Available Pattern Templates

| Pattern             | Template                         | Use When                                 |
| ------------------- | -------------------------------- | ---------------------------------------- |
| **REST API**        | `PLAN_PATTERN_REST_API.md`       | Adding new API endpoints, resources      |
| **React Feature**   | `PLAN_PATTERN_REACT_FEATURE.md`  | Adding React features, pages, components |
| **Database Schema** | `PLAN_PATTERN_DATABASE.md`       | Adding tables, migrations, entities      |
| **Authentication**  | `PLAN_PATTERN_AUTH.md`           | Adding login, JWT, OAuth, RBAC           |
| **Background Job**  | `PLAN_PATTERN_BACKGROUND_JOB.md` | Adding async tasks, queues, workers      |

### Using Pattern Templates

When the task matches a common pattern, load the corresponding template:

```bash
# For REST API endpoints
valora plan "Add users API" --pattern=rest-api

# For React features
valora plan "Add dashboard" --pattern=react-feature

# For database changes
valora plan "Add orders table" --pattern=database

# For authentication
valora plan "Add OAuth login" --pattern=auth

# For background jobs
valora plan "Add email queue" --pattern=background-job
```

### Template Benefits

1. **Faster planning** - Pre-defined steps, dependencies, risks (~50% time reduction)
2. **Consistency** - Standard patterns across the codebase
3. **Completeness** - All aspects covered (files, tests, rollback, effort)
4. **Quality** - Best practices built into templates

### Pattern Selection

The planning process can auto-detect patterns based on:
- Task keywords ("API", "endpoint", "CRUD" → REST API)
- File patterns mentioned (`src/features/`, `*.tsx` → React Feature)
- Entity/table mentions (`prisma`, `migration`, `schema` → Database)
- Auth keywords (`login`, `JWT`, `OAuth`, `password` → Authentication)
- Queue/job keywords (`queue`, `worker`, `async`, `scheduled` → Background Job)
