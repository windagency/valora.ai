---
id: context.analyze-command-execution
version: 1.0.0
category: context
experimental: true
name: Analyze Command Execution
description: Extract detailed execution metadata from each command in the workflow chain
tags:
  - workflow-analysis
  - feedback
  - execution-metrics
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.identify-completed-workflow
    - context.use-modern-cli-tools
inputs:
  - name: workflow_executed
    description: Workflow type from previous stage
    type: string
    required: true
  - name: commands_chain
    description: Chain of commands from previous stage
    type: array
    required: true
outputs:
  - agents_used
  - prompts_executed
  - tools_invoked
  - files_changed
  - errors_encountered
  - retries_performed
tokens:
  avg: 3000
  max: 6000
  min: 1500
---

# Analyze Command Execution

## Objective

Extract detailed execution metadata from each command including agents, prompts, tools, file changes, errors, and retries.

## Instructions

### Available Tools

**Use these tools to gather information:**

1. **query_session** - Access session data safely:
   - `action: "get", session_id: "<id>"` - Get command execution details
   - `action: "search", query: "<command-name>"` - Find command executions

2. **Git commands** via `run_terminal_cmd`:
   - `git log`, `git diff`, `git show` - Analyze changes

3. **read_file** - Read definitions:
   - `.ai/commands/*.md` - Command definitions
   - `.ai/agents/*.md` - Agent definitions

**DO NOT use:**
- `read_file` on `.ai/sessions/` - use `query_session` instead
- `npm run lint`, `npm test` - not needed for analysis

### Step 1: Identify Agents and Prompts

For each command in `commands_chain`:

**Map command to agent:**
- Use agent responsibilities from WORKFLOW.md
- Examples: `plan` → `@lead`, `implement` → `@<area>-engineer`, `test` → `@qa`

**Identify prompts executed:**
- Load command definition from `.ai/commands/<command>.md`
- Extract prompt pipeline stages
- List all prompts by stage (context.*, code.*, review.*, documentation.*)

### Step 2: Analyze Tool Usage

Parse git diff and commit messages to infer tools used.

**Use modern CLI tools for parsing:**
- **`rg`** to search commit messages for tool-usage patterns (instead of `grep`)
- **`jq`** to extract structured data from any JSON output
- **`git log --format=...`** with structured format strings for machine-readable git data

**Read operations:**
```bash
rg "read|search|codebase_search" <(git log --stat --oneline HEAD~<n>..HEAD)
```

**Write operations:**
```bash
git diff --numstat HEAD~<n>..HEAD | awk '{print $1, $2, $3}'
```

**Structured commit analysis:**
```bash
# Machine-readable commit data for programmatic processing
git log --format='%H|%an|%s' HEAD~<n>..HEAD
```

Count by tool category:
- `read_file`: Files examined
- `write` / `search_replace`: Files created/modified
- `codebase_search` / `grep`: Search operations
- `run_terminal_cmd`: Commands executed
- `mcp_github_*`: GitHub operations

### Step 3: Track File Changes

```bash
# Structured output for categorization
git diff --name-status HEAD~<n>..HEAD
```

Categorize files:
- **Created** (A): New files
- **Modified** (M): Changed files
- **Deleted** (D): Removed files
- **Renamed** (R): Renamed files

Group by directory to identify affected areas.

### Step 4: Detect Errors and Retries

**From commit messages (use `rg` for pattern matching):**
```bash
# Detect error-resolution patterns in commit messages
git log --format='%s' HEAD~<n>..HEAD | rg -i "fix|resolve|correct|retry|revert"
```
- Look for "fix", "resolve", "correct" keywords
- Identify fixup/amend commits
- Count retry patterns

**From git history:**
- Multiple commits in short succession on same files
- Revert commits
- Emergency fixes

Categorize errors:
- `linter_error`: Linting issues
- `type_error`: Type checking failures
- `test_failure`: Test failures
- `build_error`: Build/compilation errors
- `runtime_error`: Runtime issues

### Step 5: Calculate Retry Metrics

**Retry indicators:**
- Fixup commits
- Same file modified multiple times in succession
- Error keywords in commit messages
- Time gaps suggesting iteration

Count total retries and success rate.

## Output Format

```json
{
  "agents_used": ["product-manager", "lead", "backend-engineer-api", "qa"],
  "prompts_executed": [
    "context.analyze-task-context",
    "plan.breakdown-implementation",
    "code.implement-changes",
    "review.validate-completeness"
  ],
  "tools_invoked": {
    "read_file": 45,
    "write": 8,
    "search_replace": 12,
    "codebase_search": 5,
    "run_terminal_cmd": 3,
    "mcp_github_*": 2
  },
  "files_changed": {
    "created": ["src/auth/oauth.ts", "tests/auth/oauth.test.ts"],
    "modified": ["src/auth/index.ts", "package.json"],
    "deleted": [],
    "renamed": []
  },
  "affected_areas": {
    "src/auth": 3,
    "tests/auth": 1,
    "root": 1
  },
  "errors_encountered": [
    {
      "command": "implement",
      "stage": "code",
      "error_type": "linter_error",
      "message": "Unused variable 'token'",
      "file": "src/auth/oauth.ts",
      "resolved": true
    }
  ],
  "retries_performed": 2,
  "retry_success_rate": 1.0
}
```

## Success Criteria

- ✅ All agents identified from command chain
- ✅ Prompts extracted from command definitions
- ✅ Tool usage quantified accurately
- ✅ File changes categorized completely
- ✅ Errors detected and classified
- ✅ Retry count calculated

## Error Handling

- **Command definition missing**: Use default agent mapping
- **Tool usage unclear**: Mark as "estimated"
- **No errors detected**: Return empty array (valid state)
- **Cannot parse commits**: Use git log only

