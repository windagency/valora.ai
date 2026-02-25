---
id: onboard.fetch-task
version: 1.0.0
category: onboard
experimental: true
name: Fetch Task
description: Select a task from backlog - either user-specified or auto-selected based on readiness scoring
tags:
  - task-selection
  - prioritization
  - readiness-scoring
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.use-modern-cli-tools
    - context.load-backlog
inputs:
  - name: backlog
    description: Loaded backlog document from context.load-backlog
    type: object
    required: true
  - name: available_tasks
    description: List of available tasks from context.load-backlog
    type: array
    required: true
  - name: task_id
    description: Optional task ID for fetch mode
    type: string
    required: false
  - name: priority_filter
    description: Optional priority filter (P0, P1, P2)
    type: string
    required: false
    validation:
      enum: ["P0", "P1", "P2"]
  - name: domain_filter
    description: Optional domain filter
    type: string
    required: false
    validation:
      enum: ["Frontend", "Backend", "Data", "Infrastructure", "Testing", "Documentation"]
outputs:
  - fetched_task
  - task_metadata
  - blocking_dependencies
  - selection_rationale
tokens:
  avg: 4000
  max: 8000
  min: 2000
---

# Fetch Task

## Objective

Select a task from the backlog - either fetch a user-specified task OR auto-select the next priority task based on readiness scoring.

## Mode Detection

Determine operation mode based on inputs:

**FETCH MODE** (task_id provided):

- User has specified a task to fetch
- Find and validate the specified task
- Warn about any issues but allow proceeding
- Output the specified task

**AUTO-SELECT MODE** (task_id not provided):

- No task specified by user
- Calculate readiness scores for all available tasks
- Apply optional filters (priority_filter, domain_filter)
- Select highest-scoring task
- Output selected task + alternatives

## Instructions

### For FETCH MODE

#### Step 1: Parse Task Identifier

Extract task identifier from `task_id` input:

- **Exact Task ID**: "BE0001", "FE0042", "INFRA0005"
- **Partial ID**: "BE001", "be1" (normalize and match)
- Normalize: uppercase, pad zeros if needed

#### Step 2: Find Matching Task

Search for task in backlog:

1. **Exact ID match**:
   - Search available_tasks for exact task ID
   - If found, proceed to validation

2. **Fuzzy ID match**:
   - Try normalizing ID (uppercase, padding)
   - Try partial matching
   - If multiple matches, list them and ask user to clarify

3. **Task not found**:
   - Check if task exists but is completed/blocked
   - If completed: Inform user with completion details
   - If blocked: Show blockers
   - If doesn't exist: Suggest similar tasks, offer auto-select

#### Step 3: Validate Task Status

Check task status and warn if needed:

**Status checks**:

- ✅ **Task exists**: Confirmed
- ⚠️ **Already completed**: Warn with completion date/PR
- ⚠️ **In progress**: Warn but allow (may want to assist)
- ❌ **Blocked**: Show blockers, suggest alternatives

**Allow user to proceed** even with warnings (they may have good reasons).

#### Step 4: Prepare Output

Return fetched task with:

- Full task metadata
- Status validation results
- Warnings (if any)
- Recommendation (proceed / reconsider / select different task)

### For AUTO-SELECT MODE

#### Step 1: Apply Filters

Filter available_tasks based on optional filters:

**Priority filter** (if provided):

```plaintext
filtered_tasks = available_tasks.filter(task => task.priority == priority_filter)
```

**Domain filter** (if provided):

```plaintext
filtered_tasks = filtered_tasks.filter(task => task.domain == domain_filter)
```

**Result**: `filtered_tasks` list for scoring

#### Step 2: Calculate Readiness Scores

For each task in filtered_tasks, calculate readiness score:

**Scoring formula**:

| Factor                | Weight | Scoring                                |
| --------------------- | ------ | -------------------------------------- |
| **Priority Level**    | 40%    | P0 (3) / P1 (2) / P2 (1)               |
| **Dependency Clear**  | 30%    | All clear (3) / Partial (2) / None (1) |
| **Effort Size**       | 20%    | XS (3) / S (2.5) / M (2) / L (1)       |
| **Context Freshness** | 10%    | Recent domain work (3) / Older (1)     |

**Calculation**:

```plaintext
Priority Score:
  - P0 → 3.0
  - P1 → 2.0
  - P2 → 1.0

Dependency Score:
  - All satisfied (dependencies_status == "all_satisfied") → 3.0
  - Partially satisfied → 2.0
  - None satisfied → 1.0

Effort Score:
  - XS → 3.0
  - S  → 2.5
  - M  → 2.0
  - L  → 1.0

Context Score:
  - Same domain as last completed task → 3.0
  - Different domain → 1.0

Readiness Score = (
  (Priority Score × 0.4) +
  (Dependency Score × 0.3) +
  (Effort Score × 0.2) +
  (Context Score × 0.1)
) / 3.0

Result: 0.0-1.0 scale (0%-100%)
```

#### Step 3: Select Optimal Task

Sort tasks by readiness score (descending):

**Selection rules**:

1. **Primary**: Highest readiness score
2. **Tie-breaker 1**: Same current execution phase
3. **Tie-breaker 2**: Same domain as recent work
4. **Tie-breaker 3**: Smaller effort (XS > S > M > L)
5. **Tie-breaker 4**: Task ID (alphabetically first)

**Select top task** as fetched_task.

#### Step 4: Identify Alternatives

Extract top 3 alternative tasks (next highest scores) for user reference.

#### Step 5: Prepare Selection Rationale

Document why this task was selected:

