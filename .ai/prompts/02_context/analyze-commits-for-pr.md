---
id: context.analyze-commits-for-pr
version: 1.0.0
category: context
experimental: true
name: Analyze Commits for PR
description: Extract and analyze commit messages to understand changes for PR description
tags:
  - commit-analysis
  - conventional-commits
  - pr-context
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.use-modern-cli-tools
    - context.analyze-git-branch
inputs:
  - name: current_branch
    description: Current branch name
    type: string
    required: true
  - name: base_branch
    description: Base branch for comparison
    type: string
    required: true
  - name: commits_ahead
    description: Number of commits ahead
    type: number
    required: true
outputs:
  - commit_messages
  - change_summary
  - affected_files
  - change_types
  - breaking_changes
  - authors
tokens:
  avg: 3000
  max: 6000
  min: 1500
---

# Analyze Commits for PR

## Objective

Extract detailed commit information and analyze changes to generate comprehensive PR context.

## Instructions

### Step 1: Get Detailed Commit Information

Fetch commits with full details:

```bash
git log origin/<base>..HEAD --format='%H|%an|%ae|%s|%b'
```

**Parse each commit**:

- `%H`: Full commit hash
- `%an`: Author name
- `%ae`: Author email
- `%s`: Subject (first line)
- `%b`: Body (remaining lines)

### Step 2: Parse Conventional Commits

For each commit subject, parse the conventional commit format:

**Format**: `type(scope): description`

**Common types**:

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `chore`: Maintenance tasks
- `docs`: Documentation changes
- `test`: Test additions/changes
- `style`: Code style changes
- `perf`: Performance improvements
- `ci`: CI/CD changes
- `build`: Build system changes
- `revert`: Revert previous commit

**Extract**:

- Type
- Scope (optional)
- Description
- Breaking change indicator (`!` after type, or `BREAKING CHANGE:` in body)

### Step 3: Analyze Changed Files

Get list of changed files with status:

```bash
git diff --name-status origin/<base>...HEAD
```

**Parse status**:

- `A`: Added
- `M`: Modified
- `D`: Deleted
- `R`: Renamed
- `C`: Copied

**Categorize files by type**:

- Source code: `.js`, `.ts`, `.py`, `.go`, etc.
- Tests: `*.test.*`, `*.spec.*`, `__tests__/`
- Documentation: `*.md`, `docs/`
- Configuration: `*.json`, `*.yaml`, `*.toml`, `.env*`
- Assets: images, fonts, stylesheets

### Step 4: Identify Change Types

Aggregate change types from commits:

- **Primary type**: Most frequent commit type
- **Secondary types**: Other types present
- **Breaking changes**: Any commits with breaking change markers

### Step 5: Detect Breaking Changes

Check for breaking change indicators:

1. **In commit messages**: `BREAKING CHANGE:`, `!` after type
2. **In file changes**: Major version bumps, API removals
3. **In descriptions**: Keywords like "removed", "deprecated", "incompatible"

Extract breaking change descriptions.

### Step 6: Extract Authors and Co-Authors

**Primary authors**: From commit author field

**Co-authors**: Look for `Co-authored-by:` trailers in commit bodies

### Step 7: Generate Change Summary

Synthesize a high-level summary:

- **Single commit**: Use commit message directly
- **Multiple commits**: Group by type and summarize

**Example**:
```
- Added OAuth2 authentication flow (3 commits)
- Fixed token refresh bug (1 commit)
- Updated API documentation (2 commits)
```

### Step 8: Calculate Complexity Metrics

```bash
git diff --shortstat origin/<base>...HEAD
```

**Extract**:

- Files changed
- Lines added
- Lines deleted

## Output Format

```json
{
  "commit_messages": [
    {
      "hash": "abc123...",
      "author": "Alice",
      "email": "alice@example.com",
      "subject": "feat(auth): add OAuth2 authentication",
      "body": "Implements OAuth2 flow with token refresh...",
      "type": "feat",
      "scope": "auth",
      "description": "add OAuth2 authentication",
      "breaking": false
    }
  ],
  "change_summary": {
    "primary_change": "Added OAuth2 authentication flow",
    "grouped_changes": {
      "feat": ["OAuth2 authentication", "Token refresh"],
      "fix": ["Login redirect bug"],
      "docs": ["API documentation"]
    }
  },
  "affected_files": {
    "total": 15,
    "by_status": {
      "added": 5,
      "modified": 9,
      "deleted": 1
    },
    "by_type": {
      "source": 10,
      "tests": 3,
      "docs": 2
    },
    "files": [
      {"path": "src/auth/oauth2.ts", "status": "A", "type": "source"},
      {"path": "src/auth/tokens.ts", "status": "M", "type": "source"}
    ]
  },
  "change_types": {
    "primary": "feat",
    "all": ["feat", "fix", "docs"],
    "distribution": {
      "feat": 3,
      "fix": 1,
      "docs": 2
    }
  },
  "breaking_changes": [
    {
      "commit": "abc123",
      "description": "Changed /auth/login endpoint signature",
      "migration": "Update client calls to include clientId parameter"
    }
  ],
  "authors": [
    {"name": "Alice", "email": "alice@example.com", "commits": 5},
    {"name": "Bob", "email": "bob@example.com", "commits": 2}
  ],
  "complexity": {
    "files_changed": 15,
    "lines_added": 342,
    "lines_deleted": 87,
    "net_change": 255
  }
}
```

## Success Criteria

- ✅ All commits parsed and analyzed
- ✅ Conventional commit types extracted
- ✅ Changed files categorized
- ✅ Breaking changes identified
- ✅ Authors and co-authors extracted
- ✅ Change summary generated

## Error Handling

- **Non-conventional commits**: Extract what's possible, mark format as "freeform"
- **No commits**: Return empty structures
- **Git errors**: Provide clear error message

