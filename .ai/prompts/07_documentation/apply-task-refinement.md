---
id: documentation.apply-task-refinement
version: 1.1.0
category: documentation
experimental: true
name: Apply Task Refinement
description: Merge refined task into BACKLOG.md and output for approval
tags:
  - backlog
  - task-refinement
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
    - context.load-task
    - onboard.refine-requirements
    - review.validate-testability
inputs:
  - name: task_context
    description: Original task details from context.load-task
    type: object
    required: true
  - name: refinement
    description: Refined requirements from onboard.refine-requirements
    type: object
    required: true
  - name: validation
    description: Validation results from review.validate-testability
    type: object
    required: true
  - name: backlog_file
    description: Path to BACKLOG.md file
    type: string
    required: true
  - name: user_answers
    description: User answers to clarifying questions (from interactive mode)
    type: object
    required: false
  - name: user_answers_summary
    description: Summary of user answers for inclusion in changes summary
    type: string
    required: false
outputs:
  - changes_summary
  - backlog_document
  - updated_task
tokens:
  avg: 8000
  max: 15000
  min: 3000
---

# Apply Task Refinement

## CRITICAL: Output Format Requirement

**You MUST output ONLY valid JSON. Do NOT output markdown, do NOT wrap in code blocks, do NOT add any text before or after the JSON.**

Your response must be a single JSON object matching the schema defined in the "Output Format" section at the end of this prompt. Start directly with `{` and end with `}`.

## Objective

1. Read the existing BACKLOG.md file
2. Generate a summary of proposed changes
3. Merge the refined task into the BACKLOG.md
4. Output the complete merged document for user approval

## Instructions

### Step 1: Read Existing BACKLOG.md

Use the `read_file` tool to read the content from the `backlog_file` path provided in inputs. This will give you the current BACKLOG.md content to merge with.

### Step 2: Extract Task ID and Locate Task Section

From `task_context`, extract the task ID (e.g., "FE001").

Find the task section in the BACKLOG.md content. Task sections typically follow this pattern:

```markdown
#### [TASK-ID]: [Title]

**Requirement(s)**: [FR-XXX]
**Priority**: [P0/P1/P2]
...
```

### Step 3: Generate Changes Summary

Compare the original task with the refined version to create a human-readable summary:

**Include in summary:**
- Task ID and title
- What changed (description, acceptance criteria, scope, etc.)
- Number of new/modified acceptance criteria
- Testability score achieved
- Assumptions made
- User clarifications (if `user_answers` provided from interactive mode)

**Format the summary as markdown** (this will be displayed to the user):

```markdown
# Proposed Changes to Task [TASK-ID]: [Title]

## Summary
- **Testability Score**: [XX]%
- **New Acceptance Criteria**: [N] added
- **Modified Criteria**: [N] refined
- **Assumptions Made**: [N] (with [N] high-risk)

## Key Changes

### Acceptance Criteria
- ✅ Added: [criterion description]
- 📝 Refined: [original] → [new]

### Scope Clarified
- In scope: [items]
- Out of scope: [items]

### Testing Strategy
- Unit tests: [coverage]
- Integration tests: [coverage]
- E2E tests: [scenarios]

## Assumptions
1. [Assumption] - Confidence: [High/Medium/Low]

## User Clarifications (if interactive mode)
[Include user_answers_summary if provided, or note "N/A - Auto mode"]

---
**File**: [backlog_file]
**Task**: [TASK-ID]
```

### Step 4: Build Updated Task Section

Create the updated task section in BACKLOG.md format:

```markdown
#### [TASK-ID]: [Title]

**Requirement(s)**: [FR-XXX]
**Priority**: [P0/P1/P2]
**Domain**: [Domain]
**Effort**: [XS/S/M/L] ([X] days)
**Dependencies**: [TASK-XXX] or [None]
**Last Refined**: [ISO timestamp]
**Testability Score**: [XX]%

**Description**:
[Refined description from refinement stage]

**Acceptance Criteria**:
1. Given [context], when [action], then [expected outcome]
2. [Additional criteria from refinement...]

**Scope**:
- In scope: [items]
- Out of scope: [items]

**Technical Notes**:
- [Implementation hints from refinement]
- [Architecture considerations]

**Testing Requirements**:
- Unit: [requirements]
- Integration: [requirements]
- E2E: [scenarios]

---
```

### Step 5: Merge Into BACKLOG.md (CRITICAL - Data Integrity)

**⚠️ WARNING: You MUST preserve ALL content outside the target task section. Data loss is unacceptable.**

#### Task Section Boundaries

A task section in BACKLOG.md:
- **STARTS** with: `#### [TASK-ID]: [Title]` (e.g., `#### FE001: Implement task creation form`)
- **ENDS** at: The next `#### ` heading OR the next `### ` heading OR `---` separator OR end of file

#### Merge Algorithm (Follow Exactly)

```
1. CONTENT_BEFORE = Everything from start of file UP TO (but not including) "#### [TASK-ID]:"
2. UPDATED_TASK = The new refined task section you created in Step 4
3. CONTENT_AFTER = Everything AFTER the original task section ends (starting from the next heading or separator)
4. MERGED = CONTENT_BEFORE + UPDATED_TASK + CONTENT_AFTER
```

#### Example Merge

**Original BACKLOG.md (simplified):**
```markdown
# Project Backlog
...header content...

### Phase 0: Foundation

#### FE001: Implement task creation form
**Priority**: P0
...old task content...

---

#### FE002: Add description field
...FE002 content...

### Phase 1: Core Features
...more content...
```

