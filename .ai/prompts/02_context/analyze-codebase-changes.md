---
id: context.analyze-codebase-changes
version: 1.0.0
category: context
experimental: true
name: Analyze Codebase Changes
description: Analyze the actual code changes to understand impact, test coverage, and complexity
tags:
  - code-analysis
  - impact-analysis
  - test-coverage
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
  - name: affected_files
    description: Files changed in this PR
    type: object
    required: true
  - name: change_types
    description: Types of changes (feat, fix, etc.)
    type: object
    required: true
outputs:
  - impact_areas
  - test_coverage_delta
  - complexity_metrics
  - dependencies_changed
tokens:
  avg: 4000
  max: 8000
  min: 2000
---

# Analyze Codebase Changes

## Objective

Perform deep analysis of code changes to understand their impact, test coverage, complexity, and dependencies.

## Instructions

### Step 1: Identify Impact Areas

Based on `affected_files`, categorize changes by functional area:

**Common areas**:

- `backend`: Backend services, APIs, servers
- `frontend`: UI components, client code
- `database`: Schemas, migrations, queries
- `infrastructure`: Docker, K8s, Terraform
- `authentication`: Auth, security
- `api`: API endpoints, contracts
- `docs`: Documentation
- `tests`: Test files
- `config`: Configuration files
- `build`: Build scripts, CI/CD

**Analysis**:

1. Group files by directory structure
2. Map to functional areas
3. Identify cross-cutting changes (multiple areas)

### Step 2: Analyze Test Coverage

**Identify test files**:

- Files matching `*.test.*`, `*.spec.*`
- Files in `__tests__/`, `test/`, `tests/` directories

**Calculate test coverage delta**:

1. Count test files added/modified
2. For each source file changed, check if corresponding test exists
3. Identify untested changes

**Coverage categories**:

- **Covered**: Source file has corresponding test file modified
- **Partially covered**: Test file exists but wasn't updated
- **Uncovered**: No test file for source file
- **New tests**: New test files added

### Step 3: Analyze Code Complexity

**Metrics to calculate**:

1. **Files changed**: Total count
2. **Lines changed**: Additions + deletions
3. **Churn**: Files changed multiple times
4. **Scope**: Number of functional areas affected
5. **Depth**: Maximum directory depth of changes

**Complexity score** (0-100):

```plaintext
Score = (
  (files_changed / 50) * 30 +
  (lines_changed / 1000) * 30 +
  (areas_affected / 5) * 20 +
  (has_breaking_changes ? 20 : 0)
)
Capped at 100
```

**Interpretation**:

- **0-30**: Low complexity (small, focused change)
- **31-60**: Medium complexity (moderate change)
- **61-85**: High complexity (large change)
- **86-100**: Very high complexity (massive change)

### Step 4: Identify Dependencies Changed

Check for dependency updates:

**Files to check**:

- `package.json`, `package-lock.json` (Node.js)
- `requirements.txt`, `Pipfile`, `poetry.lock` (Python)
- `go.mod`, `go.sum` (Go)
- `Cargo.toml`, `Cargo.lock` (Rust)
- `pom.xml`, `build.gradle` (Java)
- `Gemfile`, `Gemfile.lock` (Ruby)

**Extract**:

- Added dependencies
- Removed dependencies
- Updated dependencies (version changes)
- Security-sensitive deps (auth, crypto, etc.)

### Step 5: Detect High-Impact Patterns

Look for patterns indicating high impact:

1. **Database migrations**: Changes to schema files
2. **API contract changes**: Changes to OpenAPI, GraphQL schemas
3. **Configuration changes**: Environment variables, feature flags
4. **Security changes**: Auth, permissions, encryption
5. **Performance-critical**: Database queries, loops, algorithms
6. **Public interfaces**: Exported functions, classes, APIs

### Step 6: Identify Missing Coverage

Check for common gaps:

- **Source code without tests**: Critical for new features
- **Documentation not updated**: When APIs change
- **Migration guides missing**: For breaking changes
- **Configuration examples missing**: For new config options

## Output Format

```json
{
  "impact_areas": {
    "primary": ["backend", "authentication"],
    "secondary": ["docs", "tests"],
    "all": ["backend", "authentication", "docs", "tests"],
    "breakdown": {
      "backend": {
        "files": 8,
        "lines_changed": 234
      },
      "authentication": {
        "files": 3,
        "lines_changed": 156
      },
      "docs": {
        "files": 2,
        "lines_changed": 45
      },
      "tests": {
        "files": 2,
        "lines_changed": 89
      }
    }
  },
  "test_coverage_delta": {
    "test_files_added": 2,
    "test_files_modified": 1,
    "source_files_covered": 8,
    "source_files_uncovered": 2,
    "coverage_status": "good",
    "coverage_percentage": 80,
    "uncovered_files": [
      "src/auth/token-refresh.ts",
      "src/utils/crypto.ts"
    ],
    "recommendations": [
      "Add tests for token-refresh.ts",
      "Add tests for crypto.ts (security-sensitive)"
    ]
  },
  "complexity_metrics": {
    "files_changed": 15,
    "lines_added": 342,
    "lines_deleted": 87,
    "net_change": 255,
    "areas_affected": 4,
    "max_depth": 5,
    "complexity_score": 65,
    "complexity_level": "high",
    "review_time_estimate": "2-3 hours"
  },
  "dependencies_changed": {
    "has_changes": true,
    "added": [
      {"name": "oauth2-client", "version": "3.2.1", "type": "production"}
    ],
    "removed": [],
    "updated": [
      {
        "name": "jsonwebtoken",
        "from": "8.5.1",
        "to": "9.0.0",
        "type": "production",
        "breaking": true
      }
    ],
    "security_sensitive": ["jsonwebtoken", "oauth2-client"]
  },
  "high_impact_patterns": [
    {
      "pattern": "api_contract_change",
      "files": ["src/api/auth.ts"],
      "description": "Changed /auth/login endpoint signature"
    },
    {
      "pattern": "security_change",
      "files": ["src/auth/oauth2.ts", "src/auth/tokens.ts"],
      "description": "Modified authentication flow"
    }
  ],
  "missing_coverage": [
    {
      "type": "tests",
      "description": "2 source files lack test coverage",
      "severity": "medium"
    },
    {
      "type": "documentation",
      "description": "API changes not documented",
      "severity": "high"
    }
  ]
}
```

## Success Criteria

- ✅ Impact areas identified and categorized
- ✅ Test coverage analyzed
- ✅ Complexity metrics calculated
- ✅ Dependencies changes detected
- ✅ High-impact patterns identified
- ✅ Missing coverage flagged

## Notes

- This analysis runs in parallel with other context stages
- Results feed into PR readiness validation
- Complexity score helps estimate review time

