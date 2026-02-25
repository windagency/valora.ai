---
id: context.analyze-change-scope
version: 1.0.0
category: context
experimental: true
name: Analyze Change Scope
description: Analyze changes to determine type, affected areas, and breaking changes
tags:
  - change-analysis
  - semantic-analysis
  - risk-assessment
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
    - context.analyze-git-status
inputs:
  - name: changed_files
    description: List of changed files from git status analysis
    type: array
    required: true
outputs:
  - change_type
  - affected_areas
  - breaking_changes
  - change_summary
  - risk_level
tokens:
  avg: 4000
  max: 8000
  min: 2000
---

# Analyze Change Scope

## Objective

Understand the semantic meaning of changes to determine commit type, affected areas, and risk level.

## Instructions

### Step 1: Read Changed Files

For each file in `changed_files`, read the diff:

```bash
git diff <file>
```

**Analyze**:
- What functions/classes/modules changed?
- What type of changes (new code, deleted code, refactored)?
- Are there API signature changes?
- Are there database schema changes?
- Are there configuration changes?

### Step 2: Categorize Change Type

Determine the primary change type using Conventional Commits types:

**Decision tree**:

1. **feat** - New feature/capability added
   - New functions/classes/endpoints
   - New user-facing functionality
   - New configuration options

2. **fix** - Bug fix
   - Error handling improvements
   - Logic corrections
   - Data validation fixes

3. **refactor** - Code restructuring (no behavior change)
   - Renamed functions/variables
   - Code extraction/consolidation
   - Performance optimization without API changes

4. **docs** - Documentation only
   - README updates
   - Code comments
   - API documentation

5. **style** - Formatting/style changes
   - Linting fixes
   - Formatting (Prettier, ESLint --fix)
   - No logic changes

6. **test** - Test changes only
   - New tests
   - Test updates
   - Test infrastructure

7. **build** - Build system/dependencies
   - package.json updates
   - Webpack/build config
   - Dependency upgrades

8. **ci** - CI/CD configuration
   - GitHub Actions
   - GitLab CI
   - Jenkins pipelines

9. **chore** - Maintenance tasks
   - Tooling updates
   - Scripts
   - Non-production code

10. **perf** - Performance improvements
    - Algorithm optimization
    - Caching
    - Database query optimization

**Rule**: If multiple types apply, choose the most significant for users.

### Step 3: Identify Affected Areas

Extract functional areas (scopes) from file paths:

**Common patterns**:
- `src/auth/**` → `auth`
- `src/api/**` → `api`
- `src/components/**` → `ui` or `components`
- `src/db/**` or `migrations/**` → `db` or `database`
- `src/services/**` → `services`
- `tests/**` → `tests`
- `docs/**` → `docs`

**Rules**:
- Use kebab-case for scopes
- Prefer business domains over technical layers
- Limit to 1-3 primary areas
- Use most specific scope that makes sense

### Step 4: Detect Breaking Changes

Check for breaking changes:

**Indicators**:

1. **API signature changes**:
   - Function parameters added/removed/reordered
   - Return type changes
   - Endpoint path changes
   - Required fields added to requests

2. **Database schema changes**:
   - Column dropped/renamed
   - Table dropped/renamed
   - Constraint changes
   - Data type changes

3. **Configuration changes**:
   - Required environment variables added
   - Config format changes
   - Default behavior changes

4. **Dependency breaking changes**:
   - Major version upgrades
   - Removed APIs

**Pattern detection**:
```typescript
// In diffs, look for:
- function foo(a, b)          // Old
+ function foo(a, b, c)        // New (breaking if c is required)

- export function oldName()
+ export function newName()    // Breaking (API rename)

- app.get('/api/v1/users')
+ app.get('/api/v2/users')    // Breaking (endpoint change)
```

### Step 5: Assess Risk Level

Calculate risk based on:

**Factors**:
- **Criticality of changed files** (high: auth, payment; medium: business logic; low: UI, tests)
- **Change magnitude** (LOC changed)
- **Breaking changes** (yes/no)
- **Test coverage** (tests added/modified?)

**Risk calculation**:
```typescript
risk_score = 0;

// File criticality
if (affects_auth || affects_payment || affects_security) risk_score += 3;
else if (affects_core_business_logic) risk_score += 2;
else if (affects_ui_only) risk_score += 1;

// Change magnitude
if (total_changes > 500) risk_score += 2;
else if (total_changes > 200) risk_score += 1;

// Breaking changes
if (breaking_changes) risk_score += 3;

// Test coverage
if (no_tests_added && is_new_feature) risk_score += 2;
if (tests_added) risk_score -= 1;

// Final risk level
if (risk_score >= 6) risk_level = "high";
else if (risk_score >= 3) risk_level = "medium";
else risk_level = "low";
```

### Step 6: Generate Change Summary

Create a concise 1-2 sentence summary:

**Format**: `<Action> <what> <why/context>`

**Examples**:
- ✅ "Implement OAuth2 refresh token rotation with secure storage"
- ✅ "Fix race condition in Redis cache operations"
- ✅ "Refactor authentication middleware for improved testability"
- ❌ "Update files" (too vague)
- ❌ "Changes to auth system" (not specific)

## Output Format

```json
{
  "change_type": "feat",
  "affected_areas": ["auth", "tokens"],
  "breaking_changes": false,
  "breaking_details": [],
  "change_summary": "Implement OAuth2 refresh token rotation with secure storage",
  "risk_level": "medium",
  "risk_factors": [
    "Affects authentication (critical area)",
    "Medium-sized change (145 LOC)",
    "No tests added"
  ],
  "magnitude": "medium",
  "files_by_area": {
    "auth": ["src/auth/oauth.ts", "src/auth/tokens.ts"],
    "tests": []
  },
  "secondary_types": ["refactor"],
  "suggested_scope": "auth"
}
```

**With breaking changes**:

```json
{
  "change_type": "feat",
  "affected_areas": ["api", "auth"],
  "breaking_changes": true,
  "breaking_details": [
    {
      "type": "api_change",
      "description": "POST /api/login endpoint now requires JWT tokens instead of session cookies",
      "file": "src/api/auth.ts",
      "migration": "Clients must update authentication flow to use JWT"
    }
  ],
  "change_summary": "Redesign authentication endpoints to use JWT tokens",
  "risk_level": "high",
  "risk_factors": [
    "Breaking change in public API",
    "Affects authentication (critical)",
    "Large change (450 LOC)"
  ],
  "magnitude": "large",
  "files_by_area": {
    "api": ["src/api/auth.ts", "src/api/tokens.ts"],
    "auth": ["src/auth/jwt.ts"]
  },
  "suggested_scope": "api"
}
```

## Success Criteria

- ✅ Change type determined using Conventional Commits spec
- ✅ All affected areas identified
- ✅ Breaking changes detected and documented
- ✅ Risk level assessed objectively
- ✅ Concise change summary generated

## Rules

**DO**:
- ✅ Read file diffs to understand actual changes
- ✅ Identify breaking changes explicitly
- ✅ Use standard conventional commit types
- ✅ Be specific about affected areas

**DON'T**:
- ❌ Guess change type without reading diffs
- ❌ Miss breaking changes
- ❌ Use vague scopes like "misc" or "various"
- ❌ Underestimate risk for critical areas

