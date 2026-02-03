---
id: test.analyze-test-infrastructure
version: 1.0.0
category: test
experimental: true
name: Analyze Test Infrastructure
description: Detect test framework, configuration, and identify relevant test files by scope
tags:
  - testing
  - infrastructure-analysis
  - test-discovery
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
    - claude-sonnet-4.5
agents:
  - qa
dependencies:
  requires: []
  optional:
    - context.scan-codebase
inputs:
  - name: test_scope
    description: Scope of tests to analyze (all, specific directory, or file pattern)
    type: string
    required: false
    default: all
outputs:
  - test_framework
  - test_structure
  - existing_tests
tokens:
  avg: 3000
  max: 6000
  min: 1500
---

# Analyze Test Infrastructure

## Objective

Understand the testing setup, identify test framework(s), map test organization, and determine relevant tests based on scope.

## Instructions

### Step 1: Detect Test Framework(s)

**Check package managers and configuration files**:

For JavaScript/TypeScript:
- `package.json`: Check devDependencies for Jest, Vitest, Mocha, Jasmine, AVA, etc.
- Look for `jest.config.js`, `vitest.config.ts`, `.mocharc.json`
- Check test scripts in `package.json` (e.g., `"test": "vitest"`)

For Python:
- `requirements.txt`, `pyproject.toml`, `setup.py`: Check for pytest, unittest, nose2
- Look for `pytest.ini`, `setup.cfg`, `tox.ini`

For Go:
- Built-in `go test` (check for `*_test.go` files)
- Look for additional frameworks: testify, ginkgo

For Java:
- `pom.xml`, `build.gradle`: Check for JUnit, TestNG
- Look for test configurations in build files

For other languages:
- Rust: Check `Cargo.toml` for test dependencies
- Ruby: Check for RSpec, Minitest
- PHP: Check for PHPUnit

**Output**:
```json
{
  "framework": {
    "name": "Vitest",
    "version": "1.0.4",
    "config_file": "vitest.config.ts",
    "runner_command": "vitest"
  },
  "additional_tools": [
    {"name": "Testing Library", "purpose": "Component testing"},
    {"name": "Playwright", "purpose": "E2E testing"}
  ]
}
```

### Step 2: Map Test Directory Structure

**Identify test file conventions**:
- `*.test.ts`, `*.spec.ts`, `*.test.js` (JavaScript/TypeScript)
- `test_*.py`, `*_test.py` (Python)
- `*_test.go` (Go)
- `*Test.java`, `*Tests.java` (Java)

**Map test organization**:
```json
{
  "structure": {
    "pattern": "co-located|separate|hybrid",
    "locations": [
      {
        "path": "src/**/*.test.ts",
        "type": "unit",
        "count": 45,
        "pattern": "co-located with source"
      },
      {
        "path": "tests/integration/",
        "type": "integration",
        "count": 12,
        "pattern": "separate test directory"
      },
      {
        "path": "tests/e2e/",
        "type": "e2e",
        "count": 8,
        "pattern": "separate test directory"
      }
    ]
  }
}
```

### Step 3: Review Test Scripts and Commands

**Parse available test commands**:

From `package.json`:
```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run src",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Extract test execution patterns**:
```json
{
  "commands": {
    "unit": {
      "command": "npm run test:unit",
      "scope": "src/**/*.test.ts",
      "coverage_supported": true
    },
    "integration": {
      "command": "npm run test:integration",
      "scope": "tests/integration",
      "coverage_supported": true
    },
    "e2e": {
      "command": "npm run test:e2e",
      "scope": "tests/e2e",
      "coverage_supported": false
    },
    "all": {
      "command": "npm test",
      "coverage_command": "npm run test:coverage"
    }
  }
}
```

### Step 4: Identify Test Fixtures and Helpers

**Locate shared test utilities**:
- Test helpers (factories, builders, mocks)
- Fixtures and sample data
- Setup/teardown utilities
- Custom matchers/assertions

```json
{
  "helpers": [
    {"path": "tests/helpers/factories.ts", "purpose": "Test data factories"},
    {"path": "tests/helpers/mocks.ts", "purpose": "Mock services"},
    {"path": "tests/setup.ts", "purpose": "Global test setup"}
  ],
  "fixtures": [
    {"path": "tests/fixtures/sample-data.json", "purpose": "Test data"}
  ]
}
```

### Step 5: Determine Environment Requirements

**Check for special environment needs**:
- Database requirements (test DB, migrations)
- External service dependencies (mocked or real)
- Environment variables
- Docker containers

```json
{
  "environment": {
    "database": {
      "required": true,
      "type": "PostgreSQL",
      "setup": "npm run db:test:setup"
    },
    "env_variables": [
      "TEST_DATABASE_URL",
      "NODE_ENV=test"
    ],
    "docker": {
      "required": false,
      "services": []
    }
  }
}
```

### Step 6: Filter Tests by Scope

**Apply test_scope parameter**:

If `test_scope` is provided (not "all"):
- File path: Filter to specific file
- Directory: Filter to specific directory
- Pattern: Apply glob pattern
- Feature: Search for related test files

```json
{
  "filtered_tests": {
    "scope": "src/auth",
    "matched_files": [
      "src/auth/service.test.ts",
      "src/auth/middleware.test.ts",
      "tests/integration/auth-flow.test.ts"
    ],
    "test_count": 34,
    "types": ["unit", "integration"]
  }
}
```

## Output Format

```json
{
  "test_framework": {
    "name": "Vitest",
    "version": "1.0.4",
    "config_file": "vitest.config.ts",
    "coverage_tool": "c8"
  },
  "test_structure": {
    "pattern": "hybrid",
    "unit_tests": {
      "location": "src/**/*.test.ts",
      "count": 45,
      "organization": "co-located"
    },
    "integration_tests": {
      "location": "tests/integration/",
      "count": 12,
      "organization": "separate"
    },
    "e2e_tests": {
      "location": "tests/e2e/",
      "count": 8,
      "organization": "separate"
    }
  },
  "existing_tests": {
    "total_count": 65,
    "by_type": {
      "unit": 45,
      "integration": 12,
      "e2e": 8
    },
    "scoped_tests": 34,
    "test_commands": {
      "unit": "npm run test:unit",
      "integration": "npm run test:integration",
      "e2e": "npm run test:e2e",
      "coverage": "npm run test:coverage"
    }
  },
  "environment_requirements": {
    "database": {"required": true, "setup_command": "npm run db:test:setup"},
    "env_variables": ["TEST_DATABASE_URL", "NODE_ENV=test"],
    "docker": {"required": false}
  },
  "helpers": [
    {"path": "tests/helpers/factories.ts", "purpose": "Test data factories"}
  ]
}
```

## Success Criteria

- ✅ Test framework identified with version
- ✅ Test configuration file located
- ✅ Test directory structure mapped
- ✅ Test commands extracted
- ✅ Scope filter applied (if provided)
- ✅ Environment requirements documented

## Rules

**DO**:
- ✅ Check multiple possible frameworks
- ✅ Identify all test types (unit, integration, e2e)
- ✅ Note version numbers
- ✅ Document test commands accurately
- ✅ Apply scope filters correctly

**DON'T**:
- ❌ Don't assume single framework
- ❌ Don't skip configuration files
- ❌ Don't ignore environment requirements
- ❌ Don't proceed if framework not found

