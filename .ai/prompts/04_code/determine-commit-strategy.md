---
id: code.determine-commit-strategy
version: 1.0.0
category: code
experimental: true
name: Determine Commit Strategy
description: Decide whether to create single or multiple commits and group changes logically
tags:
  - commit-strategy
  - change-grouping
  - atomic-commits
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
    - context.analyze-change-scope
inputs:
  - name: change_summary
    description: Summary of changes
    type: string
    required: true
  - name: affected_areas
    description: Affected functional areas
    type: array
    required: true
  - name: breaking_changes
    description: Whether breaking changes detected
    type: boolean
    required: true
outputs:
  - should_split
  - commit_groups
  - commit_strategy
tokens:
  avg: 3000
  max: 6000
  min: 1500
---

# Determine Commit Strategy

## Objective

Decide whether changes should be committed as a single commit or split into multiple logical commits.

## Instructions

### Step 1: Evaluate Split Criteria

Check if any of these conditions apply:

**Split if**:

1. **Multiple distinct features** - Separate logical features that could be independent
2. **Mixed concerns** - Feature + refactor, or feature + docs, or fix + feature
3. **Large changeset** - Total changes > 500 LOC
4. **Frontend + backend** - Separate layers when appropriate
5. **Schema migrations** - Always separate migrations from code changes
6. **Multiple affected areas** - Changes to unrelated functional areas

**Single commit if**:

1. **Single logical unit** - All changes relate to one feature/fix
2. **Small changeset** - Total changes < 500 LOC
3. **Tightly coupled** - Changes depend on each other
4. **Single area** - All changes in one functional area

### Step 2: Group Changes by Logical Unit

If splitting, group files by:

**Priority order**:

1. **Schema/migrations** (highest priority)
   - Database migrations
   - API contract changes
   - Data model changes

2. **Backend/core logic**
   - Business logic
   - APIs
   - Services

3. **Frontend/UI**
   - Components
   - Pages
   - Styles

4. **Tests**
   - Unless tightly coupled to feature
   - Can be separate commit

5. **Documentation**
   - README
   - API docs
   - Comments

6. **Configuration**
   - CI/CD
   - Build tools
   - Linting

**Grouping rules**:

```typescript
groups = [];

// Group 1: Migrations (if any)
if (has_migrations) {
  groups.push({
    type: "build" or "feat",
    scope: "schema" or "migrations",
    files: migration_files,
    description: "schema changes"
  });
}

// Group 2: Backend changes
if (has_backend_changes) {
  groups.push({
    type: primary_change_type,
    scope: backend_scope,
    files: backend_files,
    description: backend_description
  });
}

// Group 3: Frontend changes
if (has_frontend_changes && !tightly_coupled_with_backend) {
  groups.push({
    type: "feat" or "fix",
    scope: frontend_scope,
    files: frontend_files,
    description: frontend_description
  });
}

// Group 4: Tests (if large)
if (test_files.length > 5 || test_loc > 200) {
  groups.push({
    type: "test",
    scope: test_scope,
    files: test_files,
    description: "tests for X"
  });
}

// Group 5: Documentation
if (has_doc_changes && !docs_tightly_coupled) {
  groups.push({
    type: "docs",
    scope: doc_scope,
    files: doc_files,
    description: doc_description
  });
}
```

### Step 3: Validate Grouping

Ensure each group is:

1. **Atomic** - Can be committed independently
2. **Coherent** - All files relate to same logical change
3. **Self-contained** - Includes all necessary changes for that unit
4. **Buildable** - Codebase builds after this commit
5. **Testable** - Tests pass after this commit

**Bad grouping examples**:
- ❌ Half of a feature in one commit
- ❌ Part of a function in one commit, rest in another
- ❌ Breaking backend without frontend adaptation
- ❌ Code change without corresponding test updates

**Good grouping examples**:
- ✅ Complete feature in one commit with tests
- ✅ Schema migration + backend adaptation together
- ✅ Backend API + frontend consumer separately (if not breaking)
- ✅ Refactor separate from feature implementation

### Step 4: Determine Commit Order

Order commits by dependency:

**Commit order**:

1. Migrations first (other commits may depend on schema)
2. Backend/API changes (frontend depends on these)
3. Frontend changes (consumes backend APIs)
4. Tests (validate implementation)
5. Documentation (documents implemented features)
6. Configuration (supporting infrastructure)

**Rationale**: Each commit should be deployable, so dependencies must be committed first.

### Step 5: Calculate Strategy Metadata

```typescript
commit_strategy = {
  should_split: groups.length > 1,
  strategy: groups.length > 1 ? "split" : "single",
  commit_count: groups.length,
  total_files: sum(groups.map(g => g.files.length)),
  rationale: explain_why_split_or_single()
};
```

## Output Format

**Single commit**:

```json
{
  "should_split": false,
  "commit_strategy": "single",
  "commit_groups": [
    {
      "id": "group_1",
      "type": "feat",
      "scope": "auth",
      "files": [
        "src/auth/oauth.ts",
        "src/auth/tokens.ts",
        "tests/auth/oauth.test.ts"
      ],
      "description": "OAuth2 refresh token rotation",
      "line_count": 145,
      "priority": 1
    }
  ],
  "rationale": "All changes are part of single OAuth2 feature, tightly coupled, under 500 LOC"
}
```

**Split commits**:

```json
{
  "should_split": true,
  "commit_strategy": "split",
  "commit_groups": [
    {
      "id": "group_1",
      "type": "feat",
      "scope": "auth",
      "files": [
        "src/auth/oauth.ts",
        "src/auth/tokens.ts"
      ],
      "description": "OAuth2 refresh token rotation",
      "line_count": 145,
      "priority": 1
    },
    {
      "id": "group_2",
      "type": "test",
      "scope": "auth",
      "files": [
        "tests/auth/oauth.test.ts",
        "tests/auth/tokens.test.ts"
      ],
      "description": "OAuth2 refresh token tests",
      "line_count": 120,
      "priority": 2
    },
    {
      "id": "group_3",
      "type": "docs",
      "scope": "auth",
      "files": [
        "docs/auth/oauth2.md"
      ],
      "description": "OAuth2 setup documentation",
      "line_count": 50,
      "priority": 3
    }
  ],
  "rationale": "Large changeset (315 LOC) with separable concerns: implementation, tests, and documentation can be independent commits"
}
```

## Success Criteria

- ✅ Strategy determined (single vs split)
- ✅ If split, changes grouped logically
- ✅ Each group is atomic and coherent
- ✅ Commit order respects dependencies
- ✅ Rationale provided for decision

## Rules

**DO**:
- ✅ Keep migrations separate from code changes
- ✅ Split when changeset > 500 LOC
- ✅ Group by logical units, not file types
- ✅ Ensure each commit is buildable/testable

**DON'T**:
- ❌ Split too granularly (1 file = 1 commit)
- ❌ Create commits that break the build
- ❌ Mix unrelated changes in one commit
- ❌ Separate tightly coupled changes

