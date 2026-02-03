---
id: code.generate-commit-messages
version: 1.0.0
category: code
experimental: true
name: Generate Commit Messages
description: Generate conventional commit messages for each commit group
tags:
  - commit-messages
  - conventional-commits
  - message-generation
model_requirements:
  min_context: 200000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
  - software-engineer
dependencies:
  requires:
    - code.determine-commit-strategy
inputs:
  - name: commit_groups
    description: Commit groups from strategy determination
    type: array
    required: true
  - name: change_type
    description: Primary change type
    type: string
    required: true
  - name: scope
    description: User-specified scope (optional)
    type: string
    required: false
  - name: breaking
    description: User-specified breaking flag
    type: boolean
    required: false
  - name: custom_message
    description: User-specified custom message
    type: string
    required: false
  - name: template_config
    description: Template configuration if using template
    type: object
    required: false
  - name: ticket_number
    description: Extracted ticket number
    type: string
    required: false
  - name: insights
    description: Recommendations from insights
    type: array
    required: false
outputs:
  - commit_messages
  - commit_descriptions
  - commit_footers
tokens:
  avg: 4000
  max: 8000
  min: 2000
---

# Generate Commit Messages

## Objective

Generate conventional commit messages following best practices for each commit group.

## Instructions

### Step 1: Handle Custom Message Override

If `custom_message` provided:

```typescript
if (custom_message) {
  // Validate format
  if (!follows_conventional_commits(custom_message)) {
    warn: "Custom message doesn't follow Conventional Commits format";
  }
  
  // Use custom message for all groups (if single)
  // Or use as subject template for groups
  return custom_message_result;
}
```

### Step 2: Generate Message for Each Group

For each commit group, generate:

1. **Subject line** (< 72 characters)
2. **Body** (optional, wrap at 72 characters)
3. **Footer** (optional, for breaking changes, issue refs)

### Step 3: Generate Subject Line

**Format**: `<type>(<scope>): <description>`

**Type**: Use group's `type` (feat, fix, docs, etc.)

**Scope**:
- Use user-specified `scope` if provided
- Otherwise use group's `scope`
- Omit if change affects multiple areas broadly

**Description**:
- Start with lowercase
- Use imperative mood ("add", not "added" or "adds")
- Be specific and concise
- No period at end
- < 50 characters ideally

**Breaking change indicator**:
- Add `!` after scope if breaking: `feat(api)!: redesign endpoints`

**Examples**:
```plaintext
✅ feat(auth): implement OAuth2 refresh token rotation
✅ fix(cache): resolve race condition in Redis operations
✅ docs(api): document rate limiting behavior
✅ test(auth): add OAuth2 integration tests
✅ refactor(db): extract query builders
✅ perf(api): optimize user query with indexing

❌ feat: update files (too vague)
❌ fix: bug (not descriptive)
❌ Added OAuth2 support (wrong mood)
❌ feat(auth): implement OAuth2 refresh token rotation with secure storage and configurable expiration (too long)
```

### Step 4: Generate Body (Optional)

Include body if:
- Changes are complex and need explanation
- Breaking changes require context
- Multiple related changes need listing
- Insights recommendations suggest documentation

**Body structure**:

```plaintext
<What was changed and why>

<Additional context if needed>

<References to issues/tickets>
```

**Rules**:
- Explain **what** and **why**, not **how**
- Wrap at 72 characters
- Use bullet points for lists
- Include context for complex changes
- Reference related issues/tickets
- Blank line after subject

**Example**:

```plaintext
feat(auth): implement OAuth2 refresh token rotation

Add secure token rotation mechanism with configurable expiration.
Tokens are automatically rotated on use and expired tokens are
invalidated.

This improves security by limiting token lifetime and reducing
risk of token theft. Rotation happens transparently to clients.

Refs #456
```

### Step 5: Generate Footer (Optional)

**Footer types**:

1. **Breaking changes** (required if breaking):
   ```plaintext
   BREAKING CHANGE: /api/login endpoint now requires JWT tokens
   instead of session cookies. Clients must update authentication flow.
   ```

2. **Issue references**:
   ```plaintext
   Closes #123
   Fixes #456
   Refs #789
   ```

3. **Co-authors**:
   ```plaintext
   Co-authored-by: Jane Doe <jane@example.com>
   ```

4. **Reviewers** (for some teams):
   ```plaintext
   Reviewed-by: John Smith <john@example.com>
   ```

**Rules**:
- Blank line before footer
- One footer per line
- Use standard keywords (Closes, Fixes, Refs)
- BREAKING CHANGE must be in footer if breaking

### Step 6: Apply Template Variables (If Using Template)

If `template_config` provided:

```typescript
let message = template_config.subject_template;

// Replace variables
message = message.replace(/\{\{scope\}\}/g, scope);
message = message.replace(/\{\{description\}\}/g, description);
message = message.replace(/\{\{ticket\}\}/g, ticket_number || "");

// Body
let body = template_config.body_template;
body = body.replace(/\{\{ticket\}\}/g, ticket_number || "");
body = body.replace(/\{\{details\}\}/g, change_details);

// Footer
let footer = template_config.footer_template;
footer = footer.replace(/\{\{ticket\}\}/g, ticket_number || "");
```

### Step 7: Incorporate Insights Recommendations

If `insights` provided, apply recommendations:

**Examples**:
- Add migration guide mention in body
- Reference security implications
- Document breaking changes more clearly
- Add issue references

### Step 8: Validate Generated Messages

Check each message:

1. **Format compliance**: Matches Conventional Commits spec
2. **Length**: Subject < 72 chars (ideally < 50)
3. **Clarity**: Clear and descriptive
4. **Completeness**: Includes necessary context
5. **Breaking changes**: Properly flagged if applicable

## Output Format

```json
{
  "commit_messages": [
    {
      "group_id": "group_1",
      "subject": "feat(auth): implement OAuth2 refresh token rotation",
      "body": "Add secure token rotation mechanism with configurable expiration.\nTokens are automatically rotated on use and expired tokens are invalidated.\n\nThis improves security by limiting token lifetime and reducing risk of token theft.\n\nRefs #456",
      "footer": "",
      "full_message": "feat(auth): implement OAuth2 refresh token rotation\n\nAdd secure token rotation mechanism with configurable expiration.\nTokens are automatically rotated on use and expired tokens are invalidated.\n\nThis improves security by limiting token lifetime and reducing risk of token theft.\n\nRefs #456",
      "character_count": 68,
      "validation": {
        "format_valid": true,
        "length_ok": true,
        "clarity_score": 9
      }
    },
    {
      "group_id": "group_2",
      "subject": "test(auth): add OAuth2 refresh token tests",
      "body": "Add integration tests for token rotation, expiration, and invalidation scenarios.",
      "footer": "",
      "full_message": "test(auth): add OAuth2 refresh token tests\n\nAdd integration tests for token rotation, expiration, and invalidation scenarios.",
      "character_count": 44,
      "validation": {
        "format_valid": true,
        "length_ok": true,
        "clarity_score": 8
      }
    }
  ],
  "commit_descriptions": {
    "group_1": "OAuth2 refresh token rotation implementation",
    "group_2": "OAuth2 refresh token tests"
  },
  "commit_footers": {
    "group_1": "",
    "group_2": ""
  },
  "total_commits": 2
}
```

**With breaking changes**:

```json
{
  "commit_messages": [
    {
      "group_id": "group_1",
      "subject": "feat(api)!: redesign authentication endpoints",
      "body": "Previous endpoints:\n- POST /auth/login (session-based)\n- POST /auth/logout\n\nNew endpoints:\n- POST /auth/token (JWT-based)\n- POST /auth/refresh\n- DELETE /auth/token\n\nAll API consumers must update their authentication implementation.\n\nCloses #234",
      "footer": "BREAKING CHANGE: Authentication flow has been redesigned to use JWT tokens\ninstead of session-based auth. Session endpoints have been removed.",
      "full_message": "feat(api)!: redesign authentication endpoints\n\nPrevious endpoints:\n- POST /auth/login (session-based)\n- POST /auth/logout\n\nNew endpoints:\n- POST /auth/token (JWT-based)\n- POST /auth/refresh\n- DELETE /auth/token\n\nAll API consumers must update their authentication implementation.\n\nCloses #234\n\nBREAKING CHANGE: Authentication flow has been redesigned to use JWT tokens\ninstead of session-based auth. Session endpoints have been removed.",
      "character_count": 50,
      "validation": {
        "format_valid": true,
        "length_ok": true,
        "clarity_score": 10,
        "breaking_properly_flagged": true
      }
    }
  ]
}
```

## Success Criteria

- ✅ Messages follow Conventional Commits format
- ✅ Subject lines < 72 characters
- ✅ Imperative mood used
- ✅ Breaking changes properly flagged
- ✅ Issue references included if available
- ✅ Clear and descriptive
- ✅ Template applied if specified

## Rules

**DO**:
- ✅ Use imperative mood ("add", "fix", "implement")
- ✅ Be specific and descriptive
- ✅ Flag breaking changes with `!` and footer
- ✅ Reference issues/tickets
- ✅ Keep subject concise

**DON'T**:
- ❌ Use past tense ("added", "fixed")
- ❌ Be vague ("update files", "changes")
- ❌ Exceed character limits
- ❌ Miss breaking change indicators
- ❌ Skip context for complex changes

