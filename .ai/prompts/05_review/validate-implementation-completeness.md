---
id: review.validate-implementation-completeness
version: 1.0.0
category: review
experimental: true
name: Validate Implementation Completeness
description: Validate that implementation is complete against acceptance criteria before testing
tags:
  - validation
  - quality-assurance
  - completeness-check
  - implementation
model_requirements:
  min_context: 64000
  recommended:
    - claude-haiku-4.5
    - claude-sonnet-4
agents:
  - asserter
dependencies:
  requires: []
inputs:
  - name: acceptance_criteria
    description: Acceptance criteria to validate against
    type: object
    required: true
  - name: implementation_details
    description: Details of the implementation including modified files and change metrics
    type: object
    required: true
  - name: modified_files
    description: List of modified files with their changes
    type: array
    required: true
outputs:
  - completeness_status
  - missing_features
  - incomplete_items
  - coverage_percentage
tokens:
  avg: 2500
  max: 5000
  min: 1000
---

# Validate Implementation Completeness

## Objective

Validate that an implementation is complete against its acceptance criteria before advancing to the testing phase. This is a static validation that checks code presence and structure without executing tests.

## Context

You have:
- Implementation details including modified files and changes
- Acceptance criteria that the implementation should satisfy
- The goal is to verify all requirements are addressed before running tests

## Validation Process

### Step 1: Parse Acceptance Criteria

Extract all acceptance criteria from the provided context:

1. **Explicit criteria** - From task requirements or user stories
2. **Implied criteria** - Standard implementation expectations
3. **Edge case criteria** - Error handling and boundary conditions

### Step 2: Map Criteria to Implementation

For each acceptance criterion:

1. **Identify relevant files** - Which modified files should implement this criterion?
2. **Check implementation presence** - Is there code that addresses this criterion?
3. **Verify completeness** - Is the implementation fully functional or partial?
4. **Check for placeholders** - Look for TODO, FIXME, HACK, or placeholder comments

### Step 3: Validate Implementation Quality

Check each modified file for:

#### Code Completeness
- [ ] No placeholder implementations (TODO, FIXME, HACK comments)
- [ ] No commented-out code that should be active
- [ ] No empty function bodies or stub implementations
- [ ] No hardcoded values that should be configurable

#### Feature Completeness
- [ ] All required functionality implemented
- [ ] Required edge cases handled
- [ ] Error scenarios covered
- [ ] Success paths implemented

#### Integration Completeness
- [ ] Required imports and dependencies present
- [ ] Exported interfaces match expected contracts
- [ ] Configuration values defined
- [ ] Required environment variables documented

### Step 4: Calculate Coverage

```plaintext
Coverage Percentage = (Implemented Criteria / Total Criteria) × 100

Scoring:
- Fully implemented criterion: 1.0
- Partially implemented criterion: 0.5
- Not implemented criterion: 0.0
- Blocked by placeholder: 0.3
```

### Step 5: Categorize Status

Based on coverage percentage:

- **≥ 95%**: COMPLETE - Ready for testing
- **80-94%**: MOSTLY_COMPLETE - Minor gaps, may proceed with warnings
- **50-79%**: INCOMPLETE - Significant gaps, needs work
- **< 50%**: INSUFFICIENT - Major implementation gaps

## Decision Criteria

### PASS (Ready for Testing)

- ≥ 95% of acceptance criteria addressed
- No critical blocking issues
- No placeholder implementations in core paths
- All required functionality present

### WARN (Proceed with Caution)

- 80-94% of acceptance criteria addressed
- Minor placeholders in non-critical paths
- Some edge cases not fully handled
- Optional features not implemented

### BLOCK (Needs Work)

- < 80% of acceptance criteria addressed
- Critical functionality missing
- Core paths have placeholder implementations
- Required integrations incomplete

## Output Format

**CRITICAL: Your response MUST be ONLY valid JSON. No markdown wrapping, no explanations, no prose. Just the JSON object below.**

```json
{
  "completeness_status": "complete|mostly_complete|incomplete|insufficient",
  "coverage_percentage": 92.5,
  "criteria_breakdown": {
    "total": 12,
    "fully_implemented": 10,
    "partially_implemented": 1,
    "not_implemented": 1
  },
  "missing_features": [
    {
      "criterion": "Error handling for invalid input",
      "severity": "medium",
      "files_affected": ["src/api/handler.ts"],
      "recommendation": "Add input validation and error response"
    }
  ],
  "incomplete_items": [
    {
      "file": "src/utils/parser.ts",
      "line": 45,
      "issue": "TODO comment: implement edge case handling",
      "severity": "low"
    }
  ],
  "placeholder_count": 2,
  "ready_for_testing": true,
  "recommendation": "Implementation is 92.5% complete. Minor gaps identified but non-blocking. Safe to proceed to testing."
}
```

## Rules

**DO**:
- ✅ Be objective - check actual code presence, not intent
- ✅ Be specific - identify exact files and lines with issues
- ✅ Be thorough - check all acceptance criteria
- ✅ Be actionable - provide clear remediation for gaps

**DON'T**:
- ❌ Don't assume functionality exists without evidence
- ❌ Don't ignore placeholder comments (TODO, FIXME, etc.)
- ❌ Don't approve incomplete core functionality
- ❌ Don't block on minor stylistic issues (that's for standards validation)

## Example Output

### Example: Mostly Complete Implementation

```json
{
  "completeness_status": "mostly_complete",
  "coverage_percentage": 87.5,
  "criteria_breakdown": {
    "total": 8,
    "fully_implemented": 6,
    "partially_implemented": 1,
    "not_implemented": 1
  },
  "missing_features": [
    {
      "criterion": "Rate limiting for API endpoints",
      "severity": "medium",
      "files_affected": ["src/middleware/rateLimit.ts"],
      "recommendation": "Implement rate limiting middleware with configurable thresholds"
    }
  ],
  "incomplete_items": [
    {
      "file": "src/services/userService.ts",
      "line": 78,
      "issue": "TODO: Add pagination support",
      "severity": "low"
    }
  ],
  "placeholder_count": 1,
  "ready_for_testing": true,
  "recommendation": "Core functionality implemented. Rate limiting and pagination are non-blocking gaps. Proceed to testing with awareness of limitations."
}
```

### Example: Incomplete Implementation

```json
{
  "completeness_status": "incomplete",
  "coverage_percentage": 62.5,
  "criteria_breakdown": {
    "total": 8,
    "fully_implemented": 4,
    "partially_implemented": 1,
    "not_implemented": 3
  },
  "missing_features": [
    {
      "criterion": "User authentication",
      "severity": "critical",
      "files_affected": ["src/auth/"],
      "recommendation": "Authentication module not implemented - core blocker"
    },
    {
      "criterion": "Data persistence",
      "severity": "critical",
      "files_affected": ["src/db/"],
      "recommendation": "Database layer incomplete - only stub implementations"
    },
    {
      "criterion": "Error responses",
      "severity": "high",
      "files_affected": ["src/api/handlers.ts"],
      "recommendation": "Error handling returns generic 500 errors"
    }
  ],
  "incomplete_items": [
    {
      "file": "src/auth/provider.ts",
      "line": 12,
      "issue": "FIXME: Implement actual token validation",
      "severity": "critical"
    }
  ],
  "placeholder_count": 5,
  "ready_for_testing": false,
  "recommendation": "Critical functionality missing. Authentication and database layers need implementation before testing is meaningful."
}
```
