---
id: code.push-and-create-pr
version: 1.0.0
category: code
experimental: true
name: Push and Create PR
description: Push branch to remote and create pull request via GitHub API
tags:
  - git-push
  - pr-creation
  - github-api
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
    - code.generate-pr-title
    - code.generate-pr-description
    - code.determine-reviewers
    - code.determine-labels
inputs:
  - name: current_branch
    description: Current branch name
    type: string
    required: true
  - name: base_branch
    description: Base branch for PR
    type: string
    required: true
  - name: pr_title
    description: Generated PR title
    type: string
    required: true
  - name: pr_description
    description: Generated PR description
    type: string
    required: true
  - name: reviewers_list
    description: Reviewers to assign
    type: array
    required: false
  - name: labels_list
    description: Labels to apply
    type: array
    required: false
  - name: draft
    description: Create as draft PR
    type: boolean
    required: false
    default: false
  - name: no_push
    description: Skip pushing (testing mode)
    type: boolean
    required: false
    default: false
outputs:
  - pr_url
  - pr_number
  - push_status
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Push and Create PR

## Objective

Push the current branch to remote and create a pull request using the GitHub API or CLI.

## Instructions

### Step 1: Push Branch to Remote

If `no_push` is false, push the branch:

```bash
git push origin <current_branch>
```

**Handle authentication**:

- SSH key authentication (recommended)
- HTTPS with token (GitHub CLI handles this)
- PAT (Personal Access Token) if configured

**Check for errors**:

- Authentication failure
- Network issues
- Protected branch conflicts
- Force-push requirements

**On success**:

- Confirm push completed
- Verify remote tracking is set

**On failure**:

- Provide error message
- Suggest troubleshooting steps
- Allow manual push

### Step 2: Detect Repository Information

Extract repository owner and name:

**From git remote**:

```bash
git remote get-url origin
```

**Parse URL**:

- SSH format: `git@github.com:owner/repo.git`
- HTTPS format: `https://github.com/owner/repo.git`

**Extract**:

- Owner: `owner`
- Repo: `repo`

### Step 3: Create Pull Request

**Preferred method**: Use GitHub CLI

```bash
gh pr create \
  --title "<pr_title>" \
  --body "<pr_description>" \
  --base <base_branch> \
  --head <current_branch> \
  [--draft] \
  [--reviewer <reviewers>] \
  [--label <labels>]
```

**Alternative method**: Use GitHub API tool

```
mcp_github({
  tool_name: "create_pull_request",
  arguments: {
    owner: "<owner>",
    repo: "<repo>",
    title: "<pr_title>",
    body: "<pr_description>",
    base: "<base_branch>",
    head: "<current_branch>",
    draft: <draft>
  }
})
```

**Parameters**:

- `title`: From `pr_title`
- `body`: From `pr_description`
- `base`: From `base_branch`
- `head`: From `current_branch`
- `draft`: From `draft` flag
- `maintainer_can_modify`: true (allow maintainer edits)

**Capture response**:

- PR URL
- PR number
- PR state (open, draft)

### Step 4: Assign Reviewers

If `reviewers_list` is not empty:

**Using GitHub CLI**:

```bash
gh pr edit <pr_number> --add-reviewer <user1>,<user2>
```

**Using GitHub API**:

```
mcp_github({
  tool_name: "request_reviewers",
  arguments: {
    owner: "<owner>",
    repo: "<repo>",
    pull_number: <pr_number>,
    reviewers: ["user1", "user2"]
  }
})
```

**Handle errors**:

- User doesn't exist: Skip invalid user, continue
- User doesn't have access: Skip, log warning
- User is PR author: Skip (GitHub prevents self-review)

### Step 5: Apply Labels

If `labels_list` is not empty:

**Using GitHub CLI**:

```bash
gh pr edit <pr_number> --add-label <label1>,<label2>
```

**Using GitHub API** (labels are applied to issues endpoint):

```
POST /repos/{owner}/{repo}/issues/{pr_number}/labels
{
  "labels": ["label1", "label2"]
}
```

**Handle errors**:

