---
id: documentation.generate-prd
version: 1.1.0
category: documentation
experimental: true
name: Generate PRD
description: Generate comprehensive Product Requirements Document from analyzed requirements
tags:
  - prd-generation
  - documentation
  - requirements-documentation
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
    - gpt-4o
agents:
  - product-manager
dependencies:
  requires:
    - context.load-specifications
    - onboard.analyze-requirements
    - context.use-modern-cli-tools
inputs:
  - name: specifications
    description: Loaded specifications
    type: object
    required: true
  - name: analysis
    description: Requirements analysis with user stories
    type: object
    required: true
  - name: template
    description: PRD template type
    type: string
    required: false
    default: "standard"
outputs:
  - prd_document
  - executive_summary
tokens:
  avg: 6000
  max: 10000
  min: 3000
---

# Generate PRD

## Objective

Generate a concise, actionable Product Requirements Document (PRD) from the provided specifications and analysis.

## Technical Defaults

**Reference**: `.ai/templates/standards/TECHNICAL_DEFAULTS.md`

When documenting technical requirements:
- **Assume defaults unless specified**: pnpm, Vitest, Playwright, TypeScript conventions
- **Don't over-specify**: No need to mention standard stack choices explicitly
- **Focus on deviations**: Only document when requirements differ from defaults
- **Link to standards**: Reference defaults doc for implementation details

**Example**:
```markdown
## Technical Stack
See [Technical Defaults](../../templates/standards/TECHNICAL_DEFAULTS.md) for standard stack.

**Deviations**:
- Using PostgreSQL instead of default (project requires advanced JSON queries)
```

## Instructions

### Step 0: Parse Inputs

Your inputs are provided as JSON objects in markdown code blocks:
- `## Input: specifications` - Project specifications with requirements
- `## Input: analysis` - Requirements analysis with user stories

**If these contain actual content (problem_statement, target_users, functional_requirements), proceed to generate the PRD.**

**Only return an error if inputs are empty:**
```json
{
  "error": "INSUFFICIENT_SPECIFICATIONS",
  "prd_document": null,
  "executive_summary": null
}
```

### Step 1: Generate Concise PRD

**IMPORTANT: Be concise. Focus on actionable content, not verbose descriptions.**

Generate a PRD using this streamlined structure:

```markdown
# Product Requirements Document: [Project Name]

**Version**: 1.0.0 | **Status**: Draft | **Type**: [Greenfield/Brownfield]

---

## Executive Summary

**Problem**: [1-2 sentences from specifications.problem_statement]

**Solution**: [1-2 sentences describing the solution]

**Target Users**: [From specifications.target_users.primary]

**Key Metrics**: [3 bullet points from specifications.success_criteria]

---

## Requirements Overview

### P0 - Must Have
[List each P0 requirement with ID, description, and 1-2 user stories from analysis]

### P1 - Should Have
[List each P1 requirement briefly]

### P2 - Nice to Have
[List each P2 requirement briefly]

---

## Non-Functional Requirements

[List NFRs from specifications.non_functional_requirements - keep brief]

---

## Technical Constraints

[From specifications.constraints - bullet points only]

---

## Dependencies & Risks

**Dependencies**: [From specifications.dependencies]

**Risks**: [From specifications.risks with mitigation - max 5]

---

## Out of Scope

[From specifications.out_of_scope - bullet list]

---

## Open Questions

[From specifications.open_questions - numbered list]
```

### Step 2: Create Executive Summary

Extract a standalone 3-4 sentence executive summary.

## Output Format

**Return ONLY valid JSON:**

```json
{
  "prd_document": "[The complete PRD markdown - escape newlines as \\n]",
  "executive_summary": "[3-4 sentence summary]"
}
```

## Guidelines

- **Be concise**: Aim for 3000-5000 words, not 10000+
- **Use input data directly**: Don't invent details not in specifications
- **Skip empty sections**: If no data exists for a section, omit it
- **Focus on P0 requirements**: These get user stories, others just descriptions
- **Escape JSON properly**: All newlines must be `\n`, quotes must be `\"`

## Success Criteria

- ✅ PRD generated from actual input data
- ✅ All P0 requirements included with user stories
- ✅ Concise and actionable (not verbose)
- ✅ Valid JSON output
