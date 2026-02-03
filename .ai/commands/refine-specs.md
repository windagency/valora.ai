---
name: refine-specs
description: Collaboratively refine product specifications through structured questioning and clarification
experimental: true
argument-hint: '<initial-concept> [--concept-file=<path>] [--domain=<domain>] [--stakeholders=<list>]'
allowed-tools:
  - read_file
  - list_dir
  - glob_file_search
  - web_search
model: gpt-5-thinking-high
agent: product-manager
prompts:
  pipeline:
    - stage: context
      prompt: context.understand-intent
      required: true
      inputs:
        initial_concept: $ARG_1
        concept_file: $ARG_concept-file
        domain: $ARG_domain
      outputs:
        - user_intent
        - initial_scope
    - stage: onboard
      prompt: onboard.refine-specifications
      required: true
      inputs:
        user_intent: $STAGE_context.user_intent
        initial_scope: $STAGE_context.initial_scope
        initial_concept: $ARG_1
        concept_file: $ARG_concept-file
        domain: $ARG_domain
        stakeholders: $ARG_stakeholders
      outputs:
        - refined_specifications
        - clarity_score
        - clarifying_questions
    - stage: review
      prompt: review.validate-completeness
      required: true
      inputs:
        document: $STAGE_onboard.refined_specifications
        document_type: specifications
        clarity_score: $STAGE_onboard.clarity_score
      outputs:
        - validation_results
        - missing_elements
        - completeness_score
        - ready_for_next_stage
    - stage: user_answers
      prompt: onboard.collect-clarifications
      required: true
      interactive: true
      condition: $STAGE_onboard.clarifying_questions.length > 0
      inputs:
        clarifying_questions: $STAGE_onboard.clarifying_questions
        refined_specifications: $STAGE_onboard.refined_specifications
        clarity_score: $STAGE_onboard.clarity_score
        # Pre-collected user answers from the interactive handler
        collected_user_answers: $STAGE_user_answers.answers
        collected_summary: $STAGE_user_answers.summary
      outputs:
        - answers
        - summary
        - questions_answered
        - questions_skipped
    - stage: apply
      prompt: documentation.apply-specification-refinement
      required: true
      inputs:
        refined_specifications: $STAGE_onboard.refined_specifications
        clarity_score: $STAGE_onboard.clarity_score
        validation_results: $STAGE_review.validation_results
        user_answers: $STAGE_user_answers.answers
        user_answers_summary: $STAGE_user_answers.summary
        output_file: knowledge-base/FUNCTIONAL.md
      outputs:
        - final_specifications
        - changes_summary
        - clarifications_applied
  merge_strategy: sequential
  rollback_on_failure: context
  retry_policy:
    max_attempts: 3
    backoff_ms: 1000
    retry_on:
      - validation_failed
---

# Specification Refinement Command

## Role

Use the [agent] profile

## Goal

Transform the user's initial concept into a **clear, comprehensive set of specifications** through a structured five-stage pipeline:

1. **Context Phase**: Understand core problem and validate intent
2. **Onboard Phase**: Clarify requirements through structured questioning
3. **Review Phase**: Validate completeness and readiness for PRD generation
4. **Interactive Phase**: Collect user answers to clarifying questions
5. **Apply Phase**: Merge user clarifications into the final document

## Context

### User's Initial Concept

```plaintext
$ARGUMENTS
```

### Concept File

If `--concept-file` is provided, read and incorporate the content from the specified file as the primary source of initial thoughts and requirements. The concept file takes precedence over inline arguments when both are provided.

**Usage**: `valora refine-specs --concept-file=./ideas/my-feature.md`

### Existing Project Context

Check for existing documentation:

- Previous PRDs or specifications in `knowledge-base/`
- Existing architecture diagrams
- Current feature backlogs
- Stakeholder feedback documents
- Technical constraints documentation

## Process Overview

The pipeline executes five sequential stages:

