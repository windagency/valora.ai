---
id: review.validate-type-safety
version: 1.0.0
category: review
experimental: true
name: Validate Type Safety
description: Execute type checkers to ensure type correctness and contract compliance
tags:
  - validation
  - type-safety
  - contracts
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - asserter
dependencies:
  requires:
    - context.gather-validation-context
inputs: []
outputs:
  - type_errors
  - contract_violations
  - type_coverage
tokens:
  avg: 1500
  max: 3000
  min: 800
---

# Validate Type Safety

## Objective

Run type checkers to verify type correctness, interface compliance, null safety, and API contract adherence.

## Validation Steps

### Step 1: Run Type Checker

Execute the project's type checker in strict mode:

**TypeScript**:
```bash
npx tsc --noEmit --strict
```

**Python** (if applicable):
```bash
mypy src/ --strict
```

**Capture**:
- All type errors with location
- Error messages and codes
- Total error count

### Step 2: Check Interface Compliance

Verify implementations satisfy interfaces:

- Function signatures match declarations
- Return types are correct
- Generic constraints satisfied
- Class implements interface fully

### Step 3: Validate Null Safety

Check nullable value handling:

- Optional chaining used where needed
- Null coalescing for defaults
- Proper type guards for nullable types
- No implicit `any` or `undefined`

### Step 4: Verify API Contracts

If API specifications exist (OpenAPI, GraphQL):

- Request/response types match schemas
- Endpoint handlers return correct types
- No breaking changes to public APIs
- Type definitions up-to-date

### Step 5: Calculate Type Coverage

Estimate type coverage percentage:

```bash
# TypeScript - check for 'any' usage
grep -r ":\s*any" src/ --include="*.ts" --include="*.tsx" | wc -l

# Or use type-coverage tool
npx type-coverage --at-least 95
```

## Output Format

```json
{
  "type_errors": {
    "status": "fail",
    "total_errors": 5,
    "errors": [
      {
        "file": "src/api/users.ts",
        "line": 45,
        "column": 12,
        "code": "TS2322",
        "message": "Type 'undefined' is not assignable to type 'User'",
        "severity": "error"
      },
      {
        "file": "src/components/UserProfile.tsx",
        "line": 23,
        "column": 8,
        "code": "TS2345",
        "message": "Argument of type 'string | null' is not assignable to parameter of type 'string'",
        "severity": "error"
      }
    ],
    "commands_run": [
      "npx tsc --noEmit --strict"
    ]
  },
  "contract_violations": {
    "api_mismatches": [
      {
        "endpoint": "GET /api/users/:id",
        "issue": "Response type missing 'email' field required by OpenAPI spec",
        "severity": "high"
      }
    ],
    "interface_violations": []
  },
  "type_coverage": {
    "percentage": 94.5,
    "any_count": 12,
    "unknown_count": 2,
    "total_types": 450,
    "untyped_locations": [
      {
        "file": "src/utils/parser.ts",
        "line": 34,
        "usage": "any"
      }
    ]
  },
  "summary": {
    "total_issues": 5,
    "critical": 5,
    "blocking": true
  }
}
```

## Success Criteria

- ✅ Type checker executed successfully
- ✅ All type errors captured with location
- ✅ Interface compliance verified
- ✅ Null safety checked
- ✅ Type coverage calculated
- ✅ Commands documented for reproducibility

## Rules

**Blocking Issues**:
- Any type errors in strict mode
- Missing required properties in API responses
- Unsafe type assertions without guards
- `any` usage without justification

**Non-Blocking Issues**:
- Type coverage below 100% but above threshold (e.g., 95%)
- Non-critical `unknown` usage with proper guards

**Note**: Zero tolerance for type errors. Type safety is non-negotiable in strict mode projects.

