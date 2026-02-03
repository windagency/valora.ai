---
name: create-prd
description: Generate a comprehensive Product Requirements Document from refined specifications
experimental: true
argument-hint: '[--specs-file=<path>] [--template=<standard|technical|business>]'
allowed-tools:
  - read_file
  - write
  - list_dir
  - glob_file_search
  - codebase_search
  - grep
model: gpt-5-thinking-high
agent: product-manager
prompts:
  pipeline:
    - stage: context
      prompt: context.load-specifications
      required: true
      cache:
        enabled: true
        ttl_ms: 3600000
        file_dependencies:
          - knowledge-base/FUNCTIONAL.md
          - knowledge-base/PRD.md
      inputs:
        specs_file_arg: $ARG_specs_file
      outputs:
        - specifications
        - project_type
    - stage: onboard
      prompt: onboard.analyze-requirements
      required: true
      inputs:
        source_document: $STAGE_context.specifications
        source_type: specifications
        project_type: $STAGE_context.project_type
      outputs:
        - requirement_analysis
        - complexity_estimate
        - user_stories
        - dependency_graph
        - complexity_map
        - clarifying_questions
    - stage: user_answers
      prompt: onboard.collect-clarifications
      required: true
      interactive: true
      condition: $STAGE_onboard.clarifying_questions.length > 0
      inputs:
        clarifying_questions: $STAGE_onboard.clarifying_questions
        refined_specifications: $STAGE_context.specifications
        clarity_score: 0.85
      outputs:
        - answers
        - summary
        - questions_answered
        - questions_skipped
    - stage: documentation
      prompt: documentation.generate-prd
      required: true
      inputs:
        specifications: $STAGE_context.specifications
        analysis: $STAGE_onboard.requirement_analysis
        template: $ARG_template
        user_answers: $STAGE_user_answers.answers
        user_answers_summary: $STAGE_user_answers.summary
      outputs:
        - prd_document
        - executive_summary
    - stage: review
      prompt: review.validate-completeness
      required: true
      inputs:
        document: $STAGE_documentation.prd_document
        document_type: prd
      outputs:
        - validation_results
        - completeness_score
        - ready_for_next_stage
  merge_strategy: sequential
  rollback_on_failure: context
  cache_strategy: stage
  retry_policy:
    max_attempts: 2
    backoff_ms: 1000
    retry_on:
      - validation_failed
---

# Product Requirements Document Generation Command

## Role

Use the [agent] profile (product-manager)

## Goal

Transform **refined specifications** into a **comprehensive, production-ready Product Requirements Document (PRD)** through a 5-stage pipeline:

1. **Context Stage**: Load and parse specifications
2. **Onboard Stage**: Analyze and decompose requirements
3. **Interactive Stage**: Collect user answers to clarifying questions
4. **Documentation Stage**: Generate comprehensive PRD with user clarifications applied
5. **Review Stage**: Validate completeness and quality

The pipeline automatically handles requirement decomposition, user story generation, dependency mapping, interactive clarification, and quality validation.

## Pipeline Overview

The command executes 5 sequential stages:

1. **`context.load-specifications`**: Load specs from file or knowledge-base
2. **`onboard.analyze-requirements`**: Decompose requirements, generate user stories, map dependencies
3. **`onboard.collect-clarifications`**: Present clarifying questions and collect user answers
4. **`documentation.generate-prd`**: Generate comprehensive PRD document with diagrams and user clarifications
5. **`review.validate-completeness`**: Validate quality and completeness (≥95% target for PRDs)

Each stage produces outputs consumed by subsequent stages. User answers to clarifying questions are incorporated into the PRD document. See individual prompts for detailed instructions.

## Context

### Input Arguments

```plaintext
$ARGUMENTS
```

### Available Arguments

- `--specs-file=<path>`: Path to specifications file (default: auto-detect from knowledge-base/)
- `--template=<type>`: PRD template type (standard | technical | business)

### Specifications Priority Order

1. File provided via `--specs-file`
2. `knowledge-base/FUNCTIONAL.md` (primary source)
3. Existing `PRD.md` (for updates)
4. User-provided inline specifications

## Core Principles

**Comprehensive**:

- Cover functional, technical, and operational requirements
- Include success metrics, dependencies, risks
- Document assumptions and out-of-scope items

**Actionable**:

- All requirements must be implementable
- User stories with testable acceptance criteria
- Clear priority levels (P0, P1, P2)

**Structured**:

- Follow standard PRD format
- Maintain traceability (requirements → user stories → acceptance criteria)
- Use consistent formatting and IDs

**Measurable**:

- Quantitative success metrics with targets
- Specific non-functional requirements (not "fast" but "<2s")
- Complexity estimates for planning

**Visual**:

- Include architecture diagrams (Mermaid)
- Data flow and sequence diagrams where helpful
- User journey maps for user-facing features

---

## Success Criteria

This command succeeds when:

1. ✅ PRD document saved to `knowledge-base/PRD.md`
2. ✅ Completeness score ≥ 95%
3. ✅ All P0 requirements have:
   - Clear description
   - User story
   - Testable acceptance criteria
   - Complexity estimate
   - Dependencies documented
4. ✅ Success metrics are quantifiable
5. ✅ Technical architecture section provides sufficient guidance
6. ✅ Non-functional requirements have specific targets
7. ✅ Risks identified with mitigation strategies
8. ✅ Out-of-scope items explicitly documented
9. ✅ User approves proceeding to backlog creation

## Document Generation

**File**: `knowledge-base/PRD.md`

**Ask user**: "Would you like me to create `knowledge-base/PRD.md` with the Product Requirements Document?"

## Command Output Summary

Print the following summary at command completion:

```markdown
## ✅ PRD Generated

**Completeness Score**: [XX]%
**Status**: [Ready for Backlog | Minor Gaps | Needs Refinement]

### Key Outcomes
- [Number] functional requirements documented
- [Number] non-functional requirements defined
- [Number] user stories created
- [Number] risks identified

### Document Generated
→ `knowledge-base/PRD.md`

### Next Step
→ `/create-backlog` to decompose PRD into actionable tasks
```

## Workflow Integration

**Entry Point**: After `/refine-specs` (Initialization Phase - see WORKFLOW.md)

**Prerequisites**:

- ✅ Refined specifications available (`knowledge-base/FUNCTIONAL.md`)
- ✅ Specifications clarity score ≥ 90%

**Exit Paths**:

- ✅ **Success (≥95%)**: → `/create-backlog` (Initialization Phase continues)
- ⚠️ **Warning (85-94%)**: → Proceed with minor gaps or refine first
- 🔴 **Insufficient (<85%)**: → `/refine-specs` or human escalation

**Follows Template**: [PRD](../templates/PRD.md)