**After Merge (only FE001 replaced):**
```markdown
# Project Backlog
...header content...                    ← PRESERVED EXACTLY

### Phase 0: Foundation                 ← PRESERVED EXACTLY

#### FE001: Implement task creation form
**Priority**: P0
**Last Refined**: 2025-01-22T10:30:00Z
...NEW refined task content...

---

#### FE002: Add description field       ← PRESERVED EXACTLY
...FE002 content...                     ← PRESERVED EXACTLY

### Phase 1: Core Features              ← PRESERVED EXACTLY
...more content...                      ← PRESERVED EXACTLY
```

#### Integrity Checks

Before outputting, verify:
- [ ] All other tasks are UNCHANGED
- [ ] All phase headings are PRESERVED
- [ ] Header/metadata sections are PRESERVED
- [ ] Summary tables are PRESERVED
- [ ] Dependency graphs are PRESERVED
- [ ] Only the target task section was modified

**IMPORTANT**: The `backlog_document` output must contain the COMPLETE BACKLOG.md content with ONLY the target task merged in. Everything else must be byte-for-byte identical to the original.

### Step 6: Build Updated Task Object

Create a structured object with all the refined task details for reference.

## Output Format

**CRITICAL**: The `backlog_document` field MUST contain the COMPLETE merged BACKLOG.md content. This is the primary content that will be written to the file after user approval.

**IMPORTANT**: The example below is for illustration only. Do NOT include the ` ```json ` and ` ``` ` code block markers in your actual response. Start directly with `{`.

```json
{
  "changes_summary": "# Proposed Changes to Task FE001: Implement task creation form\\n\\n## Summary\\n- **Testability Score**: 88%\\n- **New Acceptance Criteria**: 3 added\\n...\\n",
  "backlog_document": "# Project Backlog: [Project Name]\\n\\n**Generated**: [timestamp]\\n...\\n\\n#### FE001: Implement task creation form\\n\\n**Requirement(s)**: FR-001\\n**Priority**: P0\\n**Last Refined**: 2025-01-22T10:30:00Z\\n**Testability Score**: 88%\\n\\n**Description**:\\n[Refined description]\\n\\n**Acceptance Criteria**:\\n1. [Refined criterion 1]\\n2. [Refined criterion 2]\\n...\\n\\n---\\n\\n[REST OF BACKLOG.md CONTENT UNCHANGED]\\n",
  "updated_task": {
    "id": "FE001",
    "title": "Task title",
    "description": "Refined description",
    "priority": "P0",
    "domain": "Frontend",
    "effort": "XS",
    "acceptance_criteria": [
      "Given [context], when [action], then [outcome]"
    ],
    "scope_in": ["item 1"],
    "scope_out": ["excluded 1"],
    "dependencies": [],
    "technical_notes": ["note 1"],
    "testing_strategy": {
      "unit": "coverage details",
      "integration": "coverage details",
      "e2e": "scenarios"
    },
    "refinement_metadata": {
      "refined_at": "2025-01-22T10:30:00Z",
      "testability_score": 0.88,
      "assumptions_count": 3,
      "high_risk_assumptions": 1
    }
  }
}
```

## Key Requirements

1. **`backlog_document` is REQUIRED** - Must contain the complete merged BACKLOG.md
2. **`changes_summary` is REQUIRED** - Human-readable markdown summary of changes
3. **`updated_task` is REQUIRED** - Structured object with refined task details

## Success Criteria

- ✅ Existing BACKLOG.md content read successfully
- ✅ Task section located by ID
- ✅ Changes summary clearly describes what changed
- ✅ Task section properly merged into BACKLOG.md
- ✅ All other BACKLOG.md content preserved unchanged
- ✅ Output is valid JSON with all required fields

## Error Handling

### Task Not Found

If the task ID cannot be found in BACKLOG.md:

```json
{
  "changes_summary": "# Error: Task Not Found\\n\\nTask [TASK-ID] was not found in BACKLOG.md.\\n\\nAvailable tasks: [list task IDs found]\\n",
  "backlog_document": null,
  "updated_task": null,
  "error": "Task [TASK-ID] not found in BACKLOG.md"
}
```

### BACKLOG.md Cannot Be Read

If the file cannot be read:

```json
{
  "changes_summary": "# Error: Cannot Read BACKLOG.md\\n\\nFile not found or not readable: [path]\\n",
  "backlog_document": null,
  "updated_task": null,
  "error": "Cannot read BACKLOG.md at [path]"
}
```

## Rules

**DO**:
- ✅ Read the actual BACKLOG.md file content using `read_file` tool
- ✅ Preserve ALL content outside the target task EXACTLY as-is
- ✅ Use the exact merge algorithm: BEFORE + UPDATED_TASK + AFTER
- ✅ Add refinement metadata (Last Refined, Testability Score) to the task
- ✅ Generate clear changes summary showing what was modified
- ✅ Output complete merged document with full integrity

**DON'T**:
- ❌ NEVER modify any other task sections
- ❌ NEVER remove or alter phase headings, summary tables, or metadata
- ❌ NEVER reformat or restructure preserved content
- ❌ NEVER output partial BACKLOG.md content
- ❌ NEVER truncate or summarize the BACKLOG.md content
- ❌ NEVER change whitespace, line breaks, or formatting outside the target task
- ❌ NEVER skip the changes_summary field

## REMINDER: Output Requirements

**Output ONLY the JSON object. No markdown, no code blocks, no explanatory text. Start directly with `{` and end with `}`.**

The `backlog_document` field must contain the COMPLETE BACKLOG.md with the refined task merged in.
