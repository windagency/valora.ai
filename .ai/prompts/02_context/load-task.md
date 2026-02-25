---
id: context.load-task
version: 1.0.0
category: context
experimental: true
name: Load Task
description: Load task details from TODO.md or BACKLOG.md for refinement
tags:
  - task-loading
  - context
  - task-details
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.use-modern-cli-tools
inputs:
  - name: task_id
    description: Optional explicit task ID parameter
    type: string
    required: false
  - name: backlog_file
    description: Path to BACKLOG.md file (defaults to knowledge-base/BACKLOG.md)
    type: string
    required: false
    default: knowledge-base/BACKLOG.md
outputs:
  - task_details
  - current_acceptance_criteria
  - linked_requirements
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Load Task

## CRITICAL: Output Format Requirement

**You MUST output ONLY valid JSON. Do NOT output markdown, do NOT wrap in code blocks, do NOT add any text before or after the JSON.**

Your response must be a single JSON object matching the schema defined in the "Output Format" section at the end of this prompt. Start directly with `{` and end with `}`.

## Objective

Retrieve task details and related context from TODO.md or BACKLOG.md for the refinement process.

## Task Source Priority

```plaintext
1. Explicit task ID via --task-id parameter (search in backlog_file)
2. Most recent task from TODO.md (marked "In Progress" or "Ready")
3. Task reference from backlog_file (defaults to knowledge-base/BACKLOG.md)
4. User-provided inline description
```

## Instructions

### Step 1: Identify Task Source

**Backlog file location**: Use `backlog_file` parameter if provided, otherwise default to `knowledge-base/BACKLOG.md`.

**If `task_id` provided**:
- Search the backlog file for exact task ID match
- Search TODO.md for task reference
- Extract full task entry
- Validate task exists and is not completed

**If no `task_id` provided**:
- Check TODO.md for most recent fetched task
- Look for task marked "In Progress" or "Ready"
- Use most recently modified task entry
- If multiple candidates, select highest priority

**If inline description**:
- Treat as new task specification
- Extract key requirements from description
- Note: May need to add to backlog later

### Step 2: Extract Task Components

Parse and extract all available task information:

```plaintext
Required fields:
- Task ID (if exists)
- Task title
- Description/requirements
- Priority level (P0/P1/P2)
- Domain (frontend/backend/infra/data/testing/documentation)

Optional fields:
- Acceptance criteria
- Effort estimate (XS/S/M/L/XL)
- Dependencies (task IDs)
- Linked PRD requirements (FR-XXX, NFR-XXX, US-XXX)
- Constraints/considerations
- Technical notes
- Testing requirements
```

### Step 3: Load Related Context

**PRD Requirements**:
- If task references FR-XXX, NFR-XXX, or US-XXX requirements
- Load from knowledge-base/PRD.md
- Extract full requirement text and acceptance criteria

**Architecture Context**:
- Based on task domain, identify relevant architecture docs
- Frontend tasks → knowledge-base/frontend/ARCHITECTURE.md
- Backend tasks → knowledge-base/backend/ARCHITECTURE.md
- Data tasks → knowledge-base/backend/DATA.md

**Similar Implementations**:
- Search for tasks with similar descriptions in BACKLOG.md
- Identify completed tasks in same domain
- Extract patterns and lessons learned

**Dependencies**:
- If task lists dependency task IDs
- Load dependency task details
- Check completion status of dependencies

### Step 4: Extract Current Acceptance Criteria

**If task has explicit acceptance criteria**:
- Extract all listed criteria
- Parse format (checklist, Given-When-Then, etc.)
- Categorize by type (functional, non-functional, edge cases)

**If task lacks acceptance criteria**:
- Note as gap for refinement
- Check if linked PRD requirements have criteria
- Flag for creation in refinement stage

### Step 5: Assess Initial State

Quick assessment of task clarity:

**Check for presence of**:
- [ ] Clear description
- [ ] Defined scope
- [ ] Acceptance criteria (any)
- [ ] Priority assigned
- [ ] Domain identified
- [ ] Dependencies noted (if any)

**Initial clarity indicators**:
- All checked → High clarity baseline
- 4-5 checked → Moderate clarity baseline  
- <4 checked → Low clarity baseline

