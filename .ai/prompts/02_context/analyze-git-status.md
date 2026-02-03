---
id: context.analyze-git-status
version: 1.0.0
category: context
experimental: true
name: Analyze Git Status
description: Analyze current git repository status and identify all changes ready for commit
tags:
  - git
  - status-analysis
  - change-detection
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
  - software-engineer
dependencies:
  requires: []
inputs: []
outputs:
  - changed_files
  - staged_files
  - untracked_files
  - git_status_summary
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Analyze Git Status

## Objective

Understand the current repository state and identify all changes available for commit.

## Instructions

### Step 1: Get Porcelain Status

Execute machine-readable git status:

```bash
git status --porcelain
```

**Output format**:
- `M ` = Modified (not staged)
- ` M` = Modified (staged)
- `MM` = Modified, staged, then modified again
- `A ` = Added (new file, staged)
- `??` = Untracked
- `D ` = Deleted
- `R ` = Renamed

### Step 2: Get Change Statistics

For modified tracked files:

```bash
git diff --stat
```

For staged files:

```bash
git diff --cached --stat
```

**Extract**:
- Files changed
- Lines added (+)
- Lines deleted (-)
- Total change magnitude

### Step 3: Categorize Files

Group files by status:

**Modified files** (not staged):
- Extract from status where first column is `M`, `D`, or `R`

**Staged files**:
- Extract where second column is `M`, `A`, or first column is `A`

**Untracked files**:
- Extract where status is `??`

**Deleted files**:
- Extract where status includes `D`

**Renamed files**:
- Extract where status is `R ` with old→new path

### Step 4: Calculate Change Magnitude

```plaintext
total_additions = sum(additions from all files)
total_deletions = sum(deletions from all files)
total_changes = total_additions + total_deletions
file_count = count(changed_files)

magnitude = 
  if total_changes < 100: "small"
  else if total_changes < 500: "medium"
  else: "large"
```

### Step 5: Validate Repository State

Check for issues:
- **Clean working tree**: No changes to commit
- **Unresolved conflicts**: Check for conflict markers
- **Detached HEAD**: Cannot commit safely

```bash
# Check for conflicts
git diff --check

# Check HEAD state
git symbolic-ref -q HEAD
```

## Output Format

```json
{
  "changed_files": [
    {
      "path": "src/auth/oauth.ts",
      "status": "modified",
      "staged": false,
      "additions": 95,
      "deletions": 12
    },
    {
      "path": "src/auth/tokens.ts",
      "status": "modified",
      "staged": false,
      "additions": 50,
      "deletions": 11
    }
  ],
  "staged_files": [],
  "untracked_files": ["tests/auth/oauth.test.ts"],
  "deleted_files": [],
  "renamed_files": [],
  "git_status_summary": {
    "total_files": 2,
    "total_additions": 145,
    "total_deletions": 23,
    "magnitude": "medium",
    "clean": false,
    "conflicts": false,
    "detached_head": false
  }
}
```

## Success Criteria

- ✅ All changed files identified
- ✅ Files categorized by status (modified/staged/untracked)
- ✅ Change statistics calculated
- ✅ Repository state validated
- ✅ No uncommitted conflicts

## Error Handling

- **Not in git repository**: Exit with error - cannot commit
- **Clean working tree**: No changes to commit
- **Unresolved conflicts**: Cannot commit until resolved
- **Detached HEAD**: Warn user - commits will be orphaned

