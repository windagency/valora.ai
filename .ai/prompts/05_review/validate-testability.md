---
id: review.validate-testability
version: 1.0.0
category: review
experimental: true
name: Validate Testability
description: Validate that acceptance criteria are testable and complete before planning
tags:
  - validation
  - testability
  - acceptance-criteria
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - product-manager
  - lead
dependencies:
  requires:
    - context.load-task
    - onboard.refine-requirements
inputs:
  - name: task
    description: Task details from context.load-task
    type: object
    required: true
  - name: refined
    description: Refined requirements from onboard.refine-requirements
    type: object
    required: true
outputs:
  - testability_score
  - acceptance_criteria_complete
  - test_strategy
tokens:
  avg: 3000
  max: 6000
  min: 1500
---

# Validate Testability

## CRITICAL: Output Format Requirement

**You MUST output ONLY valid JSON. Do NOT output markdown, do NOT wrap in code blocks, do NOT add any text before or after the JSON.**

Your response must be a single JSON object matching the schema defined in the "Output Format" section at the end of this prompt. Start directly with `{` and end with `}`.

## Objective

Verify that refined acceptance criteria are complete, testable, and measurable before proceeding to technical planning.

## Testability Framework

Acceptance criteria must be:

- **S**pecific: Concrete, unambiguous behavior
- **M**easurable: Objectively verifiable
- **A**chievable: Realistic given constraints
- **R**elevant: Directly validates requirement
- **T**estable: Can write automated test

## Instructions

### Step 1: Evaluate Each Acceptance Criterion

For each criterion, check SMART compliance:

#### Specific Check

❌ **Too vague**:
- "Search works well"
- "UI is responsive"
- "System performs adequately"

✅ **Specific**:
- "Search returns results in < 500ms"
- "Button responds to click within 100ms"
- "API handles 1000 concurrent requests"

**Scoring**: Pass (1) or Fail (0)

#### Measurable Check

❌ **Not measurable**:
- "Fast response time"
- "Good user experience"
- "Secure authentication"

✅ **Measurable**:
- "Response time < 500ms for 95th percentile"
- "Task completion rate > 90%"
- "Uses JWT with RS256, 15min expiry"

**Scoring**: Pass (1) or Fail (0)

#### Testable Check

Can you write an automated test?

❌ **Not testable**:
- "Code is maintainable"
- "Design looks professional"
- "Users are satisfied"

✅ **Testable**:
- "All functions have unit tests with > 80% coverage"
- "Page renders in < 2s (Lighthouse score > 90)"
- "User can complete checkout in < 3 clicks"

**Test types**:
- Unit test: Isolated function/component behavior
- Integration test: Service/API interactions
- E2E test: Complete user flows
- Manual test: Visual/UX validation

**Scoring**: Pass (1) or Fail (0)

### Step 2: Check Coverage Completeness

Ensure criteria cover all scenarios:

#### Happy Path Coverage

- [ ] Primary success scenario defined
- [ ] Expected normal behavior clear
- [ ] Positive test cases identified

Example:
```gherkin
GIVEN user is on dashboard with transactions
WHEN user types "coffee" in search field
THEN transactions containing "coffee" appear within 500ms
```

#### Edge Case Coverage

- [ ] Boundary conditions addressed
- [ ] Empty/null/zero cases handled
- [ ] Maximum limits specified
- [ ] Unusual but valid inputs covered

Examples:
- Empty search query
- Very long search string (>100 chars)
- Special characters in input
- Maximum results returned

#### Error Case Coverage

- [ ] Invalid inputs handled
- [ ] Network failures handled
- [ ] Server errors handled
- [ ] Validation errors clear

Examples:
- Invalid date format
- Network timeout
- 500 server error
- Malformed API response

#### Non-Functional Coverage

- [ ] Performance targets specified
- [ ] Security requirements defined
- [ ] Accessibility requirements stated
- [ ] Usability/UX considerations included

Examples:
- Response time < 500ms (performance)
- Input sanitization (security)
- Screen reader compatible (accessibility)
- Loading states shown (usability)

### Step 3: Calculate Testability Score

```plaintext
Testability Score = (
  (Specific Criteria / Total Criteria × 0.25) +
  (Measurable Criteria / Total Criteria × 0.25) +
  (Testable Criteria / Total Criteria × 0.30) +
  (Coverage Complete × 0.20)
)

Coverage Complete = (
  (Happy Path Covered × 0.25) +
  (Edge Cases Covered × 0.25) +
  (Error Cases Covered × 0.25) +
  (Non-Functional Covered × 0.25)
)
```

