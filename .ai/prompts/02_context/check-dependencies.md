---
id: context.check-dependencies
version: 1.0.0
category: context
experimental: true
name: Check Dependencies
description: Validate task dependencies and identify blockers
tags:
  - dependency-validation
  - blocker-detection
  - task-readiness
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.load-backlog
    - onboard.fetch-task
inputs:
  - name: task
    description: Selected task from onboard.fetch-task
    type: object
    required: true
  - name: completed
    description: List of completed tasks from context.load-backlog
    type: array
    required: true
outputs:
  - dependency_status
  - blockers_list
  - satisfaction_score
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Check Dependencies

## Objective

Validate all task dependencies are satisfied and identify any blockers preventing immediate task execution.

## Instructions

### Step 1: Extract Task Dependencies

Parse the task's dependencies field:

**Input**: `task.dependencies` array

**Examples**:

```json
["INFRA0001", "INFRA0003"]
["BE0001", "BE0002", "DB0001"]
[]
```

**Handle formats**:

- Standard task IDs: "BE0001", "INFRA0005"
- Compact IDs: "BE1", "FE42" (normalize to standard format)
- Empty array: No dependencies (all clear)

### Step 2: Check Each Dependency

For each dependency in task.dependencies:

#### Validation Process

1. **Normalize dependency ID**:
   - Uppercase
   - Pad with zeros if needed (BE1 → BE0001)

2. **Check completion status**:

```plaintext
Is dependency in completed_tasks list?
  YES → ✅ Satisfied
  NO  → Check further
```

3. **Deep check** (if not in completed list):
   
   a. **Check CHANGELOG.md**:
      - Search for dependency ID
      - Check if mentioned as completed
   
   b. **Check git history**:
      - Search commits for dependency ID
      - Look for merged branches
   
   c. **Check backlog status**:
      - If dependency has "Status: completed" in backlog
      - If dependency has completion markers

4. **Classify dependency status**:
   - ✅ **Satisfied**: Dependency is completed
   - ⏳ **In Progress**: Dependency is being worked on
   - ❌ **Blocked**: Dependency not started or blocked itself
   - ❓ **Unknown**: Dependency ID not found in backlog

### Step 3: Calculate Dependency Status

Aggregate results for all dependencies:

**Status categories**:

1. **All Clear** (100% satisfied):
   - All dependencies are completed
   - Task can start immediately
   - Status: "all_satisfied"

2. **Partially Clear** (50-99% satisfied):
   - Some dependencies completed
   - Some dependencies in-progress
   - Task may be able to start with risk
   - Status: "partially_satisfied"

3. **Blocked** (< 50% satisfied):
   - Critical dependencies not met
   - Multiple dependencies not started
   - Task should not start
   - Status: "blocked"

**Satisfaction score calculation**:

```plaintext
Satisfaction Score = (Satisfied Dependencies / Total Dependencies) × 100%

Examples:
- 3/3 satisfied = 100% (all_satisfied)
- 2/3 satisfied = 67% (partially_satisfied)
- 1/3 satisfied = 33% (blocked)
- 0/3 satisfied = 0% (blocked)
```

### Step 4: Identify Blockers

For each unsatisfied dependency, extract blocker details:

**Blocker information**:

- **ID**: Dependency task ID
- **Title**: Dependency task title (from backlog)
- **Status**: Current status (in-progress, not-started, blocked)
- **Priority**: Dependency priority
- **Effort**: Estimated effort
- **Assignee**: Who's working on it (if known)
- **Estimated completion**: If in-progress, when might it be done
- **Criticality**: Is this a hard blocker or soft dependency?

**Criticality assessment**:

- **Hard blocker**: Task cannot start without this dependency
  - Infrastructure setup
  - Core API endpoint
  - Database schema
  
- **Soft dependency**: Task can partially proceed without this
  - Documentation
  - Nice-to-have features
  - Optional integrations

### Step 5: Suggest Alternatives

If task is blocked, provide recommendations:

**Recommendation types**:

1. **Wait**: If blockers are in-progress with near completion
2. **Assist**: If blockers need help and user can contribute
3. **Alternative task**: If blockers will take long, suggest different task
4. **Escalate**: If critical path is blocked, human intervention needed

**Alternative task selection**:

- Find next-best available task (no blockers)
- Same priority level if possible
- Suggest 2-3 alternatives

### Step 6: Generate Dependency Report

Create structured dependency status report.

## Output Format

**CRITICAL**: Your response MUST be ONLY a valid JSON object. Do NOT include any markdown formatting, code blocks, explanatory text, or anything else. Output raw JSON only.

**Scenario 1: All dependencies satisfied**

