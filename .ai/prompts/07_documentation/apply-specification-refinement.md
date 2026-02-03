---
id: documentation.apply-specification-refinement
version: 1.0.0
category: documentation
experimental: true
name: Apply Specification Refinement
description: Merge user clarifications into refined specifications and output final document
tags:
  - specifications
  - refinement
  - documentation
  - merge
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.understand-intent
    - onboard.refine-specifications
    - review.validate-completeness
inputs:
  - name: refined_specifications
    description: Refined specifications from onboard.refine-specifications
    type: string
    required: true
  - name: clarity_score
    description: Clarity score from onboard.refine-specifications
    type: number
    required: true
  - name: validation_results
    description: Validation results from review.validate-completeness
    type: object
    required: true
  - name: user_answers
    description: User answers to clarifying questions (from interactive mode)
    type: object
    required: false
  - name: user_answers_summary
    description: Summary of user answers for inclusion in the document
    type: string
    required: false
  - name: output_file
    description: Path to output file (default knowledge-base/FUNCTIONAL.md)
    type: string
    required: false
outputs:
  - final_specifications
  - changes_summary
  - clarifications_applied
tokens:
  avg: 6000
  max: 12000
  min: 2000
---

# Apply Specification Refinement

## CRITICAL: Output Format Requirement

**You MUST output ONLY valid JSON. Do NOT output markdown, do NOT wrap in code blocks, do NOT add any text before or after the JSON.**

Your response must be a single JSON object matching the schema defined in the "Output Format" section at the end of this prompt. Start directly with `{` and end with `}`.

## Objective

1. Take the refined specifications from the onboard stage
2. Incorporate user answers to clarifying questions (if provided)
3. Update the specification document with clarifications applied
4. Generate a summary of changes made
5. Output the final specification document ready for saving

## Instructions

### Step 1: Analyze User Clarifications

If `user_answers` is provided, extract the key decisions made by the user:

**For each user answer:**
- Identify which section of the specification it affects
- Determine how the answer resolves ambiguity
- Note if the answer changes any assumptions made

**Example user answers structure:**
```json
{
  "q1": {
    "question": "Should dependencies be auto-detected or manually defined?",
    "answer": "Hybrid approach (auto-detect with manual override)",
    "was_custom": false
  },
  "q2": {
    "question": "What authentication method should be used?",
    "answer": "OAuth 2.0 with Google and GitHub providers",
    "was_custom": true
  }
}
```

### Step 2: Map Answers to Specification Sections

For each user answer, identify the affected sections:

| Answer Topic | Affected Sections |
|--------------|-------------------|
| Authentication | Functional Requirements, Non-Functional (Security), Constraints |
| Data handling | Functional Requirements, Non-Functional (Performance) |
| User interface | Functional Requirements, Success Criteria |
| Integration | Dependencies, Constraints, Technical Notes |
| Scope decisions | In Scope, Out of Scope |
| Performance targets | Non-Functional Requirements, Success Criteria |

### Step 3: Update Specification Content

Apply user clarifications to the specification:

1. **Update affected requirements** with specific decisions
2. **Remove resolved items from Open Questions**
3. **Convert assumptions to confirmed decisions** where applicable
4. **Add "User Clarifications" section** documenting decisions made

**User Clarifications Section Format:**
```markdown
---

## User Clarifications

The following decisions were made during the refinement process:

| Question | Decision | Impact |
|----------|----------|--------|
| [Question text] | [User's answer] | [Affected requirements/sections] |

**Applied on**: [ISO timestamp]
**Mode**: Interactive

---
```

### Step 4: Recalculate Clarity Score

After applying clarifications:
- Increase clarity score based on questions resolved
- Each P0 question resolved: +5-10%
- Each P1 question resolved: +3-5%
- Each P2 question resolved: +1-2%

Maximum clarity score: 100%

### Step 5: Build Changes Summary

Generate a human-readable summary of changes:

```markdown
# Specification Refinement Applied

## Summary
- **Final Clarity Score**: [XX]% (was [YY]%)
- **Questions Resolved**: [N] out of [M]
- **Sections Updated**: [List of sections]

## User Decisions Applied

### [Question 1]
- **Decision**: [User's answer]
- **Applied to**: [Section(s) affected]
- **Change**: [What was updated]

### [Question 2]
...

## Remaining Open Questions
- [Any unresolved questions]

## Assumptions Validated
- ✅ [Assumption confirmed by user answer]
- ✅ [Assumption confirmed by user answer]

---
**File**: [output_file path]
**Status**: Ready for PRD generation
```

