---
id: review.validate-standards-compliance
version: 1.0.0
category: review
experimental: true
name: Validate Standards Compliance
description: Verify code adheres to linting rules, formatting standards, and naming conventions
tags:
  - validation
  - linting
  - code-standards
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - asserter
dependencies:
  requires:
    - context.gather-validation-context
inputs:
  - name: coding_standards
    description: Linting and formatting configuration from context stage
    type: object
    required: true
outputs:
  - linting_results
  - formatting_results
  - convention_violations
tokens:
  avg: 1500
  max: 3000
  min: 800
---

# Validate Standards Compliance

## Objective

Execute linting tools, check code formatting, and validate naming conventions to ensure code meets project standards.

## Validation Steps

### Step 1: Run Linting Tools

Execute the project's configured linters:

```bash
# JavaScript/TypeScript
npm run lint -- --max-warnings 0

# Or directly
pnpm exec eslint . --ext .ts,.tsx,.js,.jsx --max-warnings 0

# CSS/SCSS
pnpm exec stylelint "**/*.{css,scss}"
```

**Capture**:
- Total error count
- Total warning count
- Errors by file and line
- Rule violations

### Step 2: Check Code Formatting

Verify formatting consistency:

```bash
# Prettier
pnpm exec prettier --check "**/*.{ts,tsx,js,jsx,css,scss,md,json}"
```

**Capture**:
- Files with formatting issues
- Total files checked
- Specific formatting violations

### Step 3: Validate Naming Conventions

Check if code follows naming patterns from coding_standards:

**Variables & Functions**: camelCase
**Classes & Types**: PascalCase
**Files**: kebab-case or PascalCase (per project standards)
**Constants**: UPPER_SNAKE_CASE

**Validation**:
- Scan modified files for naming violations
- Check exported symbols match conventions
- Verify file names follow project pattern

### Step 4: Verify Code Organization

Check structural conventions:

- Import statements grouped and ordered correctly
- File structure matches project conventions
- Related code properly grouped
- No circular imports

## Output Format

```json
{
  "linting_results": {
    "status": "fail",
    "total_errors": 12,
    "total_warnings": 5,
    "by_file": [
      {
        "file": "src/components/Button.tsx",
        "errors": [
          {
            "line": 23,
            "column": 5,
            "rule": "no-unused-vars",
            "message": "'handleClick' is defined but never used",
            "severity": "error"
          }
        ],
        "warnings": []
      }
    ],
    "commands_run": [
      "npm run lint -- --max-warnings 0"
    ]
  },
  "formatting_results": {
    "status": "pass",
    "files_checked": 45,
    "files_with_issues": 0,
    "issues": [],
    "commands_run": [
      "pnpm exec prettier --check \"**/*.{ts,tsx,js,jsx}\""
    ]
  },
  "convention_violations": {
    "naming": [
      {
        "file": "src/utils/helpers.ts",
        "line": 12,
        "violation": "Function 'ProcessData' should be camelCase: 'processData'",
        "severity": "medium"
      }
    ],
    "organization": [
      {
        "file": "src/api/users.ts",
        "issue": "Imports not grouped: external, internal, types",
        "severity": "low"
      }
    ]
  },
  "summary": {
    "total_issues": 17,
    "critical": 0,
    "high": 12,
    "medium": 3,
    "low": 2,
    "blocking": true
  }
}
```

## Success Criteria

- ✅ All configured linters executed successfully
- ✅ Formatting check completed
- ✅ Naming conventions validated
- ✅ All violations captured with location and severity
- ✅ Commands used for validation documented for reproducibility

## Rules

**Blocking Issues**:
- Any linting **errors** (not warnings)
- Critical security rules violated
- Build-breaking formatting issues

**Non-Blocking Issues**:
- Linting warnings (unless `--max-warnings 0` configured)
- Minor naming inconsistencies
- Import ordering issues

**Note**: Prefer automated tool output over manual inspection. Don't invent issues not reported by tools.

