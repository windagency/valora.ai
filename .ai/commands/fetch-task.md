---
name: fetch-task
description: Retrieve and contextualize a task from the project backlog - either specified or auto-selected next priority
experimental: true
argument-hint: '[--task-id=<id>] [--keywords=<fuzzy-search>] [--priority=<p0|p1|p2>] [--domain=<frontend|backend|infra|data|test|doc>]'
allowed-tools:
  - read_file
  - list_dir
  - glob_file_search
  - codebase_search
  - grep
  - run_terminal_cmd
model: claude-haiku-4.5
agent: product-manager
prompts:
  pipeline:
    - stage: context
      prompt: context.load-backlog
      required: true
      inputs:
        backlog_file_arg: $ARG_backlog_file
      outputs:
        - backlog_document
        - available_tasks
        - completed_tasks
        - project_state
    - stage: onboard
      prompt: onboard.fetch-task
      required: true
      inputs:
        backlog: $STAGE_context.backlog_document
        available_tasks: $STAGE_context.available_tasks
        task_id: $ARG_task_id
        keywords: $ARG_keywords
        priority_filter: $ARG_priority
        domain_filter: $ARG_domain
      outputs:
        - fetched_task
        - task_metadata
        - selection_rationale
    - stage: dependencies
      prompt: context.check-dependencies
      required: true
      inputs:
        task: $STAGE_onboard.fetched_task
        completed: $STAGE_context.completed_tasks
      outputs:
        - dependency_status
        - blockers_list
        - satisfaction_score
    - stage: review
      prompt: review.validate-readiness
      required: true
      inputs:
        task: $STAGE_onboard.fetched_task
        dependencies: $STAGE_dependencies
      outputs:
        - readiness_score
        - readiness_issues
        - recommendation
  merge_strategy: sequential
  rollback_on_failure: context
  cache_strategy: none
  retry_policy:
    max_attempts: 1
    backoff_ms: 0
    retry_on: []
---

# Task Fetch Command

## Role

Use the [agent] profile

## Goal

Retrieve a task from the backlog and prepare it for implementation by:

1. **Loading the project backlog** with current project state
2. **Selecting a task** (user-specified OR auto-selected by readiness)
3. **Validating dependencies** to identify blockers
4. **Assessing readiness** for immediate implementation
5. **Presenting task details** with clear next steps

**Two Modes**:

- **Fetch Mode**: `/fetch-task --task-id=BE0001` → Fetch specific task
- **Auto-Select Mode**: `/fetch-task` → Select next priority task (filterable by `--priority` and `--domain`)

## Context

### Input Arguments

```plaintext
$ARGUMENTS
```

**Supported arguments**:

- `--task-id=<id>`: Specific task to fetch (Fetch Mode)
- `--keywords=<text>`: Fuzzy search for task by description (Fetch Mode)
- `--priority=<p0|p1|p2>`: Filter by priority (Auto-Select Mode)
- `--domain=<domain>`: Filter by domain (Auto-Select Mode)

## Process Overview

The command executes a **4-stage pipeline**:

### Stage 1: Load Backlog (context.load-backlog)

**Purpose**: Locate and parse the project backlog, analyze project state.

**Actions**:

- Locate backlog document (knowledge-base/BACKLOG.md, TODO.md, etc.)
- Parse all tasks with complete metadata
- Identify completed tasks (from CHANGELOG, git history, backlog status)
- Identify in-progress tasks (from backlog status, git branches, PRs)
- Extract available tasks (not completed, not blocked)
- Calculate project statistics and current phase

**Outputs**: `backlog_document`, `available_tasks`, `completed_tasks`, `project_state`

---

### Stage 2: Fetch/Select Task (onboard.fetch-task)

**Purpose**: Either fetch user-specified task OR auto-select next priority task.

**Mode Detection**:

- **Fetch Mode** (if `--task-id` or `--keywords` provided): Find and validate specified task
- **Auto-Select Mode** (otherwise): Calculate readiness scores and select optimal task

**Actions**:

**Fetch Mode**:

- Parse task identifier from arguments
- Find matching task in backlog
- Validate task status (warn if completed/in-progress)
- Return specified task with warnings

**Auto-Select Mode**:

