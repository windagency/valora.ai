---
id: code.stage-and-commit
version: 1.0.0
category: code
experimental: true
name: Stage and Commit
description: Execute git operations to stage files and create commits
tags:
  - git
  - commit-execution
  - staging
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
  - software-engineer
dependencies:
  requires:
    - context.use-modern-cli-tools
    - code.generate-commit-messages
inputs:
  - name: commit_groups
    description: Commit groups with files
    type: array
    required: true
  - name: commit_messages
    description: Generated commit messages
    type: array
    required: true
  - name: commit_descriptions
    description: Descriptions for each commit
    type: object
    required: true
  - name: commit_footers
    description: Footers for each commit
    type: object
    required: true
  - name: amend
    description: Whether to amend last commit
    type: boolean
    required: false
  - name: no_verify
    description: Skip pre-commit hooks
    type: boolean
    required: false
  - name: sign
    description: Sign commit with GPG/SSH
    type: boolean
    required: false
outputs:
  - commits_created
  - commit_hashes
  - commit_summary
tokens:
  avg: 2500
  max: 5000
  min: 1200
---

# Stage and Commit

## Objective

Execute git operations to stage files and create commits according to the strategy.

## Instructions

### Step 1: Validate Pre-conditions

Before starting, check:

1. **Working directory is clean of conflicts**:
   ```bash
   git diff --check
   ```
   If conflicts exist, abort with error.

2. **Not in detached HEAD** (unless user acknowledges):
   ```bash
   git symbolic-ref -q HEAD
   ```

3. **Verify amend restrictions** (if `amend = true`):
   - Only one commit group allowed
   - Last commit exists
   - Last commit not pushed to remote (warning if pushed)

### Step 2: Stage Files for Each Commit

For each commit group, stage specific files:

```bash
# Clear staging area first
git reset HEAD

# Stage files for this commit
git add <file1> <file2> <file3> ...
```

**Example**:
```bash
git reset HEAD
git add src/auth/oauth.ts src/auth/tokens.ts
```

**Verify staging**:
```bash
git diff --cached --name-only
```

Ensure only intended files are staged.

### Step 3: Construct Commit Command

Build git commit command with appropriate flags:

**Base command**:
```bash
git commit
```

**Add message components**:
```bash
-m "<subject>"
```

If body exists:
```bash
-m "<body>"
```

If footer exists:
```bash
-m "<footer>"
```

**Add optional flags**:

- If `amend = true`:
  ```bash
  git commit --amend
  ```

- If `no_verify = true`:
  ```bash
  git commit --no-verify
  ```

- If `sign = true`:
  ```bash
  git commit -S
  ```
  Or with specific key:
  ```bash
  git commit -S --gpg-sign=<key-id>
  ```

**Full example**:
```bash
git commit \
  -m "feat(auth): implement OAuth2 refresh token rotation" \
  -m "Add secure token rotation mechanism with configurable expiration.
Tokens are automatically rotated on use and expired tokens are invalidated.

This improves security by limiting token lifetime.

Refs PROJ-123"
```

### Step 4: Execute Commit

Run the constructed command:

```bash
git commit -m "<subject>" -m "<body>" [flags]
```

**Capture output**:
- Exit code (0 = success)
- Commit hash
- Files changed
- Insertions/deletions

**Handle failures**:

1. **Pre-commit hook failure**:
   ```plaintext
   ❌ Pre-commit hook failed
   
   Error: Linting errors found
   - src/auth/oauth.ts:45 - Unused variable 'token'
   
   Options:
   1. Fix errors and try again
   2. Use --no-verify to skip hooks (not recommended)
   ```

2. **Empty commit**:
   ```plaintext
   ❌ No changes to commit
   
   All changes may have been staged in previous commit.
   ```

3. **Commit message rejected**:
   ```plaintext
   ❌ Commit message rejected by commit-msg hook
   
   Message doesn't follow project conventions.
   ```

### Step 5: Retrieve Commit Hash

After successful commit:

```bash
git rev-parse HEAD
```

Extract hash (short or long):
```bash
# Short hash (7 chars)
git rev-parse --short HEAD

# Long hash (40 chars)
git rev-parse HEAD
```

