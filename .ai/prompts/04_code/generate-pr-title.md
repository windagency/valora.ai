---
id: code.generate-pr-title
version: 1.0.0
category: code
experimental: true
name: Generate PR Title
description: Generate a clear, concise pull request title following conventions
tags:
  - pr-generation
  - conventional-commits
  - title-generation
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.analyze-commits-for-pr
inputs:
  - name: custom_title
    description: User-provided custom title
    type: string
    required: false
  - name: change_summary
    description: Summary of changes
    type: object
    required: true
  - name: change_types
    description: Types of changes
    type: object
    required: true
  - name: ticket_numbers
    description: Ticket/issue references
    type: array
    required: false
  - name: branch_name_convention
    description: Branch naming convention
    type: string
    required: false
outputs:
  - pr_title
  - title_format
tokens:
  avg: 1500
  max: 3000
  min: 800
---

# Generate PR Title

## Objective

Generate a clear, concise, and descriptive pull request title that follows conventions and stays under 72 characters.

## Instructions

### Step 1: Check for Custom Title

If `custom_title` is provided:

- Use it as-is
- Validate it's not empty
- Trim whitespace
- Return early

### Step 2: Determine Title Format

Based on repository conventions and change analysis:

**Format**: `type(scope): description [#ticket]`

**Components**:

1. **Type**: Primary change type from `change_types`
2. **Scope**: Functional area affected (optional)
3. **Description**: Brief summary of change
4. **Ticket**: Issue/ticket reference (optional)

### Step 3: Select Change Type

From `change_types.primary`, use the most frequent type:

**Common types**:

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `chore`: Maintenance
- `docs`: Documentation
- `test`: Tests
- `perf`: Performance
- `style`: Styling
- `ci`: CI/CD
- `build`: Build system

If multiple commits with same count, prioritize: feat > fix > refactor > others

### Step 4: Determine Scope

Extract scope from:

1. **Change summary**: Primary functional area
2. **Branch name**: Extract from `feature/auth-...` → scope: `auth`
3. **Commit scopes**: Most common scope from conventional commits

**Common scopes**:

- `auth`, `api`, `ui`, `db`, `infra`, `security`, `docs`

**Optional**: Skip scope if unclear or too broad.

### Step 5: Craft Description

**Single commit**:

- Use commit message subject directly
- Strip type/scope prefix if present
- Capitalize first letter

**Multiple commits**:

- Synthesize from `change_summary.primary_change`
- Use action verb (add, update, fix, remove, improve)
- Be specific but concise
- Examples:
  - "add OAuth2 authentication"
  - "fix token refresh bug"
  - "refactor user service"

**Rules**:

- Start with lowercase (after type/scope)
- Use imperative mood ("add" not "adds" or "added")
- No period at end
- Keep concise (<50 chars for description alone)

### Step 6: Add Ticket Reference (if available)

If `ticket_numbers` exists and has entries:

- Append primary ticket: ` [#123]` or ` [PROJ-456]`
- Format: space + bracket + reference + bracket
- Only include one ticket (most relevant)

### Step 7: Validate Length

**Target**: ≤72 characters total

If title exceeds 72 characters:

1. Remove scope (if present)
2. Shorten description (keep essential words)
3. Move ticket to description instead of title
4. As last resort, truncate description with "..."

**Never sacrifice**:

- Type (always keep)
- Core meaning of description

### Step 8: Format Final Title

Assemble components:

```
type(scope): description [#ticket]
```

Or variations:

```
type: description [#ticket]           (no scope)
type(scope): description              (no ticket)
type: description                     (minimal)
```

## Examples

### Example 1: Single Feature Commit

**Input**:

```json
{
  "custom_title": null,
  "change_types": {"primary": "feat"},
  "change_summary": {"primary_change": "Added OAuth2 authentication"},
  "ticket_numbers": ["PROJ-456"]
}
```

**Output**:

```json
{
  "pr_title": "feat(auth): add OAuth2 authentication [PROJ-456]",
  "title_format": "type(scope): description [ticket]",
  "length": 50
}
```

---

### Example 2: Multiple Commits (Bug Fix)

**Input**:

```json
{
  "change_types": {"primary": "fix"},
  "change_summary": {"primary_change": "Fixed token refresh and login redirect bugs"},
  "ticket_numbers": ["#123", "#456"]
}
```

**Output**:

```json
{
  "pr_title": "fix(auth): resolve token and login issues [#123]",
  "title_format": "type(scope): description [ticket]",
  "length": 49
}
```

---

### Example 3: Refactoring (No Ticket)

**Input**:

```json
{
  "change_types": {"primary": "refactor"},
  "change_summary": {"primary_change": "Refactored user service for better testability"}
}
```

**Output**:

```json
{
  "pr_title": "refactor(user): improve testability",
  "title_format": "type(scope): description",
  "length": 38
}
```

---

### Example 4: Long Title (Needs Truncation)

**Input**:

```json
{
  "change_types": {"primary": "feat"},
  "change_summary": {"primary_change": "Added comprehensive OAuth2 authentication with token refresh and multiple provider support"},
  "ticket_numbers": ["PROJ-456"]
}
```

**Output**:

```json
{
  "pr_title": "feat(auth): add OAuth2 with token refresh [PROJ-456]",
  "title_format": "type(scope): description [ticket]",
  "length": 55,
  "truncated": true
}
```

## Output Format

```json
{
  "pr_title": "feat(auth): add OAuth2 authentication [PROJ-456]",
  "title_format": "type(scope): description [ticket]",
  "length": 50,
  "components": {
    "type": "feat",
    "scope": "auth",
    "description": "add OAuth2 authentication",
    "ticket": "PROJ-456"
  },
  "truncated": false,
  "custom": false
}
```

## Success Criteria

- ✅ Title is clear and descriptive
- ✅ Follows conventional format
- ✅ Length ≤72 characters
- ✅ Includes ticket reference (if available)
- ✅ Uses imperative mood
- ✅ Properly capitalized

## Notes

- Title appears in PR list, commit history, and notifications
- Should be scannable and informative at a glance
- Follows [Conventional Commits](https://www.conventionalcommits.org/) specification

