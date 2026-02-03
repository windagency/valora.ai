---
id: context.analyze-git-branch
version: 1.0.0
category: context
experimental: true
name: Analyze Git Branch
description: Analyze current Git branch state and determine base branch for PR
tags:
  - git
  - branch-analysis
  - pr-context
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
  - software-engineer
dependencies:
  requires: []
inputs:
  - name: base_branch_arg
    description: Optional user-specified base branch
    type: string
    required: false
outputs:
  - current_branch
  - base_branch
  - branch_name_convention
  - commits_ahead
  - commits_behind
tokens:
  avg: 1500
  max: 3000
  min: 800
---

# Analyze Git Branch

## Objective

Determine the current branch state, identify the appropriate base branch, and count commits ahead/behind.

## Instructions

### Step 1: Identify Current Branch

Run:

```bash
git rev-parse --abbrev-ref HEAD
```

**Output**: Current branch name (e.g., `feature/oauth2-implementation`)

### Step 2: Detect Base Branch

If `base_branch_arg` is provided, use it. Otherwise, auto-detect:

1. Check if `main` exists: `git rev-parse --verify main`
2. If not, check if `master` exists: `git rev-parse --verify master`
3. If not, check if `develop` exists: `git rev-parse --verify develop`
4. Otherwise, use default remote branch: `git symbolic-ref refs/remotes/origin/HEAD`

**Output**: Base branch name (e.g., `main`)

### Step 3: Extract Branch Naming Convention

Analyze the current branch name to identify the convention:

- **feature/**: Feature branches
- **bugfix/** or **fix/**: Bug fix branches
- **hotfix/**: Hotfix branches
- **chore/**: Maintenance branches
- **refactor/**: Refactoring branches
- **docs/**: Documentation branches
- **PROJ-123-**: Ticket-first naming
- Other patterns

**Output**: Convention identifier (e.g., `feature/`, `ticket-first`)

### Step 4: Count Commits Ahead and Behind

**Commits ahead** (how many commits on current branch not in base):

```bash
git rev-list --count origin/<base>..HEAD
```

**Commits behind** (how many commits on base not in current branch):

```bash
git rev-list --count HEAD..origin/<base>
```

**Note**: If branch is not pushed to remote, use local base branch instead of `origin/<base>`.

### Step 5: Validate Branch State

Check for potential issues:

- **No commits ahead**: Cannot create PR (nothing to merge)
- **Too many commits behind**: May have merge conflicts
- **Uncommitted changes**: Warn user (use `git status --porcelain`)

## Output Format

```json
{
  "current_branch": "feature/oauth2-implementation",
  "base_branch": "main",
  "branch_name_convention": "feature/",
  "commits_ahead": 7,
  "commits_behind": 3,
  "validation": {
    "can_create_pr": true,
    "warnings": [
      "Branch is 3 commits behind main - may have conflicts"
    ],
    "uncommitted_changes": false
  }
}
```

## Success Criteria

- ✅ Current branch identified
- ✅ Base branch determined (auto-detect or user-specified)
- ✅ Commits ahead/behind calculated
- ✅ Branch naming convention extracted
- ✅ Validation checks performed

## Error Handling

- **Not in a Git repository**: Exit with error
- **Detached HEAD**: Cannot create PR from detached state
- **No commits ahead**: Cannot create empty PR
- **Base branch doesn't exist**: Suggest valid branches