- Apply filters (priority, domain) to available tasks
- Calculate readiness scores (priority 40%, dependencies 30%, effort 20%, context 10%)
- Select highest-scoring task
- Identify top 3 alternatives
- Document selection rationale

**Outputs**: `fetched_task`, `task_metadata`, `selection_rationale`

---

### Stage 3: Check Dependencies (context.check-dependencies)

**Purpose**: Validate all task dependencies and identify blockers.

**Actions**:

- Extract task dependencies from fetched task
- Check each dependency against completed tasks list
- Deep check via CHANGELOG, git history, backlog status
- Calculate satisfaction score (% of dependencies satisfied)
- Classify status: all_satisfied (100%), partially_satisfied (50-99%), blocked (<50%)
- Identify blockers with details (status, effort, criticality)
- Suggest alternatives if blocked

**Outputs**: `dependency_status`, `blockers_list`

---

### Stage 4: Validate Readiness (review.validate-readiness)

**Purpose**: Final readiness assessment before proceeding to implementation.

**Actions**:

- Evaluate 8 readiness criteria:
  1. Task exists
  2. Task not completed
  3. Task not in-progress
  4. Dependencies satisfied
  5. Requirements clear (description + acceptance criteria)
  6. Domain specified
  7. Effort estimated (≤ 5 days)
  8. PRD requirements linked

- Calculate readiness score (0-100%)
- Apply quality gates:
  - 100%: ✅ Fully ready → proceed
  - 75-99%: ⚠️ Ready with warnings → proceed with caution
  - <75%: ❌ Not ready → fix gaps first

- Generate recommendations and next steps

**Outputs**: `readiness_score`, `readiness_issues`, `recommendation`

---

## Task Presentation

After pipeline execution, present the task to the user:

```markdown
# 🎯 Task Fetched: [TASK-ID]

**Title**: [Task Title]
**Status**: [Ready / Ready with Warnings / Not Ready]
**Readiness Score**: [XX]%

---

## 📋 Task Details

**Priority**: [P0/P1/P2]
**Domain**: [Frontend/Backend/Infrastructure/Data/Testing/Documentation]
**Effort**: [XS/S/M/L] ([X days])
**Phase**: [Phase X: Name]

**Description**:
[Full task description]

**Acceptance Criteria**:
1. [Criterion 1]
2. [Criterion 2]
3. [Criterion 3]

**Technical Notes**:
[Implementation guidance]

**Testing Requirements**: [unit, integration, e2e]
**Documentation**: [Files to update]

---

## 🔗 Linked Requirements

- **PRD Requirement**: [FR-XXX] - [Requirement title]

---

## 🧩 Dependencies

[If no dependencies]:
✅ **No dependencies** - Ready to start immediately

[If all satisfied]:
✅ **All dependencies satisfied**:
- ✅ [TASK-XXX]: [Title] (Completed [date])
- ✅ [TASK-YYY]: [Title] (Completed [date])

[If blockers]:
❌ **Blockers identified**:
- ❌ [TASK-ZZZ]: [Title] (Status: [in-progress/not-started])
  - Effort: [X days]
  - ETA: [date or unknown]

**Satisfaction Score**: [XX]% ([X/Y dependencies satisfied])

---

## 📊 Readiness Assessment

**Readiness Score**: [XX]%

[If 100%]:
✅ **Fully Ready**: All criteria met. Task ready for implementation.

[If 75-99%]:
⚠️ **Ready with Warnings**: Minor gaps identified.

**Warnings**:
- [Warning 1]
- [Warning 2]

[If <75%]:
❌ **Not Ready**: Significant gaps prevent immediate implementation.

**Critical Gaps**:
- [Gap 1]
- [Gap 2]

---

## 🚀 Next Steps

[If readiness ≥ 75%]:
✅ **Proceed to**: `/refine-task [TASK-ID]`

This will create a detailed implementation plan with:
- Technical context and architecture patterns
- File locations and dependencies
- Implementation steps
- Testing strategy

[If readiness < 75%]:
❌ **Cannot proceed**. Options:
1. Fix critical gaps (see above)
2. Select different task: `/fetch-task [--filters]`
3. Refine backlog: `/create-backlog`
4. Escalate to human for clarification

---

## 📈 Project Context

[If auto-select mode]:
**Selection Rationale**:
[Why this task was selected - readiness score breakdown]

**Top Alternatives**:
1. [TASK-ID]: [Title] - Score: [XX]%
2. [TASK-ID]: [Title] - Score: [XX]%

**Current Phase**: [Phase X: Name]
**Completed Tasks**: [X/Total] ([XX]% complete)
**Current Branch**: [branch-name]
**Recent Work**: [Last completed task]
```

