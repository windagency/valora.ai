---
id: context.load-backlog
version: 1.0.0
category: context
experimental: true
name: Load Backlog
description: Load and parse project backlog for task retrieval and project state analysis
tags:
  - backlog
  - task-management
  - context-loading
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
  - name: backlog_file_arg
    description: Optional path to backlog file from --backlog-file argument
    type: string
    required: false
outputs:
  - backlog_document
  - available_tasks
  - completed_tasks
  - project_state
tokens:
  avg: 3000
  max: 6000
  min: 1500
---

# Load Backlog

## Objective

Locate and load the project backlog, then extract all tasks and analyze current project state to support task selection and readiness assessment.

## Instructions

### Step 1: Locate Backlog Document

Check for backlog in priority order:

1. **User-provided file** (if `backlog_file_arg` provided):
   - Read file at specified path
   - Validate it's a backlog document
   - Use as primary source

2. **BACKLOG.md** in `knowledge-base/`:
   - Check for `knowledge-base/BACKLOG.md`
   - Use if exists

3. **Timestamped backlog** in `knowledge-base/`:
   - Search for `knowledge-base/BACKLOG-*.md` files
   - Sort by timestamp (most recent first)
   - Read most recent file

4. **TODO.md** as fallback:
   - Check for `TODO.md` in project root
   - Use as fallback source

5. **Fail if not found**:
   - List available files in knowledge-base/ and project root
   - Inform user: "No backlog found. Please run `/create-backlog` first or provide --backlog-file argument."
   - Exit with error

### Step 2: Parse Backlog Structure

Extract all key sections from the backlog:

**Core sections**:

- **Project metadata**: Name, description, current phase
- **Execution phases**: Phase definitions and task groupings
- **Tasks list**: All tasks with complete metadata
- **Completed tasks**: Tasks marked as done/completed
- **In-progress tasks**: Tasks currently being worked on
- **Blocked tasks**: Tasks with unsatisfied dependencies

**Parse task format** (per task):

- **ID** (e.g., BE0001, FE0042, INFRA0005)
- **Title**: Task name/description
- **Domain**: Frontend, Backend, Data, Infrastructure, Testing, Documentation
- **Priority**: P0, P1, P2
- **Effort**: XS, S, M, L (with day estimates)
- **Phase**: Execution phase number (0-5)
- **Status**: not-started, in-progress, completed, blocked
- **Requirements**: Linked PRD requirement IDs
- **Dependencies**: Other task IDs this task depends on
- **Description**: Detailed explanation
- **Acceptance Criteria**: List of testable criteria
- **Technical Notes**: Implementation guidance
- **Testing Requirements**: Test types needed
- **Documentation**: Docs to create/update

### Step 3: Analyze Project State

Build comprehensive project state snapshot:

#### Completed Tasks

Check multiple sources to identify completed tasks:

1. **Backlog status markers**:
   - Tasks marked with "Status: completed" or "✅ Done"
   - Tasks in "Completed Tasks" section

2. **CHANGELOG.md**:
   - Parse CHANGELOG for completed task entries
   - Extract task IDs from commit messages
   - Look for patterns like "[BE0001]", "Task BE0001", etc.

3. **Git commit history**:
   - Run `git log` with grep for task IDs
   - Identify merged feature branches
   - Check commit messages for task references

4. **Build completed task list**:
   - Deduplicate task IDs from all sources
   - Create list of completed task IDs with completion dates (if available)

#### In-Progress Tasks

Identify tasks currently being worked on:

1. **Backlog markers**: Tasks marked "Status: in-progress"
2. **Git branches**: Feature branches in `git branch` list
3. **Open PRs**: Check for open pull requests (if accessible)
4. **Recent commits**: Very recent commits referencing task IDs

#### Current Branch State

1. **Active branch**: Get current branch name from `git branch`
2. **Uncommitted changes**: Check for uncommitted work with `git status`
3. **Clean state**: Verify if working directory is clean

#### Project Statistics

Calculate:

- Total tasks in backlog
- Tasks by status (not-started, in-progress, completed, blocked)
- Tasks by priority (P0, P1, P2)
- Tasks by domain (Frontend, Backend, etc.)
- Tasks by phase (0-5)
- Current phase (based on completed tasks)
- Completion percentage

### Step 4: Extract Available Tasks

Identify tasks available for selection:

**Available task criteria**:

```plaintext
Available Task = Task where:
  - Status != "completed" AND
  - Status != "blocked" AND
  - All dependencies ARE completed (or empty)
```

**For each task**, check:

1. **Not completed**: Task ID not in completed_tasks list
2. **Not blocked**: Status is not "blocked"
3. **Dependencies satisfied**: All dependency task IDs are in completed_tasks list
4. **Optional: Not in-progress** (unless explicitly allowed)

**Build available_tasks list** with full task metadata.

### Step 5: Extract Metadata

**Project metadata**:

- Project name
- Current execution phase
- Timeline/milestones (if specified)
- Project type (greenfield, brownfield, etc.)

