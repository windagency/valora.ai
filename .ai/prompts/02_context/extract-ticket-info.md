---
id: context.extract-ticket-info
version: 1.0.0
category: context
experimental: true
name: Extract Ticket Info
description: Extract ticket/issue information from branch name for commit linking
tags:
  - ticket-extraction
  - issue-linking
  - branch-analysis
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
inputs:
  - name: branch_name
    description: Current git branch name
    type: string
    required: true
outputs:
  - ticket_number
  - ticket_details
tokens:
  avg: 1500
  max: 3000
  min: 800
---

# Extract Ticket Info

## Objective

Auto-extract ticket/issue number from branch name and optionally fetch details from issue tracker.

## Instructions

### Step 1: Get Current Branch Name

If not provided as input:

```bash
git branch --show-current
```

**Example outputs**:
- `feature/PROJ-123-oauth-implementation`
- `bugfix/456-fix-cache-race`
- `hotfix/ENG-789-security-patch`

### Step 2: Parse Ticket Patterns

Apply regex patterns to extract ticket identifiers:

**Pattern 1: JIRA-style** (most common)
```regex
[A-Z]{2,10}-\d+
```
Examples: `PROJ-123`, `ENG-456`, `TICKET-789`

**Pattern 2: GitHub Issue Numbers**
```regex
(?:issue-|gh-|#)(\d+)
```
Examples: `issue-123`, `gh-456`, `#789`

**Pattern 3: Linear**
```regex
(?:LIN|linear)-(\d+)
```
Examples: `LIN-123`, `linear-456`

**Pattern 4: Generic Ticket-First**
```regex
^(\d+)-
```
Examples: `123-feature-name`, `456-bugfix`

### Step 3: Extract First Match

```typescript
const patterns = [
  /[A-Z]{2,10}-\d+/,           // JIRA-style
  /(?:issue-|gh-|#)(\d+)/,     // GitHub
  /(?:LIN|linear)-(\d+)/,      // Linear
  /^(\d+)-/                    // Generic
];

let ticket_number = null;
for (const pattern of patterns) {
  const match = branch_name.match(pattern);
  if (match) {
    ticket_number = match[0];
    break;
  }
}
```

### Step 4: Fetch Ticket Details (Optional)

If GitHub MCP tools are available and ticket is GitHub issue:

```typescript
if (ticket_number.startsWith('#')) {
  const issue_num = parseInt(ticket_number.substring(1));
  // Use mcp_github with tool_name: "get_issue"
  const details = await mcp_github({
    tool_name: "get_issue",
    arguments: { owner, repo, issue_number: issue_num }
  });
}
```

**Extract**:
- Ticket title
- Ticket status
- Assignee
- Labels

**Note**: This step is optional and may fail if:
- MCP tools not available
- Issue tracker is external (JIRA, Linear, etc.)
- API credentials not configured

### Step 5: Format Output

Return extracted information in structured format.

## Output Format

```json
{
  "ticket_number": "PROJ-123",
  "ticket_type": "jira",
  "ticket_details": {
    "title": "Add OAuth2 authentication support",
    "status": "In Progress",
    "assignee": "damien@example.com",
    "url": "https://company.atlassian.net/browse/PROJ-123"
  },
  "extraction_source": "branch_name",
  "branch_name": "feature/PROJ-123-oauth-implementation"
}
```

**If no ticket found**:

```json
{
  "ticket_number": null,
  "ticket_type": null,
  "ticket_details": null,
  "extraction_source": null,
  "branch_name": "feature/oauth-implementation"
}
```

**If ticket found but details unavailable**:

```json
{
  "ticket_number": "PROJ-123",
  "ticket_type": "jira",
  "ticket_details": null,
  "extraction_source": "branch_name",
  "branch_name": "feature/PROJ-123-oauth-implementation",
  "note": "Ticket details unavailable - external tracker"
}
```

## Success Criteria

- ✅ Branch name analyzed
- ✅ Ticket pattern matched (if present)
- ✅ Ticket number extracted
- ✅ Ticket details fetched (if available)
- ✅ Handle missing ticket gracefully

## Error Handling

- **No ticket in branch name**: Return null - not an error
- **Invalid branch name format**: Extract what's possible
- **API unavailable**: Return ticket number without details
- **Ticket not found**: Warn but continue with number only

