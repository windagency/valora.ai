---
id: context.gather-git-metrics
version: 1.0.0
category: context
experimental: true
name: Gather Git Metrics
description: Collect objective metrics from git, GitHub, and CI/CD for feedback analysis
tags:
  - git-analysis
  - metrics
  - feedback
  - ci-status
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.use-modern-cli-tools
inputs:
  - name: pr_number
    description: Optional PR number for detailed metrics
    type: number
    required: false
outputs:
  - commits_created
  - files_modified
  - lines_changed
  - test_coverage_delta
  - ci_status
  - review_comments_count
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Gather Git Metrics

## Objective

Collect quantitative metrics from version control and CI/CD systems to objectively assess workflow outcomes.

## Instructions

### Available Tools

**Use these tools:**

1. **Git commands** via `run_terminal_cmd`:
   - `git rev-list`, `git diff`, `git log`, `git show`
   - Use `--numstat`, `--format=`, `--porcelain` for machine-readable output
   - These are the primary tools for gathering git metrics

2. **`jq`** - For parsing JSON output from GitHub API or coverage reports:
   - Extract specific fields instead of dumping entire JSON files
   - Example: `jq '.total.lines.pct' coverage/coverage-summary.json`

3. **`rg`** - For searching through git output or log files:
   - Pattern matching across commit messages or diff output
   - Example: `git log --format='%s' | rg "fix|feat|breaking"`

4. **query_session** - For execution timing data:
   - `action: "get", session_id: "<id>"` - Get command durations

**DO NOT use:**
- `npm test`, `npm run test:coverage`, `pnpm test` - too slow, set coverage to null
- `npm run lint`, `pnpm lint` - not needed for metrics
- `read_file` on `.ai/sessions/` - use `query_session` instead
- `grep` - use `rg` instead for faster, `.gitignore`-aware search
- `cat file.json` - use `jq '.' file.json` to extract specific fields

**For test coverage:** Set to `null` - do not attempt to run tests.

### Step 1: Count Commits

```bash
git rev-list --count HEAD --since="24 hours ago"
```

Or if base branch known:

```bash
git rev-list --count main..HEAD
```

**Output**: Number of commits created during workflow

### Step 2: Calculate Files Modified

```bash
# Count files changed (machine-readable numstat)
git diff --numstat main...HEAD | wc -l
```

Get detailed statistics:

```bash
git diff --stat main...HEAD
```

**Output**: Count of files changed

### Step 3: Measure Lines Changed

```bash
# Extract additions, deletions, and total from structured numstat output
git diff --numstat main...HEAD | awk '{add+=$1; del+=$2} END {print "additions=" add, "deletions=" del, "total=" add+del}'
```

**Output**:
- Lines added
- Lines deleted
- Total lines changed

### Step 4: Fetch PR Metrics (if `pr_number` provided)

Use GitHub MCP:

```javascript
mcp_github({
  tool_name: "get_pull_request",
  arguments: {
    owner: "<owner>",
    repo: "<repo>",
    pull_number: pr_number
  }
})
```

Extract:
- PR status (open/merged/closed)
- CI check statuses
- Review count
- Comment count
- Time to first review
- Merge status

### Step 5: Get CI Status

From PR checks or run locally:

```bash
# If CI is configured
gh pr checks <pr-number>
```

Or parse from PR status checks.

**Statuses:**
- `passed`: All checks green
- `failed`: One or more checks failed
- `pending`: Checks still running
- `skipped`: No checks configured

### Step 6: Assess Test Coverage (if available)

**Look for existing coverage reports (do NOT run tests):**

Use `jq` to extract coverage metrics from existing JSON reports:
```bash
# Parse Jest/Vitest coverage-summary.json
jq '{
  statements: .total.statements.pct,
  branches: .total.branches.pct,
  functions: .total.functions.pct,
  lines: .total.lines.pct
}' coverage/coverage-summary.json
```

Use `fd` to locate coverage report files:
```bash
fd -g 'coverage-summary.json' --type f
```

Compare before/after if possible.

**Output**: Coverage percentage and delta

## Output Format

```json
{
  "commits_created": 3,
  "files_modified": 12,
  "lines_changed": {
    "additions": 456,
    "deletions": 89,
    "total": 545
  },
  "test_coverage_delta": {
    "before": 78.5,
    "after": 82.3,
    "delta": "+3.8%",
    "available": true
  },
  "ci_status": "passed",
  "ci_checks": {
    "total": 5,
    "passed": 5,
    "failed": 0,
    "pending": 0
  },
  "pr_metrics": {
    "pr_number": 123,
    "status": "merged",
    "review_comments_count": 7,
    "reviews_count": 2,
    "time_to_first_review_hours": 4.5,
    "time_to_merge_hours": 24.3,
    "approvals": 2
  }
}
```

## Success Criteria

- ✅ Commit count accurate
- ✅ File and line changes calculated
- ✅ CI status determined
- ✅ PR metrics fetched (if applicable)
- ✅ Coverage data included (if available)

## Error Handling

- **No PR number**: Skip PR-specific metrics, use git only
- **Coverage unavailable**: Mark as `null` with `available: false`
- **CI not configured**: Return `ci_status: "not_configured"`
- **Cannot access GitHub**: Fall back to local git metrics only