## Output Format

**IMPORTANT**: The example below is for illustration only. Do NOT include the ` ```json ` and ` ``` ` code block markers in your actual response. Start directly with `{`.

```json
{
  "task_details": {
    "id": "FE0012",
    "title": "Add search to user dashboard",
    "description": "Users need search functionality to find transactions quickly",
    "priority": "P1",
    "domain": "Frontend",
    "effort": "M",
    "effort_estimate": "3-4 days",
    "phase": 2,
    "status": "ready",
    "source": "BACKLOG.md",
    "dependencies": [],
    "linked_requirements": ["FR-023", "US-023-1"],
    "constraints": ["Must work on mobile devices"],
    "technical_notes": "Consider using existing search component pattern"
  },
  "current_acceptance_criteria": [
    "Users can search transactions",
    "Search updates in real-time"
  ],
  "linked_requirements": {
    "FR-023": {
      "title": "Transaction Search",
      "description": "Enable users to search transaction history by multiple criteria",
      "acceptance_criteria": [
        "Search by description (partial match)",
        "Search by amount (exact or range)",
        "Search by date (range)",
        "Results appear within 500ms"
      ]
    },
    "US-023-1": {
      "story": "As a user, I want to search my transactions by description, so that I can quickly find specific purchases",
      "acceptance_criteria": [
        "GIVEN I am on the dashboard",
        "WHEN I type in the search field",
        "THEN transactions matching my query appear in real-time"
      ]
    }
  },
  "related_context": {
    "architecture_docs": [
      "knowledge-base/frontend/ARCHITECTURE.md"
    ],
    "similar_tasks": [
      {
        "id": "FE0008",
        "title": "Admin search functionality",
        "status": "completed",
        "lessons": "Used debounce hook, 300ms delay worked well"
      }
    ],
    "patterns": [
      "Use useDebounce hook for search input",
      "Follow SearchInput component pattern",
      "API endpoint pattern: GET /api/{resource}?search="
    ]
  },
  "initial_assessment": {
    "clarity_baseline": "moderate",
    "has_description": true,
    "has_scope": true,
    "has_acceptance_criteria": true,
    "has_priority": true,
    "has_domain": true,
    "has_dependencies_noted": true,
    "checked_count": 6,
    "gaps_identified": [
      "Acceptance criteria are vague",
      "Missing edge case coverage",
      "No performance targets specified in task"
    ]
  }
}
```

## Success Criteria

- ✅ Task successfully located and loaded
- ✅ All available task metadata extracted
- ✅ Linked PRD requirements loaded (if applicable)
- ✅ Related context identified
- ✅ Current acceptance criteria extracted or noted as missing
- ✅ Initial clarity assessment completed
- ✅ Dependencies validated

## Error Handling

### Task Not Found

**If task_id provided but not found**:
- Search in completed tasks section
- If completed: Return completion details with warning
- If truly missing: List available tasks, suggest alternatives
- Error: "Task {task_id} not found in BACKLOG.md or TODO.md"

### Ambiguous Task

**If multiple tasks match criteria**:
- List all matching tasks
- Request user clarification
- Provide selection guidance (newest, highest priority)

### Missing Context

**If linked requirements not found**:
- Note as missing in output
- Proceed with available information
- Flag for clarification in refinement stage

## Rules

**DO**:
- ✅ Check multiple sources (TODO.md, BACKLOG.md, PRD.md)
- ✅ Extract all available context
- ✅ Note gaps explicitly
- ✅ Load related requirements and patterns
- ✅ Validate task exists before proceeding

**DON'T**:
- ❌ Don't assume task structure - handle various formats
- ❌ Don't fail if some fields missing - extract what's available
- ❌ Don't skip related context - it aids refinement
- ❌ Don't modify task data - load as-is

## Notes

- This prompt loads context only - no analysis or refinement
- Task may be in various formats - be flexible in parsing
- Initial assessment is quick scan, not full analysis
- Related context helps inform later refinement stages
- Output feeds directly into clarity analysis stage

## REMINDER: Output Requirements

**Output ONLY the JSON object. No markdown, no code blocks, no explanatory text. Start directly with `{` and end with `}`.**