```json
{
  "dependency_status": "all_satisfied",
  "satisfaction_score": 100,
  "total_dependencies": 2,
  "satisfied_dependencies": 2,
  "blockers_list": [],
  "details": [
    {
      "id": "INFRA0001",
      "title": "Setup Docker development environment",
      "status": "satisfied",
      "completed_date": "2025-11-10",
      "completed_via": "PR #123"
    },
    {
      "id": "INFRA0003",
      "title": "Configure PostgreSQL database",
      "status": "satisfied",
      "completed_date": "2025-11-11",
      "completed_via": "commit abc123"
    }
  ],
  "can_start_immediately": true,
  "recommendation": "proceed",
  "message": "✅ All dependencies satisfied. Task is ready to start."
}
```

**Scenario 2: Partially satisfied dependencies**

```json
{
  "dependency_status": "partially_satisfied",
  "satisfaction_score": 67,
  "total_dependencies": 3,
  "satisfied_dependencies": 2,
  "blockers_list": [
    {
      "id": "BE0002",
      "title": "Setup OAuth2 provider integration",
      "status": "in-progress",
      "priority": "P0",
      "effort": "M",
      "effort_days": 3,
      "estimated_completion": "2025-11-15",
      "assignee": "unknown",
      "criticality": "hard_blocker",
      "message": "In progress - expected completion in 2 days"
    }
  ],
  "details": [
    {
      "id": "INFRA0001",
      "status": "satisfied"
    },
    {
      "id": "INFRA0003",
      "status": "satisfied"
    },
    {
      "id": "BE0002",
      "status": "in_progress",
      "criticality": "hard_blocker"
    }
  ],
  "can_start_immediately": false,
  "recommendation": "wait_or_assist",
  "message": "⚠️ Task has 1 blocker in progress (BE0002). Consider waiting for completion or assisting with blocker.",
  "alternatives": [
    {
      "id": "FE0001",
      "title": "Setup React project structure",
      "readiness_score": 0.88
    },
    {
      "id": "DB0001",
      "title": "Design database schema",
      "readiness_score": 0.85
    }
  ]
}
```

**Scenario 3: Blocked task**

```json
{
  "dependency_status": "blocked",
  "satisfaction_score": 33,
  "total_dependencies": 3,
  "satisfied_dependencies": 1,
  "blockers_list": [
    {
      "id": "BE0001",
      "title": "Implement authentication API",
      "status": "not-started",
      "priority": "P0",
      "effort": "S",
      "effort_days": 2,
      "criticality": "hard_blocker",
      "message": "Not started - blocking task"
    },
    {
      "id": "BE0003",
      "title": "Setup rate limiting middleware",
      "status": "not-started",
      "priority": "P1",
      "effort": "S",
      "effort_days": 1,
      "criticality": "hard_blocker",
      "message": "Not started - blocking task"
    }
  ],
  "details": [
    {
      "id": "INFRA0001",
      "status": "satisfied"
    },
    {
      "id": "BE0001",
      "status": "not_started",
      "criticality": "hard_blocker"
    },
    {
      "id": "BE0003",
      "status": "not_started",
      "criticality": "hard_blocker"
    }
  ],
  "can_start_immediately": false,
  "recommendation": "select_alternative",
  "message": "❌ Task has 2 hard blockers that are not started. Recommend selecting a different task or starting with blockers first.",
  "alternatives": [
    {
      "id": "BE0001",
      "title": "Implement authentication API",
      "note": "Start with this blocker first"
    },
    {
      "id": "FE0001",
      "title": "Setup React project structure",
      "note": "Alternative task with no blockers"
    }
  ]
}
```

**Scenario 4: No dependencies**

```json
{
  "dependency_status": "all_satisfied",
  "satisfaction_score": 100,
  "total_dependencies": 0,
  "satisfied_dependencies": 0,
  "blockers_list": [],
  "details": [],
  "can_start_immediately": true,
  "recommendation": "proceed",
  "message": "✅ No dependencies. Task is ready to start immediately."
}
```

## Success Criteria

- ✅ All dependencies validated
- ✅ Completion status checked for each dependency
- ✅ Satisfaction score calculated
- ✅ Blockers identified and detailed
- ✅ Criticality assessed (hard vs soft blockers)
- ✅ Clear recommendation provided
- ✅ Alternatives suggested (if blocked)

## Rules

**DO**:

- ✅ Check multiple sources (completed list, CHANGELOG, git)
- ✅ Distinguish between hard and soft blockers
- ✅ Provide estimated completion for in-progress blockers
- ✅ Suggest alternatives when blocked
- ✅ Be objective - use actual completion data

**DON'T**:

- ❌ Don't assume dependencies are satisfied without checking
- ❌ Don't treat all blockers equally (assess criticality)
- ❌ Don't block tasks with soft dependencies only
- ❌ Don't suggest proceeding with hard blockers unsatisfied
- ❌ Don't forget to check git history for completion

## Notes

- This prompt is focused on DEPENDENCY VALIDATION only
- Task selection happened in `onboard.fetch-task`
- Overall readiness assessment happens in `review.validate-readiness`
- Be conservative - when in doubt, flag as blocker
- Provide actionable recommendations (wait / assist / alternative)

