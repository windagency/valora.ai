---
id: code.interactive-review
version: 1.0.0
category: code
experimental: true
name: Interactive Review
description: Present commit messages for user review and modification before execution
tags:
  - interactive
  - user-review
  - commit-approval
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
  - software-engineer
dependencies:
  requires:
    - code.generate-commit-messages
inputs:
  - name: commit_messages
    description: Generated commit messages
    type: array
    required: true
  - name: commit_groups
    description: Commit groups with file lists
    type: array
    required: true
  - name: quality_score
    description: Quality score from insights
    type: number
    required: false
  - name: recommendations
    description: Recommendations from insights
    type: array
    required: false
outputs:
  - approved_messages
  - user_modifications
tokens:
  avg: 3000
  max: 6000
  min: 1500
---

# Interactive Review

## Objective

Present generated commit messages to user for review, editing, and approval before executing commits.

## Instructions

### Step 1: Display Commit Preview

For each commit, display:

```plaintext
📝 Commit #<N> (Quality: <score>/10)

<full_commit_message>

📊 Impact:
- <file_count> files changed
- <additions> insertions(+), <deletions> deletions(-)

Files:
- <file1>
- <file2>
- ...
```

**Example**:

```plaintext
📝 Commit #1 (Quality: 8.5/10)

feat(auth): implement OAuth2 refresh token rotation

Add secure token rotation mechanism with configurable expiration.
Tokens are automatically rotated on use and expired tokens are
invalidated.

This improves security by limiting token lifetime and reducing
risk of token theft.

Refs PROJ-123

📊 Impact:
- 2 files changed
- 145 insertions(+), 23 deletions(-)

Files:
- src/auth/oauth.ts
- src/auth/tokens.ts
```

### Step 2: Display AI Insights (If Available)

If quality score and recommendations provided:

```plaintext
💡 AI Insights:
✅ Quality Score: <score>/10
<quality_breakdown_if_available>

⚠️  Recommendations:
1. <recommendation_1>
2. <recommendation_2>
3. <recommendation_3>
```

**Example**:

```plaintext
💡 AI Insights:
✅ Quality Score: 8.5/10
   - Message quality: 9.0/10
   - Code quality: 8.0/10
   - Testing: 7.0/10

⚠️  Recommendations:
1. Add integration tests for token rotation edge cases
2. Document security implications in commit body
3. Consider adding migration guide reference
```

### Step 3: Present Action Options

Display available actions:

```plaintext
Actions:
[C] Commit as-is    Accept and commit immediately
[E] Edit            Modify commit message
[S] Split           Split into multiple commits
[I] Improve         Ask AI to improve based on feedback
[X] Cancel          Abort commit process

> _
```

### Step 4: Handle User Input

**Option C - Commit as-is**:
- Return approved messages unchanged
- Set `user_approved = true`
- Proceed to stage-and-commit

**Option E - Edit**:
- Present message in editable format (simulate editor)
- Allow user to modify any part (subject, body, footer)
- Validate edited message format
- If valid, return modified message
- If invalid, show errors and allow re-edit

**Option S - Split**:
- Ask user how to split (which files in which commit)
- Regenerate commit groups based on user input
- Return to Step 1 with new groups

**Option I - Improve**:
- Ask user: "What would you like to improve?"
- Collect specific feedback
- Regenerate message incorporating feedback
- Return to Step 1 with improved message

**Option X - Cancel**:
- Return `approved = false`
- Exit without committing

### Step 5: Validate User Modifications

If user edited message:

1. **Check Conventional Commits format**:
   - Pattern: `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+$`

2. **Check subject length**:
   - Warning if > 72 characters
   - Error if > 100 characters

3. **Check breaking change consistency**:
   - If `!` in subject, ensure `BREAKING CHANGE:` in footer
   - If `BREAKING CHANGE:` in footer, suggest `!` in subject

4. **Check overall structure**:
   - Subject exists
   - Blank line between subject and body (if body exists)
   - Blank line between body and footer (if footer exists)

**If validation fails**:
```plaintext
❌ Validation Issues:
- Subject line too long (85 chars, max 72)
- Missing 'BREAKING CHANGE:' footer but '!' present in subject

[E] Edit again  [I] Ignore warnings  [X] Cancel
```

### Step 6: Multi-Commit Flow

If multiple commits, repeat for each:

```plaintext
Review Commit 1 of 3
[Previous steps]

After approval of commit 1:

Review Commit 2 of 3
[Previous steps]

Options:
[C] Commit as-is
[E] Edit
[B] Back to previous commit
[A] Approve all remaining
[X] Cancel all
```

### Step 7: Final Confirmation

Before committing, show summary:

```plaintext
📋 Commit Summary

You are about to create <N> commit(s):

1. feat(auth): implement OAuth2 refresh token rotation
   - 2 files, 145 insertions, 23 deletions

2. test(auth): add OAuth2 refresh token tests
   - 1 file, 120 insertions, 0 deletions

Total: 3 files, 265 insertions, 23 deletions

Proceed with commits? [Y/n] _
```

## Output Format

**Approved**:

```json
{
  "approved_messages": [
    {
      "group_id": "group_1",
      "subject": "feat(auth): implement OAuth2 refresh token rotation",
      "body": "Add secure token rotation mechanism...",
      "footer": "Refs PROJ-123",
      "modified": false,
      "user_approved": true
    },
    {
      "group_id": "group_2",
      "subject": "test(auth): add OAuth2 refresh token tests",
      "body": "Add integration tests...",
      "footer": "",
      "modified": true,
      "user_approved": true,
      "modifications": ["Added note about edge cases in body"]
    }
  ],
  "user_modifications": {
    "any_modified": true,
    "modification_count": 1,
    "changes_applied": [
      "Commit 2: Enhanced body with edge case details"
    ]
  },
  "approval_status": "approved",
  "timestamp": "2025-11-14T10:30:00Z"
}
```

**Cancelled**:

```json
{
  "approved_messages": [],
  "user_modifications": {
    "any_modified": false,
    "modification_count": 0,
    "changes_applied": []
  },
  "approval_status": "cancelled",
  "cancellation_reason": "User cancelled during review of commit 1"
}
```

## Success Criteria

- ✅ All commits presented clearly
- ✅ AI insights displayed (if available)
- ✅ User options clearly explained
- ✅ User input handled correctly
- ✅ Validation performed on edits
- ✅ Final confirmation before proceeding

## Rules

**DO**:
- ✅ Present information clearly and concisely
- ✅ Show quality score prominently
- ✅ Validate user edits
- ✅ Allow user to cancel at any time
- ✅ Provide helpful feedback on validation errors

**DON'T**:
- ❌ Proceed without user approval
- ❌ Accept invalid commit formats
- ❌ Skip validation of user edits
- ❌ Hide AI recommendations
- ❌ Make approval process confusing

## Notes

**Implementation Consideration**: This prompt describes an interactive flow that may require multiple back-and-forth exchanges with the user. The actual implementation should handle user input gracefully and provide clear feedback at each step.

