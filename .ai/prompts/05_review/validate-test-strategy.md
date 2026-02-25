---
id: review.validate-test-strategy
version: 1.0.0
category: review
experimental: true
name: Validate Test Strategy
description: Ensure testing approach is comprehensive, realistic, and covers critical scenarios
tags:
  - plan-review
  - testing
  - validation
  - coverage
model_requirements:
  min_context: 128000
  recommended:
    - gpt-5-thinking-high
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.use-modern-cli-tools
    - review.load-plan-context
inputs:
  - name: plan_structure
    description: Parsed plan structure from load-plan-context
    type: object
    required: true
outputs:
  - test_coverage_score
  - testing_gaps
tokens:
  avg: 2500
  max: 5000
  min: 1500
---

# Validate Test Strategy

## Objective

Ensure the testing strategy is comprehensive, covers critical scenarios, and provides realistic quality assurance.

## Context

You are reviewing the Testing Strategy section of a plan to verify adequate test coverage and approach.

## Test Coverage Requirements

A comprehensive test strategy should include:

1. **Test Types** - Unit, Integration, E2E
2. **Test Scenarios** - Happy path, error cases, edge cases
3. **Acceptance Criteria** - Clear pass/fail conditions
4. **Coverage Targets** - Minimum coverage percentages

## Instructions

### Step 1: Review Test Types

Check which test types are planned:

```json
{
  "test_types": {
    "unit_tests": {
      "planned": true,
      "description": "Test token generation, validation, expiry logic",
      "target_files": ["services/email.service.test.ts"]
    },
    "integration_tests": {
      "planned": true,
      "description": "Test /verify-email endpoint with database",
      "target_files": ["api/auth.integration.test.ts"]
    },
    "e2e_tests": {
      "planned": false,
      "description": null
    },
    "performance_tests": {
      "planned": false,
      "description": null
    },
    "security_tests": {
      "planned": false,
      "description": null
    }
  }
}
```

#### Required Test Types by Feature Nature

**Always Required**:
- Unit tests (business logic)
- Integration tests (component interaction)

**Conditionally Required**:
- E2E tests: If user-facing feature
- Performance tests: If performance-critical or high-volume
- Security tests: If authentication, authorization, or sensitive data

**Scoring**:
```plaintext
Test Type Coverage:
- Unit tests planned: +3.0
- Integration tests planned: +3.0
- E2E tests (if user-facing): +2.0
- Performance tests (if needed): +1.0
- Security tests (if needed): +1.0

Max: 10.0 (adjust if some types not applicable)
```

### Step 2: Review Test Scenarios

Assess scenario coverage:

#### Happy Path Scenarios

**Must Include**:
- Primary user flow succeeds
- All success criteria met
- Expected behavior demonstrated

**Example**:
```plaintext
✅ Good:
- User registers with email
- Verification email is sent within 5s
- User clicks link with valid token
- Email is marked as verified
- User can access protected features

❌ Bad:
- "Test that it works"
- No specific scenario described
```

**Scoring**:
- Happy path scenarios clearly defined: +2.0
- Generic mention without specifics: +0.5
- Missing: 0.0

#### Error Case Scenarios

**Must Cover**:
- Invalid inputs
- Network failures
- External service failures
- Timeout scenarios
- Concurrent access issues

**Example**:
```plaintext
✅ Good:
- Invalid token returns 404
- Expired token returns 410
- Already verified email returns 200 with message
- Email send failure retries and logs error
- Duplicate verification requests handled

❌ Bad:
- "Test error handling"
- No specific errors identified
```

**Scoring**:
- Multiple error scenarios defined: +3.0
- Some error scenarios: +1.5
- Generic error mention: +0.5
- Missing: 0.0

#### Edge Case Scenarios

**Common Edge Cases**:
- Boundary conditions
- Unusual but valid inputs
- Race conditions
- State transitions
- Legacy data handling

**Example**:
```plaintext
✅ Good:
- Token verified immediately after expiry time (race condition)
- User with existing email_verified=NULL (legacy data)
- Multiple verification emails requested rapidly
- Token contains special URL characters
- Email address with unusual but valid format

❌ Bad:
- "Handle edge cases"
- No specific cases identified
```

**Scoring**:
- Multiple edge cases identified: +2.0
- Some edge cases: +1.0
- Missing: 0.0

### Step 3: Evaluate Acceptance Criteria

Check if acceptance criteria are testable:

#### Functional Requirements

