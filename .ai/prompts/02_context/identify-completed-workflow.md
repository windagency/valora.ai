---
id: context.identify-completed-workflow
version: 1.0.0
category: context
experimental: true
name: Identify Completed Workflow
description: Reconstruct workflow execution chain from command history, git commits, and PR metadata
tags:
  - workflow-analysis
  - feedback
  - execution-tracking
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - product-manager
dependencies:
  requires: []
inputs:
  - name: command_name
    description: Optional command name to start from (e.g., create-pr, implement)
    type: string
    required: false
  - name: pr_number
    description: Optional PR number to extract workflow from
    type: number
    required: false
outputs:
  - workflow_executed
  - commands_chain
  - start_time
  - end_time
  - execution_duration
tokens:
  avg: 2500
  max: 5000
  min: 1200
---

# Identify Completed Workflow

## Objective

Reconstruct the complete workflow execution chain by analyzing git history, PR metadata, and command logs to understand what was executed and in what order.

## Instructions

### Available Tools

**Use these tools to gather information:**

1. **query_session** - Access session data safely:
   - `action: "list"` - List recent sessions with metadata
   - `action: "get", session_id: "<id>"` - Get specific session details
   - `action: "search", query: "<text>"` - Search across sessions

2. **Git commands** via `run_terminal_cmd`:
   - `git log`, `git show`, `git diff`, `git branch`

3. **read_file** - Read command/agent definitions:
   - `.ai/commands/*.md`
   - `.ai/agents/*.md`

**DO NOT use:**
- `read_file` on `.ai/sessions/` - blocked for safety, use `query_session` instead
- `npm run lint`, `pnpm lint`, `npm test` - slow and not needed for analysis

### Step 1: Determine Workflow Entry Point

**If `pr_number` provided:**
- Use GitHub MCP to fetch PR details
- Extract branch name, commits, and timeline
- Identify workflow from PR metadata and commit messages

**If `command_name` provided:**
- Start reconstruction from specified command
- Look backwards through git history

**Otherwise:**
- Analyze recent git commits (last 24 hours)
- Identify command patterns from commit messages
- Use conventional commit format to detect phases

### Step 2: Analyze Git History

Run:

```bash
git log --oneline --since="24 hours ago" --all
```

Extract workflow phases from commit messages:
- Look for conventional commit types: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
- Identify command signatures in commit bodies
- Track branch creation/merge events
- Calculate time between commits

### Step 3: Map to Workflow Phases

Identify which phases were executed based on commit patterns:

**Initialization Phase:**
- `refine-specs`, `create-prd`, `create-backlog` commands

**Task Preparation:**
- `fetch-task`, `refine-task`, `gather-knowledge` commands

**Planning:**
- `plan`, `review-plan` commands

**Implementation:**
- `implement`, `implement step-by-step` commands
- Multiple commits with feature changes

**Validation:**
- `assert`, `test` commands
- Test-related commits

**Review:**
- `review-code`, `review-functional` commands

**Finalization:**
- `commit`, `create-pr` commands

### Step 4: Reconstruct Command Chain

For each identified command:

1. **Command name** (from commit or history)
2. **Agent used** (infer from command type)
3. **Timestamp** (from git commit or PR events)
4. **Duration** (time between command markers)

Build chronological chain with timing data.

### Step 5: Calculate Metrics

- **Workflow name**: Identify type (feature-implementation, bugfix, refactor)
- **Start time**: First relevant commit timestamp
- **End time**: Last commit or PR creation time
- **Total duration**: End - Start (in seconds)
- **Command count**: Number of distinct commands executed

## Output Format

```json
{
  "workflow_executed": "feature-implementation",
  "commands_chain": [
    {
      "command": "fetch-task",
      "agent": "product-manager",
      "start_time": "2025-11-15T10:00:00Z",
      "end_time": "2025-11-15T10:02:30Z",
      "duration_seconds": 150
    },
    {
      "command": "plan",
      "agent": "lead",
      "start_time": "2025-11-15T10:03:00Z",
      "end_time": "2025-11-15T10:08:45Z",
      "duration_seconds": 345
    }
  ],
  "start_time": "2025-11-15T10:00:00Z",
  "end_time": "2025-11-15T11:30:00Z",
  "execution_duration": 5400,
  "metadata": {
    "pr_number": 123,
    "branch_name": "feature/oauth2",
    "total_commands": 6
  }
}
```

## Success Criteria

- ✅ Workflow type identified accurately
- ✅ All commands in chain have timestamps
- ✅ Duration calculated correctly
- ✅ Agent assignments match command definitions
- ✅ Chain is in chronological order

## Error Handling

- **No recent activity**: Return error - no workflow to analyze
- **Ambiguous workflow**: Use best-effort reconstruction with confidence score
- **Missing timestamps**: Estimate based on git commit times
- **PR not found**: Fall back to git history analysis only

