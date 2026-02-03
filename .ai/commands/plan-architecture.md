---
name: plan-architecture
description: Create high-level architectural plan covering technology choices, component boundaries, and integration strategy (Phase 1 of tiered planning)
experimental: true
argument-hint: '[--task-id=<id>] [--backlog-file=<path>]'
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
    - stage: architecture
      prompt: plan.define-architecture
      required: true
      inputs:
        task_details: $STAGE_load.task_details
        context_analysis: $STAGE_context.result
        acceptance_criteria: $STAGE_load.current_acceptance_criteria
      outputs:
        - technology_choices
        - component_boundaries
        - integration_points
        - constraints
        - trade_offs
        - go_no_go_criteria
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

# Architecture Planning Command (Phase 1)

## Role

Use the [agent] profile

## Goal

**Create a high-level architectural plan** that establishes technology choices, component boundaries, and integration strategy. This is Phase 1 of the tiered planning approach, designed to validate architectural decisions before investing time in detailed implementation planning.

**Primary Objectives**:

1. **Select technologies** - Choose appropriate technologies with rationale
2. **Define boundaries** - Establish clear component responsibilities
3. **Map integrations** - Identify internal and external integration points
4. **Document constraints** - Capture technical and business constraints
5. **Evaluate trade-offs** - Make and document architectural trade-off decisions
6. **Gate decision** - Determine if task is ready for detailed planning

**Target duration**: ~5 minutes

**This command answers**: "What is the right architecture for this task?"

## Context

### Input Arguments

```plaintext
$ARGUMENTS
```

### Configuration Parameters

```structured
<details>
<summary>Architecture Planning Options</summary>

**--task-id** (optional)
- Explicit task ID to load from BACKLOG.md
- If not provided, loads most recent task from TODO.md

**--backlog-file** (optional, default: knowledge-base/BACKLOG.md)
- Path to the backlog file to load task from

</details>
```

### Available Context

The architecture planning process leverages:

- **Task from BACKLOG.md** - Loaded via task-id
- **Codebase analysis** - Existing patterns, technologies, constraints
- **Technical standards** - Required tools and frameworks (pnpm, Vitest, Playwright, etc.)

## Rules

### Technology Stack Requirements (TypeScript Projects)

When planning for a **TypeScript project**, the following technology stack is **MANDATORY**:

| Category | Required Tool | Purpose |
|----------|---------------|---------|
| **Package Manager** | pnpm | Dependency management |
| **Unit/Integration Testing** | Vitest | Fast, modern test runner |
| **E2E Testing** | Playwright | Browser automation |
| **Test Containers** | Testcontainers | Containerised test dependencies |

### Architecture Plan Requirements

Every architecture plan MUST include:

1. **Technology Choices** - Selected technologies with rationale and alternatives considered
2. **Component Boundaries** - Clear responsibilities and interfaces
3. **Integration Points** - Internal and external integration mapping
4. **Constraints** - Technical, business, and resource constraints
5. **Trade-offs** - Key decisions with implications
6. **Go/No-Go Criteria** - Prerequisites for proceeding to detailed planning

## Process Steps

### Pipeline Overview

1. **Load Task** (`context.load-task`)
   - Load task details from BACKLOG.md
   - Extract acceptance criteria and requirements
   - Output: Task details, acceptance criteria

2. **Analyse Context** (`context.analyze-task-context`)
   - Parse requirements and identify affected components
   - Locate relevant files and patterns
   - Output: Task scope, affected components, relevant files

3. **Define Architecture** (`plan.define-architecture`)
   - Select technologies with trade-off analysis
   - Define component responsibilities and boundaries
   - Map integration points
   - Document constraints
   - Establish go/no-go criteria
   - Output: Architecture plan sections

### Final Architecture Plan

Compile outputs using the `PLAN_ARCHITECTURE.md` template:

```markdown
# Architecture Plan: [TASK-ID] - [Task Title]

## Overview
[Task summary and context]

## 1. Technology Choices
[Selected technologies with rationale]

## 2. Component Boundaries
[Component responsibilities and interfaces]

## 3. Integration Points
[Internal and external integrations]

## 4. Key Constraints
[Technical, business, resource constraints]

## 5. Trade-offs
[Key decisions with implications]

## 6. Go/No-Go Criteria
[Prerequisites and validation checks]

## 7. Open Questions
[Items requiring clarification]
```

## Output Requirements

### Architecture Plan Quality Checklist

- [ ] **Technology choices documented** - With rationale for each
- [ ] **Alternatives considered** - With rejection reasons
- [ ] **Component boundaries clear** - Single responsibility per component
- [ ] **Integration points mapped** - Internal and external
- [ ] **Constraints explicit** - Technical, business, resource
- [ ] **Trade-offs documented** - With implications
- [ ] **Go/No-Go criteria defined** - All prerequisites listed

### Success Criteria

A successful architecture plan enables:

1. **Quick validation** - Stakeholders can assess approach in ~5 minutes
2. **Go/No-Go decision** - Clear criteria for proceeding
3. **Foundation for detail** - Sufficient context for implementation planning
4. **Risk identification** - Major risks visible early

## Document Generation

**File**: `knowledge-base/PLAN-ARCH-[TASK-ID].md`

**Ask user**: "Would you like me to create `knowledge-base/PLAN-ARCH-[TASK-ID].md` with the architecture plan?"

## Command Output Summary

Print the following summary at command completion:

```markdown
## Architecture Plan Created

**Task**: [TASK-ID] - [Title]

### Architecture Summary
- **Technologies**: [Key technologies selected]
- **Components**: [N] components defined
- **Integrations**: [N] integration points
- **Constraints**: [N] constraints identified

### Go/No-Go Status
- Prerequisites: [X/Y] met
- Validation checks: [X/Y] passed
- **Decision**: [GO / NO-GO / PENDING]

### Document Generated
-> `knowledge-base/PLAN-ARCH-[TASK-ID].md`

### Next Step
-> If GO: `/plan-implementation --arch-plan=PLAN-ARCH-[TASK-ID].md`
-> If NO-GO: Address blocking issues listed above
```

### Handoff to Next Phase

The architecture plan becomes input to:

- **plan-implementation** - For detailed implementation breakdown (if GO)
- **review-plan** - For architecture validation (optional)

**Recommended Next Command**: `/plan-implementation` to create detailed implementation plan
