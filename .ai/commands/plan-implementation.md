---
name: plan-implementation
description: Create detailed implementation plan with step-by-step tasks, dependencies, and rollback procedures (Phase 2 of tiered planning)
experimental: true
argument-hint: '[--arch-plan=<path>] [--task-id=<id>]'
allowed-tools:
  - codebase_search
  - read_file
  - grep
  - list_dir
  - glob_file_search
  - run_terminal_cmd  # Required for modern CLI tools (jq, yq, rg, fd)
model: claude-opus-4.5
agent: lead
prompts:
  pipeline:
    - stage: load-arch
      prompt: context.load-architecture-plan
      required: true
      inputs:
        arch_plan: $ARG_arch_plan
        task_id: $ARG_task_id
      outputs:
        - architecture_decisions
        - technology_choices
        - component_boundaries
        - integration_points
        - constraints
    - stage: dependencies
      prompt: plan.identify-dependencies
      required: true
      inputs:
        architecture: $STAGE_load-arch.result
      outputs:
        - technical_dependencies
        - data_dependencies
        - integration_dependencies
        - execution_order
    - stage: risks
      prompt: plan.assess-risks
      required: true
      inputs:
        architecture: $STAGE_load-arch.result
        dependencies: $STAGE_dependencies.result
      outputs:
        - technical_risks
        - business_risks
        - operational_risks
        - mitigation_strategies
        - risk_score
    - stage: breakdown
      prompt: plan.breakdown-implementation
      required: true
      inputs:
        architecture: $STAGE_load-arch.result
        dependencies: $STAGE_dependencies.result
        risks: $STAGE_risks.result
      outputs:
        - implementation_steps
        - testing_strategy
        - rollback_strategy
        - effort_estimate
  merge_strategy: sequential
  rollback_on_failure: load-arch
  cache_strategy: stage
  retry_policy:
    max_attempts: 2
    backoff_ms: 1000
    retry_on:
      - error
      - validation_failed
---

# Implementation Planning Command (Phase 2)

## Role

Use the [agent] profile

## Goal

**Create a detailed implementation plan** with step-by-step tasks, explicit dependencies, risk mitigations, and rollback procedures. This is Phase 2 of the tiered planning approach, building on the approved architecture plan.

**Primary Objectives**:

1. **Break down work** - Create atomic, executable implementation steps
2. **Map dependencies** - Explicit technical, data, and integration dependencies
3. **Mitigate risks** - Per-step risk identification with mitigation strategies
4. **Define testing** - Comprehensive testing strategy (unit/integration/E2E)
5. **Plan rollback** - Quick rollback procedures for each step
6. **Estimate effort** - Realistic effort estimates with confidence levels

**Target duration**: ~10 minutes

**This command answers**: "How exactly should we implement this task?"

## Context

### Input Arguments

```plaintext
$ARGUMENTS
```

### Configuration Parameters

```structured
<details>
<summary>Implementation Planning Options</summary>

**--arch-plan** (required if --task-id not provided)
- Path to approved architecture plan
- Example: `knowledge-base/PLAN-ARCH-TASK-001.md`

**--task-id** (optional)
- Task ID to derive architecture plan path
- Will look for `knowledge-base/PLAN-ARCH-[TASK-ID].md`

</details>
```

### Prerequisites

This command requires an approved architecture plan:
- Created via `/plan-architecture`
- Go/No-Go decision: **GO**
- All prerequisites met

### Available Context

The implementation planning process inherits:

- **Architecture decisions** - From architecture plan
- **Technology choices** - Selected technologies and rationale
- **Component boundaries** - Defined responsibilities
- **Integration points** - Internal and external integrations
- **Constraints** - Technical, business, resource constraints

## Rules

### Technology Stack Requirements (TypeScript Projects)

Inherit from architecture plan. Ensure all implementation steps use:

| Category                     | Required Tool  |
| ---------------------------- | -------------- |
| **Package Manager**          | pnpm           |
| **Unit/Integration Testing** | Vitest         |
| **E2E Testing**              | Playwright     |
| **Test Containers**          | Testcontainers |

### Implementation Plan Requirements

Every implementation plan MUST include:

1. **Implementation Steps** - Atomic steps with file paths and validation criteria
2. **Dependency Map** - Execution order with parallelisation opportunities
3. **Risk Mitigations** - Per-step risks with mitigation strategies
4. **Testing Strategy** - Unit, integration, E2E coverage per step
5. **Rollback Procedures** - Quick rollback for each step
6. **Effort Breakdown** - Per-step estimates with confidence levels

### Step Quality Criteria

Each implementation step MUST have:

- **Single objective** - One clear goal per step
- **File paths** - Specific files to create/modify/delete
- **Implementation details** - Code snippets or pseudocode
- **Validation criteria** - How to verify step completion
- **Rollback procedure** - How to revert if needed

## Process Steps

### Pipeline Overview

1. **Load Architecture Plan** (`context.load-architecture-plan`)
   - Load approved architecture plan
   - Extract key decisions and constraints
   - Output: Architecture decisions, technology choices, boundaries

2. **Identify Dependencies** (`plan.identify-dependencies`)
   - Map technical, data, integration dependencies
   - Determine execution order
   - Identify parallelisation opportunities
   - Output: Dependency graph, execution order, critical path

3. **Assess Risks** (`plan.assess-risks`)
   - Identify per-step risks
   - Define mitigation strategies
   - Establish fallback procedures
   - Output: Risk registry, mitigations, risk score

4. **Break Down Implementation** (`plan.breakdown-implementation`)
   - Create atomic implementation steps
   - Define testing strategy per step
   - Document rollback procedures
   - Estimate effort with confidence
   - Output: Implementation steps, testing strategy, rollback plan, effort

### Final Implementation Plan

Compile outputs using the `PLAN_IMPLEMENTATION.md` template:

```markdown
# Implementation Plan: [TASK-ID] - [Task Title]

## Overview
[Task summary with link to architecture plan]

## 1. Implementation Steps
[Step-by-step breakdown with file paths]

## 2. Dependency Map
[Execution order and parallelisation]

## 3. Risk Mitigations
[Per-step risks with strategies]

## 4. Testing Strategy
[Unit/integration/E2E coverage]

## 5. Rollback Procedures
[Quick rollback for each step]

## 6. Effort Breakdown
[Per-step estimates with confidence]

## 7. Implementation Checklist
[Pre/post implementation validation]
```

## Output Requirements

### Implementation Plan Quality Checklist

- [ ] **All steps atomic** - Single objective per step
- [ ] **File paths explicit** - Specific files for each step
- [ ] **Dependencies mapped** - Execution order clear
- [ ] **Risks mitigated** - Each risk has strategy
- [ ] **Testing complete** - Unit + integration + E2E where applicable
- [ ] **Rollback documented** - Quick procedure for each step
- [ ] **Effort estimated** - With confidence level

### Success Criteria

A successful implementation plan enables:

1. **Confident execution** - Engineer can implement without confusion
2. **Progress tracking** - Can monitor completion by step
3. **Risk management** - Known risks with mitigation plans
4. **Quality assurance** - Clear testing approach per step
5. **Safe rollback** - Can revert any step quickly

## Document Generation

**File**: `knowledge-base/PLAN-IMPL-[TASK-ID].md`

**Ask user**: "Would you like me to create `knowledge-base/PLAN-IMPL-[TASK-ID].md` with the implementation plan?"

## Command Output Summary

Print the following summary at command completion:

```markdown
## Implementation Plan Created

**Task**: [TASK-ID] - [Title]
**Architecture Plan**: PLAN-ARCH-[TASK-ID].md

### Plan Summary
- **Steps**: [N] implementation steps
- **Dependencies**: [N] mapped dependencies
- **Risks**: [N] identified ([critical] critical)
- **Risk Level**: [Low | Medium | High]

### Effort Estimate
- **Total**: [X] story points
- **Confidence**: [High | Medium | Low]

### Documents Generated
-> `knowledge-base/PLAN-IMPL-[TASK-ID].md`

### Quality Gate
-> Run `/review-plan --checklist` to validate before implementation

### Next Step
-> `/implement --plan=PLAN-IMPL-[TASK-ID].md` to start implementation
```

### Handoff to Next Phase

The implementation plan becomes input to:

- **review-plan** - For validation before implementation
- **implement** - For direct execution (if plan approved)

**Recommended Next Command**: `/review-plan --checklist` to validate plan quality