**Backlog statistics**:

- Total tasks count
- Available tasks count
- Completed tasks count
- In-progress tasks count
- Blocked tasks count
- P0/P1/P2 distribution
- Domain distribution

### Step 6: Validate Backlog Usability

Quick validation for task fetching:

**Required for task fetching**:

- [ ] At least 1 task exists in backlog
- [ ] Tasks have IDs
- [ ] Tasks have status information
- [ ] Tasks have priority assignments

**Warnings**:

- [ ] No available tasks (warn - all blocked or completed)
- [ ] Missing dependencies (warn but proceed)
- [ ] Incomplete task metadata (warn but proceed)

**Usability decision**:

- **At least 1 available task**: Sufficient for fetching
- **All tasks completed**: Backlog done - inform user
- **All tasks blocked**: Critical path issue - escalate
- **No tasks found**: Invalid backlog - error

## Output Format

**CRITICAL**: Your response MUST be ONLY a valid JSON object. Do NOT include any markdown formatting, code blocks, explanatory text, or anything else. Output raw JSON only.

```json
{
  "backlog_document": {
    "source_file": "knowledge-base/BACKLOG.md",
    "metadata": {
      "project_name": "Task Management Platform",
      "project_type": "brownfield",
      "current_phase": 2,
      "last_updated": "2025-11-13",
      "timeline": {
        "target_completion": "Q2 2026",
        "milestones": [
          {"name": "Foundation Complete", "phase": 0, "status": "completed"},
          {"name": "Core Backend", "phase": 1, "status": "in-progress"}
        ]
      }
    },
    "execution_phases": [
      {
        "phase": 0,
        "name": "Foundation",
        "description": "Infrastructure and development environment setup",
        "task_count": 5,
        "completed_count": 5,
        "status": "completed"
      },
      {
        "phase": 1,
        "name": "Core Backend",
        "description": "Authentication and core API implementation",
        "task_count": 8,
        "completed_count": 3,
        "status": "in-progress"
      }
    ]
  },
  "available_tasks": [
    {
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
    }
  ],
  "completed_tasks": [
    {
      "id": "INFRA0001",
      "title": "Setup Docker development environment",
      "completed_date": "2025-11-10",
      "completed_via": "PR #123"
    },
    {
      "id": "INFRA0003",
      "title": "Configure PostgreSQL database",
      "completed_date": "2025-11-11",
      "completed_via": "commit abc123"
    }
  ],
  "project_state": {
    "current_branch": "main",
    "working_directory": "clean",
    "uncommitted_changes": false,
    "recent_work": [
      {
        "task_id": "INFRA0003",
        "domain": "Infrastructure",
        "completed": "2025-11-11"
      }
    ]
  },
  "statistics": {
    "total_tasks": 42,
    "by_status": {
      "not_started": 32,
      "in_progress": 2,
      "completed": 5,
      "blocked": 3
    },
    "by_priority": {
      "p0": 18,
      "p1": 18,
      "p2": 6
    },
    "by_domain": {
      "frontend": 12,
      "backend": 15,
      "data": 5,
      "infrastructure": 4,
      "testing": 4,
      "documentation": 2
    },
    "completion_percentage": 12,
    "available_tasks_count": 32,
    "estimated_remaining_days": 87
  },
  "validation": {
    "is_valid": true,
    "has_tasks": true,
    "has_available_tasks": true,
    "warnings": [
      "3 tasks are blocked by dependencies"
    ],
    "ready_for_fetch": true
  }
}
```

## Success Criteria

- ✅ Backlog document located and loaded
- ✅ All tasks extracted with complete metadata
- ✅ Project state analyzed (completed, in-progress, available tasks)
- ✅ Current branch and working directory state captured
- ✅ Statistics calculated
- ✅ Available tasks identified
- ✅ Basic validation passed
- ✅ Ready for task selection stage

## Error Handling

### Backlog Not Found

**Issue**: Cannot locate backlog document

**Action**:

1. List files in knowledge-base/ and project root
2. Inform user: "No backlog found. Please run `/create-backlog` first or specify `--backlog-file` argument."
3. Exit with error (do not proceed)

### Malformed Backlog

**Issue**: Backlog exists but doesn't parse correctly

**Action**:

1. Attempt partial parsing
2. Extract what's available
3. Warn user about missing sections
4. Proceed if at least 1 task with ID found

### No Available Tasks

**Issue**: All tasks are completed or blocked

**Action**:

1. If all completed: "🎉 All tasks complete! Project done."
2. If all blocked: "⚠️ All remaining tasks are blocked. Manual intervention required."
3. Provide recommendations for next steps

## Notes

- This prompt is focused on LOADING and PARSING only
- No task selection happens here (that's in next stage)
- Structure output for easy consumption by `onboard.fetch-task` prompt
- Validation is lightweight (just check if task fetching is possible)
- Detailed task analysis happens in subsequent stages