### Step 6: Verify Commit Created

Verify commit was created successfully:

```bash
git log -1 --oneline
```

**Expected output**:
```plaintext
a3f8c2e feat(auth): implement OAuth2 refresh token rotation
```

**Verify commit details**:
```bash
git show HEAD --stat
```

Confirm:
- Correct files committed
- Correct message
- Correct author/committer

### Step 7: Handle Multiple Commits

If multiple commit groups, repeat Steps 2-6 for each:

```typescript
const commits = [];

for (const group of commit_groups) {
  // Stage files for this group
  await stageFiles(group.files);
  
  // Get message for this group
  const message = commit_messages.find(m => m.group_id === group.id);
  
  // Execute commit
  const result = await executeCommit(message, flags);
  
  if (!result.success) {
    // Rollback previous commits if needed
    await rollbackCommits(commits);
    return error(result.error);
  }
  
  commits.push(result);
}
```

### Step 8: Rollback on Failure (If Needed)

If commit fails mid-sequence:

```bash
# Reset to original state
git reset --hard <original_commit_hash>

# Restore working tree
git reset --soft <original_commit_hash>
```

**Note**: Only rollback if explicitly requested or if critical failure.

### Step 9: Generate Summary

Create summary of all commits:

```typescript
const summary = commits.map(c => 
  `${c.hash} ${c.subject}`
).join('\n');
```

## Output Format

**Single commit success**:

```json
{
  "commits_created": 1,
  "commit_hashes": ["a3f8c2e"],
  "commit_summary": [
    "a3f8c2e feat(auth): implement OAuth2 refresh token rotation"
  ],
  "commits": [
    {
      "hash": "a3f8c2e7f1234567890abcdef1234567890abcde",
      "short_hash": "a3f8c2e",
      "subject": "feat(auth): implement OAuth2 refresh token rotation",
      "files_changed": 2,
      "insertions": 145,
      "deletions": 23,
      "group_id": "group_1"
    }
  ],
  "status": "success"
}
```

**Multiple commits success**:

```json
{
  "commits_created": 2,
  "commit_hashes": ["a3f8c2e", "9d4b1f7"],
  "commit_summary": [
    "a3f8c2e feat(auth): implement OAuth2 refresh token rotation",
    "9d4b1f7 test(auth): add OAuth2 refresh token tests"
  ],
  "commits": [
    {
      "hash": "a3f8c2e",
      "short_hash": "a3f8c2e",
      "subject": "feat(auth): implement OAuth2 refresh token rotation",
      "files_changed": 2,
      "insertions": 145,
      "deletions": 23,
      "group_id": "group_1"
    },
    {
      "hash": "9d4b1f7",
      "short_hash": "9d4b1f7",
      "subject": "test(auth): add OAuth2 refresh token tests",
      "files_changed": 1,
      "insertions": 120,
      "deletions": 0,
      "group_id": "group_2"
    }
  ],
  "status": "success"
}
```

**Failure**:

```json
{
  "commits_created": 0,
  "commit_hashes": [],
  "commit_summary": [],
  "commits": [],
  "status": "failed",
  "error": {
    "type": "pre_commit_hook_failure",
    "message": "Linting errors found in src/auth/oauth.ts",
    "details": "Line 45: Unused variable 'token'",
    "resolution": "Fix linting errors or use --no-verify flag"
  }
}
```

## Success Criteria

- ✅ Files staged correctly for each commit
- ✅ Commits executed successfully
- ✅ Commit hashes retrieved
- ✅ Commit messages match specifications
- ✅ No unintended files committed
- ✅ Hooks passed (unless --no-verify)

## Rules

**DO**:
- ✅ Stage only intended files for each commit
- ✅ Clear staging area between commits
- ✅ Verify commit created successfully
- ✅ Handle hook failures gracefully
- ✅ Provide clear error messages

**DON'T**:
- ❌ Commit without staging verification
- ❌ Skip error handling
- ❌ Force commits on failure
- ❌ Ignore hook failures without user consent
- ❌ Commit partial changes unintentionally