**Good Examples**:
- ✅ "Verification email sent within 5 seconds of registration"
- ✅ "Invalid token returns HTTP 404 with error message"
- ✅ "Email_verified field updated to true upon verification"

**Bad Examples**:
- ❌ "Email system works correctly"
- ❌ "Users can verify their email"
- ❌ "Feature is complete"

**Scoring**:
- All criteria are measurable: +2.0
- Most criteria are measurable: +1.0
- Criteria are vague: +0.3
- Missing: 0.0

#### Non-Functional Requirements

**Should Include** (if relevant):
- Performance targets (latency, throughput)
- Security requirements (encryption, auth)
- Accessibility standards (WCAG level)
- Browser compatibility (versions)
- Uptime/reliability (SLA)

**Example**:
```plaintext
✅ Good:
- Email delivery p95 latency < 5 seconds
- Verification endpoint handles 100 req/sec
- Token generation is cryptographically secure (32+ bytes)

❌ Bad:
- "Fast email delivery"
- "Secure token generation"
```

**Scoring**:
- Specific NFR targets defined: +1.0
- Generic NFR mention: +0.3
- Missing: 0.0

### Step 4: Assess Coverage Targets

Check if coverage thresholds are specified:

#### Coverage Metrics

**Common Targets**:
- Line coverage: 80-90%
- Branch coverage: 75-85%
- Function coverage: 90-95%

**Examples**:
- ✅ "Target 85% line coverage for email service"
- ✅ "100% coverage for token generation/validation functions"
- ❌ "Good test coverage"
- ❌ No coverage target mentioned

**Scoring**:
- Specific coverage targets: +1.0
- Generic coverage goal: +0.3
- Missing: 0.0

#### Quality Gates

**Should Define**:
- Minimum passing coverage
- No failing tests
- No high-severity linter issues
- Security scan passes

**Scoring**:
- Quality gates defined: +1.0
- Generic quality mention: +0.3
- Missing: 0.0

### Step 5: Identify Testing Gaps

Check for missing test coverage:

```json
{
  "testing_gaps": [
    {
      "gap": "No E2E tests planned",
      "impact": "Cannot verify complete user flow end-to-end",
      "severity": "high",
      "recommendation": "Add E2E test: Register → Receive email → Click link → Verify access"
    },
    {
      "gap": "No security tests for token generation",
      "impact": "Token security not verified",
      "severity": "high",
      "recommendation": "Add test: Verify tokens are cryptographically random and unique"
    },
    {
      "gap": "Missing performance test scenarios",
      "impact": "Cannot verify 5-second email delivery target",
      "severity": "medium",
      "recommendation": "Add load test: 100 registrations/sec, verify p95 < 5s"
    },
    {
      "gap": "No tests for migration rollback",
      "impact": "Cannot verify rollback safety",
      "severity": "medium",
      "recommendation": "Add test: Run migration, rollback, verify data integrity"
    }
  ]
}
```

### Step 6: Validate Test Realism

Are the tests practical and achievable?

**Red Flags**:
- "100% code coverage" (unrealistic)
- "Test all possible inputs" (combinatorial explosion)
- No automated tests (only manual)
- Tests require unavailable tools/infrastructure
- Insufficient time allocated for testing

**Scoring Deductions**:
- Unrealistic targets: -1.0
- Only manual testing: -2.0
- Infrastructure issues: -1.5

### Step 7: Calculate Test Coverage Score

```plaintext
Test Coverage Score = (
  test_type_coverage +
  scenario_coverage +
  acceptance_criteria +
  coverage_targets +
  quality_gates
) - deductions

Max Score: 10.0
Min Score: 0.0
```

**Component Weights**:
- Test Types: 30% (max 3.0)
- Scenarios: 40% (max 4.0)
- Acceptance Criteria: 20% (max 2.0)
- Coverage & Quality: 10% (max 1.0)

**Interpretation**:
- **9.0-10.0**: Excellent - Comprehensive testing strategy
- **7.5-8.9**: Good - Adequate coverage with minor gaps
- **6.0-7.4**: Acceptable - Several gaps to address
- **4.0-5.9**: Needs Work - Significant testing gaps
- **0.0-3.9**: Inadequate - Major revision required

### Step 8: Generate Recommendations

Provide specific improvements:

