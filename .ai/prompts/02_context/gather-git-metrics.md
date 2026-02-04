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
  requires: []
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
   - These are the primary tools for gathering git metrics

2. **query_session** - For execution timing data:
   - `action: "get", session_id: "<id>"` - Get command durations

**DO NOT use:**
- `npm test`, `npm run test:coverage`, `pnpm test` - too slow, set coverage to null
- `npm run lint`, `pnpm lint` - not needed for metrics
- `read_file` on `.ai/sessions/` - use `query_session` instead

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
git diff --numstat main...HEAD | wc -l
```

Get detailed statistics:

```bash
git diff --stat main...HEAD
```

**Output**: Count of files changed

### Step 3: Measure Lines Changed

```bash
git diff --numstat main...HEAD | awk '{add+=$1; del+=$2} END {print add, del, add+del}'
```

**Output**:
- Lines added
- Lines deleted
- Total lines changed

### Step 4: Fetch PR Metrics (if `pr_number` provided)

Use GitHub MCP:

```javascript
mcp_github_pull_request_read({
  method: "get",
  owner: "<owner>",
  repo: "<repo>",
  pullNumber: pr_number
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

**Look for coverage tools:**
- Jest: `pnpm exec jest --coverage --json`
- Pytest: `.coverage` file
- Coverage.py: `coverage report`

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