1. **`context.understand-intent`**: Extract and confirm initial understanding
2. **`onboard.refine-specifications`**: Iteratively clarify through structured questions
3. **`review.validate-completeness`**: Validate against quality criteria (≥90% target)
4. **`onboard.collect-clarifications`**: Interactive stage that presents clarifying questions and collects user answers
5. **`documentation.apply-specification-refinement`**: Merge user clarifications into final document

Each stage produces outputs consumed by subsequent stages. The interactive stage (step 4) presents questions to the user, collects their answers, and passes them to the apply stage. User answers are then incorporated into the final specification document and written to `knowledge-base/FUNCTIONAL.md`.

## Workflow Integration

- **Review Phase**: Always runs to validate the refined specifications
- **Outputs** are saved to `knowledge-base/FUNCTIONAL.md`
- **Retry policy** supports up to 3 attempts with exponential backoff
- **Rollback point** is the context stage on critical failures

## Success Indicators

This command succeeds when:

1. ✅ User confirms specifications accurately reflect their intent
2. ✅ Clarity score is ≥ 90%
3. ✅ All P0 requirements are clearly defined and testable
4. ✅ Constraints and out-of-scope items are explicit
5. ✅ Success criteria are measurable
6. ✅ User clarifications are incorporated into the final document
7. ✅ Specification is saved to `knowledge-base/FUNCTIONAL.md`
8. ✅ User approves proceeding to PRD generation

## Document Generation

**File**: `knowledge-base/FUNCTIONAL.md`

**Ask user**: "Would you like me to create `knowledge-base/FUNCTIONAL.md` with the refined specifications?"

## Command Output Summary

Print the following summary at command completion:

```markdown
## ✅ Specifications Refined

**Clarity Score**: [XX]%
**Status**: [Ready for PRD | Needs Clarification | Needs Refinement]

### Key Outcomes
- [Number] requirements clarified
- [Number] constraints identified
- [Number] out-of-scope items documented

### User Clarifications Applied
- [Number] questions answered (or "N/A - Auto mode")
- [List key decisions made by user]

### Document Generated
→ `knowledge-base/FUNCTIONAL.md`

### Next Step
→ `/create-prd` to generate Product Requirements Document
```

---

## Rules & Constraints

### Core Principles

These principles apply across all pipeline stages:

**DO**:

- ✅ Ask clarifying questions - never assume
- ✅ Use specific examples to clarify abstract concepts
- ✅ Frame collaboration as partnership ("we're defining this together")
- ✅ Balance ideal outcomes with realistic constraints
- ✅ Iterate patiently until clarity is achieved

**DON'T**:

- ❌ Skip validation gates - quality over speed
- ❌ Prescribe implementation details - focus on WHAT and WHY, not HOW
- ❌ Overwhelm users - ask 3-5 questions at a time maximum
- ❌ Mark assumptions as facts - be explicit about uncertainty
- ❌ Rush to PRD with <90% clarity - rework is more expensive

### Agent-Specific Constraints

Refer to [product-manager agent profile](../agents/product-manager.md) for:

- Forbidden paths and tool restrictions
- Decision-making autonomy levels
- Escalation criteria

---

## Output Format

Final output follows this structure:

```markdown
# ✅ Refined Specifications: [Project Name]

[Full specification document - see onboard.refine-specifications prompt]

---

## 📊 Validation Results

**Clarity Score**: [XX]%  
**Status**: [Ready for PRD | Needs Clarification | Needs Refinement]

**Gaps Identified**: [List if any]

---

## 🎯 Recommended Next Step

[Decision based on review.validate-completeness output]
```

---

## Integration with Workflow

**Entry Point**: Start of new project (see [WORKFLOW.md](../WORKFLOW.md))

**Exit Paths**:

- ✅ **Success (≥90%)**: → `/create-prd` (next phase)
- 🔄 **Iteration (70-89%)**: → Re-run with targeted clarifications
- ⚠️ **Blocked (<70%)**: → Major refinement required or human escalation

**Backlog Reference**: This is the first step in the v2 workflow Initialization Phase