```plaintext
**Auto-Selected**: [TASK-ID] ([TITLE])

**Readiness Score**: [XX]% ([X.XX]/3.00)

**Score Breakdown**:
- Priority: P0 (3.0) × 0.4 = 1.2
- Dependencies: All clear (3.0) × 0.3 = 0.9
- Effort: S (2.5) × 0.2 = 0.5
- Context: Same domain as recent work (3.0) × 0.1 = 0.3
- **Total**: 2.9 / 3.0 = 97%

**Why this task?**
- Critical priority (P0)
- All dependencies satisfied
- Quick win (2 days)
- Continues recent infrastructure work

**Alternatives**:
1. [TASK-ID]: [TITLE] - Score: [XX]%
2. [TASK-ID]: [TITLE] - Score: [XX]%
3. [TASK-ID]: [TITLE] - Score: [XX]%
```

### Handle Edge Cases

#### No Available Tasks

**Scenario**: filtered_tasks is empty after filters

**Action**:

1. Check reason:
   - All tasks completed → "🎉 All tasks complete!"
   - All tasks blocked → "⚠️ All tasks blocked. Manual intervention needed."
   - Filters too restrictive → "No tasks match filters. Broaden criteria."

2. Provide recommendations:
   - If completed: Proceed to feedback
   - If blocked: Show blockers and suggest resolution
   - If filters: Suggest removing filters or checking backlog

#### Multiple Equal Scores

**Scenario**: Multiple tasks have identical readiness scores

**Action**: Apply tie-breakers in order (phase → domain → effort → ID)

#### Task Specified But Not Available

**Scenario**: User specified task_id but task is not in available_tasks

**Action**:

1. Check if task exists in backlog but is unavailable:
   - Completed: Show completion details
   - Blocked: Show blockers and dependencies
   - In-progress: Warn but allow

2. Offer alternatives or auto-select mode

## Output Format

**CRITICAL**: Your response MUST be ONLY a valid JSON object. Do NOT include any markdown formatting, code blocks, explanatory text, or anything else. Output raw JSON only.

```json
{
  "mode": "auto-select",
  "fetched_task": {
    "id": "BE0001",
    "title": "Implement authentication API endpoints",
    "domain": "Backend",
    "priority": "P0",
    "effort": "S",
    "effort_days": 2,
    "phase": 1,
    "status": "not-started",
    "requirements": ["FR-001"],
    "dependencies": ["INFRA0001", "INFRA0003"],
    "dependencies_status": "all_satisfied",
    "description": "Create REST API endpoints for user login, logout, token refresh...",
    "acceptance_criteria": [
      "POST /auth/login accepts username/password and returns JWT",
      "POST /auth/logout invalidates the user session",
      "Token refresh works before expiration"
    ],
    "technical_notes": "Use JWT with RS256, 15min access token, 7d refresh token",
    "testing_requirements": ["unit", "integration"],
    "documentation": ["API.md"]
  },
  "task_metadata": {
    "readiness_score": 0.97,
    "score_breakdown": {
      "priority": {"value": "P0", "score": 3.0, "weighted": 1.2},
      "dependencies": {"status": "all_satisfied", "score": 3.0, "weighted": 0.9},
      "effort": {"value": "S", "days": 2, "score": 2.5, "weighted": 0.5},
      "context": {"same_domain_as_recent": true, "score": 3.0, "weighted": 0.3}
    }
  },
  "blocking_dependencies": [],
  "selection_rationale": {
    "reason": "Highest readiness score (97%). Critical priority task with all dependencies satisfied, quick win that continues recent infrastructure work.",
    "alternatives": [
      {
        "id": "FE0001",
        "title": "Setup React project structure",
        "score": 0.88,
        "reason": "High priority but different domain from recent work"
      },
      {
        "id": "DB0001",
        "title": "Design database schema",
        "score": 0.85,
        "reason": "High priority but medium effort (4 days)"
      }
    ]
  },
  "warnings": [],
  "recommendation": "proceed"
}
```

**For fetch mode with warnings**:

```json
{
  "mode": "fetch",
  "fetched_task": { /* full task object */ },
  "task_metadata": {
    "user_specified": true,
    "status_check": "warning"
  },
  "blocking_dependencies": [
    {
      "id": "BE0002",
      "title": "Setup OAuth provider",
      "status": "in-progress",
      "estimated_completion": "2025-11-15"
    }
  ],
  "warnings": [
    "Task has 1 blocker: BE0002 (in-progress)",
    "Estimated ready by: 2025-11-15"
  ],
  "recommendation": "wait_or_assist",
  "selection_rationale": {
    "reason": "User-specified task. Task is partially blocked but can be prepared in parallel with BE0002."
  }
}
```

## Success Criteria

- ✅ Mode determined correctly (fetch vs auto-select)
- ✅ Task selected/fetched successfully
- ✅ Task metadata complete
- ✅ Readiness score calculated (auto-select mode)
- ✅ Selection rationale documented
- ✅ Warnings identified (if any)
- ✅ Alternatives provided (auto-select mode)
- ✅ Clear recommendation given

## Rules

**DO**:

- ✅ Respect mode - don't auto-select when task_id provided
- ✅ Calculate scores objectively using formula
- ✅ Warn about issues but allow user to proceed
- ✅ Provide alternatives in auto-select mode
- ✅ Document selection rationale clearly

**DON'T**:

- ❌ Don't override user's choice in fetch mode
- ❌ Don't block unnecessarily - warn and allow
- ❌ Don't guess scores - use formula consistently
- ❌ Don't hide selection logic - be transparent
- ❌ Don't forget filters in auto-select mode

## Notes

- This prompt is focused on TASK SELECTION only
- Project state analysis happened in `context.load-backlog`
- Dependency validation happens in `context.check-dependencies`
- Task readiness assessment happens in `review.validate-readiness`
- Keep scoring consistent and objective