- Label doesn't exist: Skip invalid label, continue
- Permission denied: Log warning, continue

### Step 6: Verify PR Creation

Confirm PR was created successfully:

```bash
gh pr view <pr_number> --json url,number,state,title
```

**Validate**:

- PR exists and is accessible
- Title matches
- State is "OPEN" or "DRAFT"
- Reviewers assigned (if requested)
- Labels applied (if requested)

## Output Format

```json
{
  "pr_url": "https://github.com/owner/repo/pull/123",
  "pr_number": 123,
  "push_status": {
    "pushed": true,
    "branch": "feature/oauth2-implementation",
    "remote": "origin",
    "commit_sha": "abc123...",
    "success": true
  },
  "pr_created": true,
  "pr_state": "OPEN",
  "reviewers_assigned": {
    "success": ["alice", "bob"],
    "failed": [],
    "skipped": []
  },
  "labels_applied": {
    "success": ["feature", "backend", "security"],
    "failed": [],
    "not_found": []
  },
  "errors": [],
  "warnings": []
}
```

## Success Criteria

- ✅ Branch pushed to remote (or skipped with `--no-push`)
- ✅ Pull request created successfully
- ✅ PR URL and number captured
- ✅ Reviewers assigned (if requested)
- ✅ Labels applied (if requested)

## Error Handling

### Push Failures

**Authentication Error**:

```plaintext
❌ Failed to push branch

Error: Authentication failed

Solutions:
1. Check SSH key is added to GitHub: `ssh -T git@github.com`
2. Or configure GitHub CLI: `gh auth login`
3. Or use HTTPS with token: `git remote set-url origin https://...`
```

**Network Error**:

```plaintext
❌ Failed to push branch

Error: Network connection failed

Solutions:
1. Check internet connection
2. Retry push: `git push origin <branch>`
3. Check GitHub status: https://githubstatus.com
```

**Protected Branch**:

```plaintext
❌ Failed to push branch

Error: Remote rejected (protected branch)

Solutions:
1. Use different branch name
2. Request branch protection override
3. Create PR from current state (if commits exist remotely)
```

### PR Creation Failures

**Branch Already Has PR**:

```plaintext
❌ PR already exists for this branch

Existing PR: https://github.com/owner/repo/pull/456

Actions:
1. Use existing PR: `gh pr view 456`
2. Or close existing and create new: `gh pr close 456`
```

**Base Branch Doesn't Exist**:

```plaintext
❌ Base branch '<branch>' not found

Available branches:
- main
- develop
- staging

Use --base to specify correct branch
```

**No Commits to Create PR**:

```plaintext
❌ Cannot create PR with no commits

Current branch is up to date with base branch.
Make some commits first.
```

### Reviewer Assignment Failures

**User Not Found**:

```plaintext
⚠️ Some reviewers could not be assigned:
- @invalid-user (user not found)

Successfully assigned:
- @alice
- @bob
```

### Label Application Failures

**Label Not Found**:

```plaintext
⚠️ Some labels could not be applied:
- 'invalid-label' (label doesn't exist in repository)

Successfully applied:
- feature
- backend

Create missing labels: `gh label create <name>`
```

## Special Cases

### Draft Mode

If `draft` is true:

- Create PR as draft
- Add "(Draft)" or "🚧" prefix to title (if not already present)
- Skip reviewer assignment (drafts typically reviewed manually)
- Add `draft` or `wip` label

### No-Push Mode (Testing)

If `no_push` is true:

- Skip push step
- Assume branch already pushed
- Continue with PR creation
- Used for testing PR generation without pushing

### Fork Workflow

If working in a fork:

- Head branch format: `owner:branch`
- Base branch in upstream repo
- Handle cross-repository PR

**Example**:

```bash
gh pr create \
  --repo upstream/repo \
  --head myusername:feature-branch \
  --base main
```

## Notes

- Push and PR creation are atomic operations (not transactional)
- If push succeeds but PR creation fails, branch is still pushed
- Retry logic should handle partial failures
- Always verify PR creation success before reporting completion

