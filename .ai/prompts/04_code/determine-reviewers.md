---
id: code.determine-reviewers
version: 1.0.0
category: code
experimental: true
name: Determine Reviewers
description: Intelligently determine appropriate code reviewers based on ownership and expertise
tags:
  - reviewers
  - codeowners
  - automation
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.analyze-commits-for-pr
    - context.analyze-codebase-changes
inputs:
  - name: reviewers_arg
    description: User-specified reviewers
    type: string
    required: false
  - name: auto_assign
    description: Whether to auto-assign reviewers
    type: boolean
    required: false
    default: false
  - name: affected_files
    description: Files changed in PR
    type: object
    required: true
  - name: impact_areas
    description: Functional areas impacted
    type: object
    required: true
  - name: authors
    description: Commit authors
    type: array
    required: true
outputs:
  - reviewers_list
  - reviewer_rationale
tokens:
  avg: 2500
  max: 5000
  min: 1200
---

# Determine Reviewers

## Objective

Intelligently determine appropriate code reviewers based on code ownership, expertise, and change context.

## Instructions

### Step 1: Check for Manual Reviewers

If `reviewers_arg` is provided:

- Parse comma-separated usernames
- Validate format (GitHub usernames)
- Return as-is with minimal rationale
- Skip auto-assignment logic

**Example**: `--reviewers=alice,bob` → `["alice", "bob"]`

### Step 2: Check Auto-Assign Flag

If `auto_assign` is false and no `reviewers_arg`:

- Return empty reviewers list
- Indicate manual assignment required
- Skip analysis

### Step 3: Load CODEOWNERS File

If `auto_assign` is true, check for CODEOWNERS:

**Locations to check**:

- `.github/CODEOWNERS`
- `CODEOWNERS`
- `docs/CODEOWNERS`

**Parse CODEOWNERS format**:

```
# Format: pattern  @owner1 @owner2

*.js @frontend-team
/api/ @backend-team @alice
/auth/ @security-team @bob
* @default-reviewer
```

**Matching**:

- Match `affected_files` against patterns
- Use most specific pattern match
- Extract @usernames or @team-names

### Step 4: Analyze File History (Git Blame)

For each affected file, find frequent contributors:

```bash
git log --format='%an <%ae>' --follow <file> | sort | uniq -c | sort -rn | head -5
```

**Extract**:

- Top 3-5 contributors per file
- Aggregate across all affected files
- Count contributions per person

### Step 5: Map Functional Areas to Experts

Use `impact_areas` to identify domain experts:

**Common mappings**:

| Area | Typical Experts |
|------|----------------|
| `backend` | Backend engineers, API owners |
| `frontend` | Frontend engineers, UX team |
| `database` | Database admins, data team |
| `authentication` | Security team |
| `infrastructure` | DevOps, SRE team |
| `api` | API platform team |

**Check**:

- Team documentation (`docs/TEAMS.md`)
- Previous PRs in same area
- Org chart (if available)

### Step 6: Apply Selection Criteria

**Prioritize reviewers by**:

1. **CODEOWNERS match** (highest priority)
2. **Frequent file contributors** (git blame)
3. **Domain expertise** (functional area)
4. **Recent activity** (active in last 30 days)

**Filter out**:

- PR author (don't assign to self)
- Inactive users (no activity >90 days)
- External contributors (unless explicitly listed in CODEOWNERS)

### Step 7: Select 1-3 Reviewers

**Optimal count**: 1-3 reviewers

- **Too few** (<1): May cause bottleneck if reviewer unavailable
- **Too many** (>3): Diffusion of responsibility, slower reviews

**Selection logic**:

1. If CODEOWNERS match exists: Use those (max 3)
2. Otherwise: Select top contributor + domain expert
3. For high-impact changes: Add additional expert

**Balance**:

- At least 1 technical reviewer (code quality)
- At least 1 domain expert (business logic)
- Consider security reviewer for auth/security changes

### Step 8: Generate Rationale

For each selected reviewer, provide rationale:

**Example rationales**:

- "CODEOWNERS for `/auth/` directory"
- "Top contributor to `src/auth/oauth2.ts` (12 commits)"
- "Security domain expert (authentication changes)"
- "Recent contributor to authentication module"
- "API platform team lead"

## Output Format

```json
{
  "reviewers_list": ["alice", "bob"],
  "reviewer_rationale": {
    "alice": {
      "username": "alice",
      "reasons": [
        "CODEOWNERS for /auth/ directory",
        "Security domain expert"
      ],
      "confidence": "high",
      "priority": 1
    },
    "bob": {
      "username": "bob",
      "reasons": [
        "Top contributor to src/auth/oauth2.ts (12 commits)",
        "Recent activity in authentication module"
      ],
      "confidence": "medium",
      "priority": 2
    }
  },
  "assignment_method": "auto",
  "alternative_reviewers": [
    {
      "username": "carol",
      "reasons": ["Backend team member"],
      "confidence": "low"
    }
  ]
}
```

## Success Criteria

- ✅ 1-3 reviewers selected (optimal range)
- ✅ PR author not included in reviewers
- ✅ Rationale provided for each reviewer
- ✅ CODEOWNERS respected (if exists)
- ✅ Domain expertise considered

## Special Cases

### No CODEOWNERS Found

**Fallback**:

1. Use git blame analysis
2. Select top 2 contributors
3. Add domain expert if identifiable

### All Owners Are PR Author

**Action**:

1. Skip to next level (file contributors)
2. Select based on git blame
3. Flag for manual assignment

### High-Impact Changes

**Criteria**:

- Breaking changes present
- Security-sensitive code
- Performance-critical paths
- Database migrations

**Action**:

- Add additional reviewer (2-3 total)
- Prioritize senior/lead engineers
- Include domain architect if available

### Security Changes

**If** `impact_areas` includes `authentication` or `security`:

**Action**:

- Add security team member
- Require security review
- Flag for security audit

### Large PRs (>500 lines)

**Action**:

- Add 2-3 reviewers (distribute load)
- Consider splitting review by area
- Suggest pair review sessions

## Edge Cases

### User Not Found

**If reviewer username doesn't exist**:

1. Validate GitHub username
2. Check for typos in CODEOWNERS
3. Skip invalid user
4. Warn in output

### Teams vs. Individual Reviewers

**CODEOWNERS may reference teams**:

```
/auth/ @security-team
```

**Handle**:

- Teams cannot be directly assigned (GitHub API limitation)
- Resolve team to individual members
- Or leave for manual assignment

### Empty Result

**If no reviewers found**:

- Return empty list
- Provide explanation
- Suggest manual assignment
- List potential candidates

## Recommendations

Include in output:

```json
{
  "recommendations": [
    "Consider adding security team reviewer for authentication changes",
    "Large PR (500+ lines) - consider splitting or adding additional reviewer",
    "No recent activity in this area - may need longer review time"
  ]
}
```