**Thresholds**:
- **≥ 90%**: Excellent, ready for planning
- **80-89%**: Good, minor improvements suggested
- **70-79%**: Adequate, significant gaps should be addressed
- **< 70%**: Insufficient, needs refinement

### Step 4: Map Criteria to Test Types

For each accepted criterion, identify test type:

```plaintext
Criterion → Test Type Mapping

"Search returns results in < 500ms"
→ Integration test: API endpoint + database query
→ E2E test: Full user flow from UI to results

"Search input debounced to 300ms"
→ Unit test: useDebounce hook behavior
→ Integration test: Verify API calls throttled

"Empty search shows all transactions"
→ Integration test: API behavior with empty query
→ E2E test: User clears search, sees all items

"Network error shows message"
→ Integration test: Mock network failure, check error
→ E2E test: Simulate offline, verify message

"Screen reader announces results count"
→ Manual test: Test with screen reader software
→ A11y test: Check ARIA labels with axe-core
```

### Step 5: Create Test Strategy

Based on mapped criteria, outline testing approach:

```markdown
## Test Strategy

### Unit Tests

**Scope**: Isolated component/function behavior

- `useDebounce` hook delays input by 300ms
- Search input component renders correctly
- Search query builder formats parameters correctly
- Date range parser handles valid/invalid formats

**Coverage Target**: > 80% for search-related functions

---

### Integration Tests

**Scope**: API and service interactions

- `GET /api/transactions?search=coffee` returns matching results
- Search API responds in < 500ms (p95)
- Empty search query returns all transactions
- Invalid date format returns 400 error
- Network timeout handled gracefully
- Server 500 error shows error message

**Coverage Target**: All API endpoints and error scenarios

---

### E2E Tests

**Scope**: Complete user flows

- User types in search field, sees debounced results
- User searches by description, sees matching transactions
- User searches by amount range, sees filtered results
- User clears search, sees all transactions
- User experiences network error, sees error message
- Pagination works with search results

**Coverage Target**: All critical user flows (happy path + key errors)

---

### Manual Tests

**Scope**: Visual, UX, and accessibility validation

- Search UI matches design mockups
- Loading states appear during search
- Error messages are clear and helpful
- Keyboard navigation works (Tab, Enter, Escape)
- Screen reader announces search results
- Mobile responsive design works correctly

**Test Checklist**: [List specific manual checks]

---

### Performance Tests

**Scope**: Response time and load testing

- Search responds in < 500ms for 95th percentile
- System handles 1000 concurrent searches
- Debounce reduces API calls by > 80%

**Tools**: JMeter, Lighthouse, or similar

---

### Security Tests

**Scope**: Input validation and injection prevention

- SQL injection attempts blocked
- XSS attacks sanitized
- Input length limits enforced
- Special characters escaped properly

**Tools**: OWASP ZAP, manual penetration testing
```

### Step 6: Identify Gaps

For any criteria scoring < 0.7, identify specific issues:

```json
{
  "criterion": "Search should be fast",
  "issue": "Not measurable",
  "reason": "'Fast' is subjective and not quantified",
  "recommendation": "Change to: 'Search responds in < 500ms for 95th percentile'",
  "priority": "P0"
}
```

### Step 7: Validate Readiness

Final readiness check:

```markdown
## Testability Validation

### Overall Assessment

**Testability Score**: 88%

✅ **Strengths**:
- All criteria are specific and measurable
- Good coverage of happy path and edge cases
- Clear test strategy defined
- Performance targets quantified

⚠️ **Minor Gaps**:
- 2 error scenarios missing test criteria
- Accessibility criteria could be more specific

### Readiness Decision

**Status**: ✅ Ready for Planning

**Rationale**:
- Score > 85% (threshold)
- All P0 criteria testable
- Test strategy comprehensive
- Minor gaps can be addressed during implementation

**Recommendation**: Proceed to `/plan` command

### Next Steps

1. Use test strategy to guide implementation planning
2. Ensure tests written alongside implementation
3. Address minor gaps during development
4. Validate with manual testing before PR
```

## Output Format