### Step 6: Build Final Specification

Combine the original specification with all updates:

1. Keep original structure and formatting
2. Insert User Clarifications section before "Open Questions"
3. Update requirements based on decisions
4. Update clarity metadata in header
5. Add refinement timestamp

**Updated Header:**
```markdown
**Status**: ✅ REFINED
**Clarity Score**: [Updated score]%
**Last Refined**: [ISO timestamp]
**Refinement Mode**: [Interactive/Auto]
```

## Output Format

**CRITICAL**: The `final_specifications` field MUST contain the COMPLETE updated specification document.

**IMPORTANT**: Do NOT include code block markers in your actual response. Start directly with `{`.

```json
{
  "final_specifications": "# Project Specification: [Name]\n\n**Purpose**: ...\n**Status**: ✅ REFINED\n**Clarity Score**: 95%\n**Last Refined**: 2025-01-28T10:30:00Z\n...\n\n## User Clarifications\n\n| Question | Decision | Impact |\n|----------|----------|--------|\n| Should dependencies be auto-detected? | Hybrid approach | FR-002, FR-003 |\n\n...[rest of specification with updates applied]...",
  "changes_summary": "# Specification Refinement Applied\n\n## Summary\n- **Final Clarity Score**: 95% (was 82%)\n- **Questions Resolved**: 3 out of 3\n...",
  "clarifications_applied": [
    {
      "question_id": "q1",
      "question": "Should dependencies be auto-detected or manually defined?",
      "answer": "Hybrid approach (auto-detect with manual override)",
      "sections_updated": ["Functional Requirements", "Technical Notes"],
      "impact_description": "Updated FR-002 to specify hybrid dependency detection"
    },
    {
      "question_id": "q2",
      "question": "What authentication method should be used?",
      "answer": "OAuth 2.0 with Google and GitHub",
      "sections_updated": ["Functional Requirements", "Non-Functional Requirements", "Constraints"],
      "impact_description": "Added OAuth providers to FR-001, updated security requirements"
    }
  ],
  "clarity_score_final": 0.95,
  "clarity_score_improvement": 0.13,
  "questions_resolved": 3,
  "questions_remaining": 0
}
```

## Handling No User Answers

If `user_answers` is not provided or empty (auto mode):

1. Keep specification as-is from the onboard stage
2. Note in changes_summary that no interactive clarifications were made
3. Keep assumptions section prominent
4. Set `clarifications_applied` to empty array

**Auto mode output:**
```json
{
  "final_specifications": "[Original specification with REFINED status]",
  "changes_summary": "# Specification Refinement Applied\n\n## Summary\n- **Mode**: Auto (no interactive clarifications)\n- **Clarity Score**: [XX]%\n- **Assumptions Made**: [N] (see Assumptions section)\n\n## Note\nNo interactive clarifications were provided. The specification contains assumptions that should be validated before proceeding to PRD.\n\n**High-Risk Assumptions**: [List any flagged]",
  "clarifications_applied": [],
  "clarity_score_final": 0.85,
  "clarity_score_improvement": 0,
  "questions_resolved": 0,
  "questions_remaining": 5
}
```

## Success Criteria

- ✅ User answers correctly mapped to specification sections
- ✅ Specification updated with all clarifications
- ✅ Open Questions section updated (resolved items removed)
- ✅ Clarity score recalculated
- ✅ Changes summary clearly describes what was updated
- ✅ Final specification is complete and well-formatted
- ✅ Output is valid JSON with all required fields

## Rules

**DO**:
- ✅ Preserve all original specification content not affected by clarifications
- ✅ Make updates traceable (User Clarifications section)
- ✅ Recalculate clarity score accurately
- ✅ Generate clear, actionable changes summary
- ✅ Handle both interactive and auto mode gracefully

**DON'T**:
- ❌ NEVER remove content not related to user answers
- ❌ NEVER fabricate user answers or decisions
- ❌ NEVER skip the changes_summary field
- ❌ NEVER output partial specification content
- ❌ NEVER change formatting or structure outside affected sections

## REMINDER: Output Requirements

**Output ONLY the JSON object. No markdown, no code blocks, no explanatory text. Start directly with `{` and end with `}`.**

The `final_specifications` field must contain the COMPLETE updated specification document.