---

## Success Indicators

This command succeeds when:

1. ✅ Backlog successfully loaded and parsed
2. ✅ Task selected/fetched successfully
3. ✅ Task metadata complete and accurate
4. ✅ Dependencies validated and blockers identified (if any)
5. ✅ Readiness score calculated and assessed
6. ✅ Clear recommendation provided (proceed / fix gaps / alternatives)
7. ✅ User understands next steps

---

## Integration with Workflow

**Entry Point**: After `/create-backlog` (Task Preparation Phase)

**Prerequisites**:

- ✅ Backlog exists (knowledge-base/BACKLOG.md or TODO.md)
- ✅ At least one task available (not completed, not blocked)

**Exits**:

- ✅ **Success** (readiness ≥ 75%): → `/refine-task [TASK-ID]`
- 🔄 **Task Not Found**: → User provides different identifier
- 🔄 **Task Blocked**: → Resolve dependencies or select different task
- 🔄 **Not Ready** (< 75%): → Fix gaps or select different task
- 🔄 **All Tasks Complete**: → `/feedback` (project done!)

## Command Output Summary

Print the following summary at command completion:

**For successful fetch:**

```markdown
## 🎯 Task Fetched: [TASK-ID]

**Title**: [Task Title]
**Readiness Score**: [XX]%
**Status**: [Ready | Ready with Warnings | Not Ready]

### Task Details
- **Priority**: [P0/P1/P2]
- **Domain**: [Frontend/Backend/Infrastructure]
- **Effort**: [XS/S/M/L]
- **Dependencies**: [N] resolved, [N] pending

### Acceptance Criteria
- [AC1]
- [AC2]
- [AC3]

### Next Step
→ `/refine-task [TASK-ID]` to clarify requirements before planning
```

**For blocked task:**

```markdown
## ⚠️ Task Blocked: [TASK-ID]

**Title**: [Task Title]
**Status**: Blocked by dependencies

### Blocking Dependencies
- ❌ [TASK-XXX]: [Status/Description]
- ❌ [TASK-YYY]: [Status/Description]

### Recommendations
- Resolve blocking tasks first
- Or select alternative task

### Alternative Tasks Available
1. [TASK-ALT1]: [Title] (Ready)
2. [TASK-ALT2]: [Title] (Ready)

### Next Step
→ `/fetch-task [TASK-ALT1]` to select alternative
```

**For all tasks complete:**

```markdown
## 🎉 All Tasks Complete!

**Backlog Status**: 100% Complete
**Total Tasks Completed**: [N]

### Summary
- P0 Tasks: [N] completed
- P1 Tasks: [N] completed
- P2 Tasks: [N] completed

### Next Step
→ `/feedback` to capture project learnings
```

**Workflow Position**:

```plaintext
create-backlog → fetch-task → refine-task → plan → implement
                     ↓
                (if blocked)
                     ↓
            Alternative task or
            Fix blockers first
```

---

## Rules & Constraints

### DO

✅ Support both modes (fetch-specific OR auto-select)  
✅ Respect user choice (if task specified, fetch it)  
✅ Use objective readiness scoring (formula-based)  
✅ Check multiple sources for completion (CHANGELOG, git, backlog)  
✅ Validate dependencies thoroughly  
✅ Distinguish hard vs soft blockers  
✅ Provide clear, actionable recommendations  
✅ Show alternatives when blocked or auto-selecting  
✅ Enable traceability (link to PRD requirements)  
✅ Communicate transparently (show selection logic)

### DON'T

❌ Don't confuse modes (fetch vs auto-select)  
❌ Don't override user's explicit choice  
❌ Don't skip dependency validation  
❌ Don't assume task completion without checking  
❌ Don't treat all blockers equally (assess criticality)  
❌ Don't block unnecessarily (warn but allow for soft issues)  
❌ Don't hide selection logic (be transparent)  
❌ Don't approve tasks < 75% readiness

---

## Notes

### Command vs Prompts Separation

