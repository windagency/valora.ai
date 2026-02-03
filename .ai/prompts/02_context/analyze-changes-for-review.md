---
id: context.analyze-changes-for-review
version: 1.0.0
category: context
experimental: true
name: Analyze Changes for Review
description: Identify changed files, scope, and focus areas for code quality review
tags:
  - code-review
  - change-analysis
  - scope-detection
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires: []
inputs:
  - name: scope
    description: Review scope (file path, directory, or git diff)
    type: string
    required: true
  - name: severity
    description: Minimum severity level to report
    type: string
    required: false
    validation:
      enum: ["critical", "high", "medium", "low"]
  - name: focus
    description: Specific focus area for review
    type: string
    required: false
    validation:
      enum: ["security", "performance", "maintainability", "all"]
outputs:
  - changed_files
  - change_scope
  - review_focus_areas
  - risk_level
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Analyze Changes for Review

## Objective

Identify what code has changed, categorize the scope of changes, and determine appropriate focus areas for code quality review.

## Instructions

### Step 1: Identify Changed Files

**From Git** (if scope is commit/branch):

```bash
# Get changed files from current branch vs main
git diff --name-status main...HEAD

# Or from uncommitted changes
git status --short
```

**From Provided Scope**:

- If scope is a file path: Single file review
- If scope is a directory: All files in directory
- If scope is "current" or empty: Use git diff

**Capture**:

- List of modified files with paths
- Change type for each: `[added | modified | deleted | renamed]`
- Total files changed

### Step 2: Categorize Change Scope

Group files by functional area:

**Common areas**:

- `backend/api`: API endpoints, controllers
- `backend/services`: Business logic, services
- `backend/data`: Database, repositories, models
- `frontend/components`: UI components
- `frontend/pages`: Page components
- `frontend/state`: State management
- `frontend/utils`: Frontend utilities
- `shared/types`: Type definitions
- `shared/utils`: Shared utilities
- `tests`: Test files
- `config`: Configuration
- `infrastructure`: Docker, deployment

**Analysis**:

- Primary area (most files changed)
- Secondary areas (supporting changes)
- Cross-cutting concerns (multiple areas affected)

### Step 3: Assess Risk Level

Calculate risk based on:

1. **Change Volume**:
   - Low: 1-3 files
   - Medium: 4-10 files
   - High: 11-25 files
   - Critical: 26+ files

2. **File Criticality**:
   - Critical files: Authentication, payments, data migrations
   - High: API endpoints, database queries
   - Medium: Business logic, services
   - Low: Tests, documentation, utilities

3. **Change Type**:
   - New files: Lower risk (additive)
   - Modifications: Medium risk (review needed)
   - Deletions: Higher risk (potential breaking)

**Risk Level Formula**:

```plaintext
If any critical file changed: risk = "critical"
Else if high files changed AND volume > medium: risk = "high"
Else if volume = high OR (high files AND volume = medium): risk = "medium"
Else: risk = "low"
```

### Step 4: Determine Review Focus Areas

Based on `focus` input and file analysis:

**If focus = "security"**:

- Prioritize: Auth files, API endpoints, data access, input validation
- Check for: SQL injection, XSS, secrets, auth bypass

**If focus = "performance"**:

- Prioritize: Database queries, loops, API calls, algorithms
- Check for: N+1 queries, inefficient algorithms, memory leaks

**If focus = "maintainability"**:

- Prioritize: Complex functions, large files, duplicated code
- Check for: Code smells, high complexity, poor structure

**If focus = "all"** (default):

- Apply all focus areas
- Prioritize based on risk level
- Primary: Security > Architecture > Performance > Maintainability

### Step 5: Identify High-Risk Patterns

Scan for indicators of high-impact changes:

**Database Changes**:

- Migration files
- Schema changes
- Query modifications

**API Contract Changes**:

- New/modified endpoints
- Changed request/response types
- Breaking changes

**Security-Sensitive**:

- Authentication logic
- Authorization checks
- Encryption/decryption
- Secret management

**Performance-Critical**:

- Database queries in loops
- Large data processing
- External API calls
- Caching logic

## Output Format

```json
{
  "changed_files": [
    {
      "path": "src/api/auth/login.ts",
      "change_type": "modified",
      "area": "backend/api",
      "criticality": "critical",
      "lines_changed": 45
    },
    {
      "path": "src/services/user.service.ts",
      "change_type": "modified",
      "area": "backend/services",
      "criticality": "high",
      "lines_changed": 23
    }
  ],
  "change_scope": {
    "total_files": 8,
    "by_area": {
      "backend/api": 2,
      "backend/services": 3,
      "tests": 3
    },
    "primary_area": "backend/services",
    "secondary_areas": ["backend/api", "tests"],
    "cross_cutting": false
  },
  "review_focus_areas": [
    {
      "area": "security",
      "priority": "critical",
      "reason": "Authentication logic modified",
      "files": ["src/api/auth/login.ts"]
    },
    {
      "area": "architecture",
      "priority": "high",
      "reason": "Service layer changes affecting multiple consumers",
      "files": ["src/services/user.service.ts"]
    },
    {
      "area": "standards",
      "priority": "medium",
      "reason": "Code quality and consistency checks"
    }
  ],
  "risk_level": "high",
  "risk_factors": [
    "Critical authentication file modified",
    "8 files changed across multiple areas",
    "Limited test coverage for auth changes"
  ],
  "high_risk_patterns": [
    {
      "pattern": "security_change",
      "files": ["src/api/auth/login.ts"],
      "description": "Authentication endpoint modified"
    }
  ],
  "recommendations": [
    "Prioritize security review for authentication changes",
    "Verify test coverage for modified endpoints",
    "Check for breaking changes in API contracts"
  ]
}
```

## Success Criteria

- ✅ All changed files identified with paths and change types
- ✅ Files categorized by functional area
- ✅ Risk level calculated objectively
- ✅ Focus areas prioritized by impact
- ✅ High-risk patterns detected
- ✅ Actionable recommendations provided

## Rules

**DO**:

- ✅ Use git commands when appropriate for accurate diff
- ✅ Calculate risk objectively based on criteria
- ✅ Prioritize security and architecture over style
- ✅ Flag high-risk patterns explicitly

**DON'T**:

- ❌ Don't review file contents yet (that's next stage)
- ❌ Don't make assumptions about code quality
- ❌ Don't skip risk assessment
- ❌ Don't ignore test file changes

## Notes

- This stage only analyzes WHAT changed, not HOW
- Actual code review happens in subsequent stages
- Output feeds into specialized review prompts
- Keep this stage fast and focused on scope