**IMPORTANT**: The example below is for illustration only. Do NOT include the ` ```json ` and ` ``` ` code block markers in your actual response. Start directly with `{`.

```json
{
  "testability_score": 0.88,
  "breakdown": {
    "specific": {
      "score": 0.95,
      "passing_criteria": 19,
      "total_criteria": 20,
      "issues": [
        "Criterion 12: 'Search works smoothly' is too vague"
      ]
    },
    "measurable": {
      "score": 0.90,
      "passing_criteria": 18,
      "total_criteria": 20,
      "issues": [
        "Criterion 12: 'Smoothly' not quantified",
        "Criterion 15: 'Quick response' needs target value"
      ]
    },
    "testable": {
      "score": 0.85,
      "passing_criteria": 17,
      "total_criteria": 20,
      "issues": [
        "Criterion 7: 'UI looks good' - requires manual test but no checklist",
        "Criterion 12: Cannot write automated test",
        "Criterion 18: Unclear how to verify"
      ]
    },
    "coverage": {
      "score": 0.88,
      "happy_path": 1.0,
      "edge_cases": 0.90,
      "error_cases": 0.75,
      "non_functional": 0.85,
      "missing": [
        "Edge case: Search with special chars in amount field",
        "Error case: Concurrent search requests",
        "Non-functional: Color contrast for search input"
      ]
    }
  },
  "acceptance_criteria_complete": {
    "functional": {
      "total": 12,
      "testable": 11,
      "completeness": 0.92
    },
    "non_functional": {
      "total": 8,
      "testable": 7,
      "completeness": 0.88
    },
    "overall_completeness": 0.90
  },
  "test_strategy": {
    "unit_tests": [
      "useDebounce hook delays input by 300ms",
      "Search query builder formats parameters",
      "Date range parser validation"
    ],
    "integration_tests": [
      "GET /api/transactions?search= returns results",
      "Search API responds in < 500ms",
      "Error handling for network failures"
    ],
    "e2e_tests": [
      "User searches and sees results",
      "User clears search and sees all transactions",
      "Pagination works with search"
    ],
    "manual_tests": [
      "Visual design matches mockups",
      "Keyboard navigation functional",
      "Screen reader compatibility"
    ],
    "test_coverage_target": {
      "unit": "80%",
      "integration": "100% of endpoints",
      "e2e": "All critical flows",
      "manual": "Checklist of 15 items"
    }
  },
  "gaps_identified": [
    {
      "criterion": "Search should be fast",
      "issue": "Not measurable",
      "recommendation": "Specify: < 500ms for 95th percentile",
      "priority": "P1"
    },
    {
      "coverage_gap": "Special characters in amount field",
      "impact": "Edge case not covered",
      "recommendation": "Add criterion for special char handling",
      "priority": "P2"
    }
  ],
  "readiness_assessment": {
    "ready_for_planning": true,
    "status": "ready",
    "threshold": 0.85,
    "score": 0.88,
    "confidence": "high",
    "recommendation": "Proceed to planning. Address P1/P2 gaps during implementation.",
    "blockers": []
  }
}
```

## Success Criteria

- ✅ All acceptance criteria evaluated for SMART compliance
- ✅ Testability score calculated objectively
- ✅ Coverage completeness assessed (happy/edge/error/non-functional)
- ✅ Test strategy mapped (unit/integration/e2e/manual)
- ✅ Gaps identified with specific recommendations
- ✅ Readiness decision clear and justified

## Rules

**DO**:
- ✅ Evaluate objectively using SMART criteria
- ✅ Map each criterion to test type
- ✅ Identify specific gaps with recommendations
- ✅ Provide comprehensive test strategy
- ✅ Consider all test types (unit/integration/e2e/manual)

**DON'T**:
- ❌ Don't approve vague criteria
- ❌ Don't skip coverage checks
- ❌ Don't assume criteria are testable without mapping
- ❌ Don't proceed with score < 85%
- ❌ Don't forget non-functional testing

## Notes

- This is final quality gate before planning
- Testability ensures successful implementation validation
- Test strategy guides implementation approach
- High testability score reduces rework during QA
- Output feeds directly into planning phase
- Can reuse `review.validate-completeness` patterns for scoring logic

## REMINDER: Output Requirements

**Output ONLY the JSON object. No markdown, no code blocks, no explanatory text. Start directly with `{` and end with `}`.**