This command **orchestrates** the task fetching workflow. Detailed logic lives in prompts:

- **context.load-backlog**: Backlog parsing, project state analysis
- **onboard.fetch-task**: Task selection logic, readiness scoring
- **context.check-dependencies**: Dependency validation, blocker detection
- **review.validate-readiness**: Final readiness assessment

This separation ensures:

- **Reusability**: Prompts can be used by other commands
- **Maintainability**: Logic changes don't require command updates
- **Clarity**: Command focuses on workflow, prompts on implementation
- **Token efficiency**: Avoid duplicating instructions

### When to Use Each Mode

**Use Auto-Select Mode** (`/fetch-task`) when:

- Starting new work and want most important task
- Trust the prioritization system
- Want quick workflow continuation
- Working through backlog systematically

**Use Fetch Mode** (`/fetch-task --task-id=<id>`) when:

- Need to work on specific task
- Overriding priority for valid reasons
- Task explicitly assigned
- Need to unblock dependent tasks
- Working on specific bug/feature request

### Task State Tracking

This command does NOT change task status. Status updates happen at:

- `/refine-task` → may mark task as in-progress (optional)
- `/commit` → marks task complete

### Concurrent Work

For teams with multiple developers:

- Auto-select mode avoids tasks marked "in-progress"
- Fetch mode warns but allows (user may want to assist)
- Check git branches and PRs for concurrent work

---

## Examples

### Example 1: Auto-Select Mode

**Input**: `/fetch-task`

**Output**:

```plaintext
🎯 Task Fetched: BE0001

Title: Implement authentication API endpoints
Status: ✅ Fully Ready
Readiness Score: 97%

[... task details ...]

Dependencies: ✅ All satisfied (INFRA0001 ✅, INFRA0003 ✅)

Readiness: 100% - All criteria met

Selection Rationale:
- Highest readiness score (97%)
- Critical priority (P0)
- All dependencies satisfied
- Quick win (2 days)
- Continues recent infrastructure work

Next Step: /refine-task BE0001
```

### Example 2: Fetch Mode - Specific Task

**Input**: `/fetch-task --task-id=FE0005`

**Output**:

```plaintext
🎯 Task Fetched: FE0005

Title: Implement user login form component
Status: ⚠️ Ready with Warnings
Readiness Score: 88%

[... task details ...]

Dependencies: ⚠️ Partially satisfied
- ✅ BE0001: Completed
- ❌ BE0002: In progress (ETA: 2025-11-15)

Readiness: 88% - Minor gaps

Warnings:
- 1 dependency in-progress (BE0002)

Options:
1. Proceed to /refine-task FE0005 (prepare in parallel)
2. Wait for BE0002 completion
3. Assist with BE0002
```

### Example 3: Fetch Mode - Task Not Found

**Input**: `/fetch-task --task-id=XYZ9999`

**Output**:

```plaintext
❌ Task not found: XYZ9999

Similar tasks:
- XY0001: Setup XY integration
- XYZ0002: Configure XYZ service

Options:
1. Verify task ID and retry
2. Auto-select next task: /fetch-task
3. Browse backlog: knowledge-base/BACKLOG.md
```

### Example 4: Auto-Select with Filters

**Input**: `/fetch-task --priority=P0 --domain=Backend`

**Output**:

```plaintext
🎯 Task Fetched: BE0003

Title: Setup rate limiting middleware
Status: ✅ Fully Ready
Readiness Score: 94%

Filters Applied:
- Priority: P0 only
- Domain: Backend only

Matched: 3 tasks
Selected: Highest readiness score

Next Step: /refine-task BE0003
```

---

## Error Handling

### No Backlog Found

**Scenario**: Backlog file doesn't exist

**Response**: "No backlog found. Please run `/create-backlog` first."

### All Tasks Complete

**Scenario**: All backlog tasks completed

**Response**: "🎉 All tasks complete! Project done. Proceed to `/feedback`."

### All Tasks Blocked

**Scenario**: All remaining tasks have unsatisfied dependencies

**Response**: "⚠️ All remaining tasks are blocked. Manual intervention required to unblock critical path."

### Task Readiness < 75%

**Scenario**: Selected task not ready for implementation

**Response**: "❌ Task not ready (62% readiness). Fix critical gaps or select alternative task."
