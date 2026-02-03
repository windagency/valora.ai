---
id: context.extract-ticket-references
version: 1.0.0
category: context
experimental: true
name: Extract Ticket References
description: Extract issue and ticket references from branch name and commit messages
tags:
  - issue-linking
  - ticket-extraction
  - pr-context
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.analyze-git-branch
inputs:
  - name: current_branch
    description: Current branch name
    type: string
    required: true
  - name: commits_ahead
    description: Commit information from branch analysis
    type: array
    required: true
outputs:
  - related_issues
  - ticket_numbers
  - issue_titles
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Extract Ticket References

## Objective

Parse branch names and commit messages to extract references to issues, tickets, and related work items.

## Instructions

### Step 1: Extract from Branch Name

Parse the branch name for common ticket patterns:

**Patterns to match**:

- **JIRA-style**: `PROJ-123`, `ABC-456` (uppercase letters, hyphen, numbers)
- **GitHub issues**: `#123`, `issue-123`, `gh-123`
- **Linear**: `LIN-123`, `linear-123`
- **Other**: Any `XXX-NNN` pattern where X is letter, N is number

**Example**: `feature/PROJ-456-oauth2-implementation` → `PROJ-456`

### Step 2: Extract from Commit Messages

Get commit messages:

```bash
git log origin/<base>..HEAD --format=%s%n%b
```

Search for ticket references in both subject and body:

**Patterns**:

- `Closes #123`, `Fixes #456`, `Resolves #789`
- `Relates to #123`, `Related to #456`, `See #789`
- `PROJ-123`, `ABC-456` (anywhere in message)
- `Issue: #123`, `Ticket: ABC-456`

### Step 3: Query GitHub API for Issue Details

For each GitHub issue number found:

```bash
gh issue view <number> --json number,title,state,url
```

Or use the GitHub API tool.

**Extract**:

- Issue number
- Issue title
- Issue state (open/closed)
- Issue URL

### Step 4: Categorize References

Group references by relationship:

- **Closes**: Issues this PR will close
- **Fixes**: Bugs this PR will fix
- **Relates to**: Related issues (context only)
- **Mentions**: Other references

### Step 5: Deduplicate and Validate

- Remove duplicate ticket numbers
- Validate ticket numbers exist (if possible)
- Preserve unique references only
- Sort by reference type (closes > fixes > relates > mentions)

## Output Format

```json
{
  "related_issues": [
    {
      "number": 456,
      "reference": "PROJ-456",
      "title": "Add OAuth2 authentication support",
      "relationship": "closes",
      "source": "branch_name",
      "url": "https://github.com/owner/repo/issues/456"
    },
    {
      "number": 789,
      "reference": "#789",
      "title": "Security audit findings",
      "relationship": "relates",
      "source": "commit_message",
      "url": "https://github.com/owner/repo/issues/789"
    }
  ],
  "ticket_numbers": ["PROJ-456", "#789"],
  "issue_titles": {
    "PROJ-456": "Add OAuth2 authentication support",
    "#789": "Security audit findings"
  },
  "closing_issues": [456],
  "related_issues_list": [789]
}
```

## Success Criteria

- ✅ All ticket references extracted from branch name
- ✅ All issue references extracted from commits
- ✅ Issue details fetched from GitHub (if applicable)
- ✅ References categorized by relationship type
- ✅ Duplicates removed

## Edge Cases

- **No references found**: Return empty arrays
- **Invalid ticket format**: Skip and continue
- **GitHub API unavailable**: Use ticket numbers without titles
- **Private issues**: May not be accessible, use number only