```json
{
  "critical_recommendations": [
    "Add E2E test suite for complete user verification flow"
  ],
  "important_recommendations": [
    "Add security tests for token generation randomness",
    "Define specific error case scenarios (invalid/expired tokens)",
    "Add performance test for email delivery latency"
  ],
  "minor_recommendations": [
    "Specify line coverage target (suggest 85%)",
    "Add edge case scenario for concurrent verifications"
  ],
  "test_scenarios_to_add": [
    {
      "scenario": "User registers, receives email, clicks expired token",
      "type": "error_case",
      "expected": "410 Gone with 'Token expired' message"
    },
    {
      "scenario": "User tries to verify with token for different email",
      "type": "security",
      "expected": "403 Forbidden"
    }
  ]
}
```

## Output Format

```json
{
  "test_coverage_score": 7.8,
  "status": "good",
  "score_breakdown": {
    "test_types": 2.5,
    "scenario_coverage": 3.0,
    "acceptance_criteria": 1.8,
    "coverage_targets": 0.5
  },
  "test_type_assessment": {
    "unit_tests": {
      "planned": true,
      "quality": "good",
      "notes": "Covers business logic adequately"
    },
    "integration_tests": {
      "planned": true,
      "quality": "adequate",
      "notes": "Basic scenarios covered, needs error cases"
    },
    "e2e_tests": {
      "planned": false,
      "quality": "missing",
      "notes": "Should add for user-facing feature"
    },
    "security_tests": {
      "planned": false,
      "quality": "missing",
      "notes": "Critical for token handling"
    }
  },
  "scenario_coverage": {
    "happy_path": {
      "covered": true,
      "quality": "good",
      "scenarios_count": 3
    },
    "error_cases": {
      "covered": true,
      "quality": "adequate",
      "scenarios_count": 2,
      "missing": ["Email send failure", "Concurrent verification attempts"]
    },
    "edge_cases": {
      "covered": false,
      "quality": "missing",
      "missing": ["Token expiry race condition", "Legacy null values"]
    }
  },
  "testing_gaps": [
    {
      "gap": "No E2E tests planned",
      "severity": "high",
      "impact": "Cannot verify complete user flow",
      "recommendation": "Add Playwright E2E test for registration → verification flow"
    },
    {
      "gap": "Security tests missing",
      "severity": "high",
      "impact": "Token security not validated",
      "recommendation": "Add tests for token randomness and uniqueness"
    },
    {
      "gap": "Edge case scenarios not identified",
      "severity": "medium",
      "impact": "May miss bugs in unusual conditions",
      "recommendation": "Add tests for expiry race conditions and legacy data"
    },
    {
      "gap": "No coverage target specified",
      "severity": "low",
      "impact": "Unclear quality bar",
      "recommendation": "Set target: 85% line coverage minimum"
    }
  ],
  "acceptance_criteria_quality": {
    "functional": "good",
    "non_functional": "adequate",
    "measurability": "good"
  },
  "recommendations": {
    "critical": [
      "Add E2E test suite"
    ],
    "important": [
      "Add security tests for token generation",
      "Define error case scenarios",
      "Add edge case tests"
    ],
    "minor": [
      "Specify coverage targets"
    ]
  },
  "suggested_test_scenarios": [
    {
      "type": "e2e",
      "scenario": "Complete registration and verification flow",
      "steps": ["Register", "Check email", "Click link", "Verify access"]
    },
    {
      "type": "security",
      "scenario": "Verify token randomness",
      "assertion": "1000 generated tokens are unique"
    },
    {
      "type": "error_case",
      "scenario": "Email send fails",
      "assertion": "Retry 3 times, log failure, notify user"
    }
  ]
}
```

## Success Criteria

- ✅ All test types assessed (unit, integration, e2e, etc.)
- ✅ Scenario coverage evaluated (happy path, errors, edge cases)
- ✅ Acceptance criteria quality checked
- ✅ Coverage targets validated
- ✅ Testing gaps identified specifically
- ✅ Test coverage score calculated
- ✅ Concrete test scenarios suggested

## Rules

**DO**:
- ✅ Require E2E tests for user-facing features
- ✅ Require security tests for auth/sensitive data
- ✅ Require specific test scenarios (not generic)
- ✅ Verify acceptance criteria are measurable
- ✅ Check if tests are realistic and achievable

**DON'T**:
- ❌ Don't accept "test everything" as strategy
- ❌ Don't accept only manual testing
- ❌ Don't overlook security test requirements
- ❌ Don't approve vague acceptance criteria
- ❌ Don't skip edge case validation

