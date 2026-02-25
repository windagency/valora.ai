---
id: review.validate-pr-creation
version: 1.0.0
category: review
experimental: true
name: Validate PR Creation
description: Validate that the PR was created successfully and all post-creation checks pass
tags:
  - validation
  - post-creation
  - ci-checks
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.use-modern-cli-tools
    - code.push-and-create-pr
inputs:
  - name: pr_url
    description: URL of created PR
    type: string
    required: true
  - name: pr_number
    description: PR number
    type: number
    required: true
  - name: require_checks
    description: Whether to require CI checks to start
    type: boolean
    required: false
    default: false
outputs:
  - pr_status
  - validation_result
  - next_steps
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Validate PR Creation

## Objective

Verify that the pull request was created successfully and perform post-creation validation checks.

## Instructions

### Step 1: Verify PR Accessibility

Check that the PR URL is accessible:

```bash
curl -I <pr_url>
```

Or use GitHub CLI:

```bash
gh pr view <pr_number>
```

**Validate**:

- PR exists and is accessible
- PR number matches expected
- PR is in correct repository

### Step 2: Verify PR Metadata

Check that PR metadata was set correctly:

```bash
gh pr view <pr_number> --json title,body,reviewers,labels,isDraft
```

**Validate**:

- Title matches generated title
- Description is populated
- Reviewers were assigned (if requested)
- Labels were applied (if requested)
- Draft status is correct

### Step 3: Check CI/CD Status (if `require_checks`)

If `require_checks` is true, validate that CI checks have started:

```bash
gh pr checks <pr_number>
```

**Check**:

- At least one check is running or completed
- No immediate failures
- Checks are configured correctly

**Wait briefly** (5-10 seconds) for checks to start if none are running yet.

### Step 4: Verify Issue Links

If issues were linked, verify they appear in PR:

```bash
gh pr view <pr_number> --json closingIssuesReferences
```

**Check**:

- Linked issues appear in PR
- "Closes #X" links are working
- Related issues are mentioned

### Step 5: Check for Merge Conflicts

```bash
gh pr view <pr_number> --json mergeable,mergeStateStatus
```

**Validate**:

- PR is mergeable (no conflicts)
- Merge state is "clean" or "unstable" (not "blocked" or "dirty")

### Step 6: Validate Auto-Merge (if configured)

If auto-merge was requested, verify it's configured:

```bash
gh pr view <pr_number> --json autoMergeRequest
```

## Output Format

```json
{
  "pr_status": {
    "url": "https://github.com/owner/repo/pull/123",
    "number": 123,
    "state": "open",
    "mergeable": true,
    "merge_state": "clean",
    "is_draft": false,
    "created_at": "2025-11-13T14:30:00Z"
  },
  "validation_result": {
    "pr_accessible": true,
    "metadata_correct": true,
    "reviewers_assigned": true,
    "labels_applied": true,
    "ci_checks_started": true,
    "issue_links_working": true,
    "no_merge_conflicts": true,
    "auto_merge_configured": false,
    "overall": "success"
  },
  "ci_status": {
    "checks_running": 3,
    "checks_completed": 0,
    "checks_failed": 0,
    "estimated_time": "~5 minutes"
  },
  "validation_issues": [],
  "next_steps": [
    "Wait for CI checks to complete (~5 min)",
    "Respond to reviewer feedback",
    "Address any CI failures"
  ],
  "estimated_review_time": "1-2 days"
}
```

## Success Criteria

- ✅ PR is accessible via URL
- ✅ PR metadata is correct
- ✅ Reviewers and labels applied (if requested)
- ✅ Issue links are working
- ✅ No merge conflicts
- ✅ CI checks started (if required)

## Error Handling

### PR Not Found

**Issue**: PR URL returns 404

**Action**:

1. Check PR number is correct
2. Verify repository access
3. Check authentication
4. Retry once

### CI Checks Not Starting

**Issue**: No CI checks running after 30 seconds

**Action**:

1. Check if CI is configured for repository
2. Check if branch name triggers CI
3. Provide guidance to manually trigger
4. Don't block PR creation

### Reviewers Not Assigned

**Issue**: Requested reviewers were not assigned

**Action**:

1. Check if users have repository access
2. Verify usernames are correct
3. Provide manual assignment command
4. Don't block PR creation

### Merge Conflicts Detected

**Issue**: PR has merge conflicts

**Action**:

1. Report conflicts clearly
2. Provide resolution guidance
3. Suggest rebasing or merging base branch
4. Don't block PR creation (can be resolved later)

## Recommendations

Based on validation results, provide recommendations:

**If all checks pass**:

```plaintext
✅ PR created successfully! Next steps:
1. Wait for CI checks (~5 min)
2. Respond to reviewer feedback (estimated 1-2 days)
3. Address any issues raised
```

**If some checks fail**:

```plaintext
⚠️ PR created with some issues:
- [Issue 1]: [Resolution]
- [Issue 2]: [Resolution]

These can be addressed after creation.
```

**If critical failures**:

```plaintext
🔴 PR created but has critical issues:
- [Issue]: [Action required]

Please address immediately.
```

