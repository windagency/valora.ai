---
id: onboard.analyze-clarity
version: 1.0.0
category: onboard
experimental: true
name: Analyze Task Clarity
description: Assess task clarity and identify ambiguities requiring refinement
tags:
  - clarity-assessment
  - ambiguity-detection
  - requirement-analysis
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.load-task
inputs:
  - name: task
    description: Task details from context.load-task
    type: object
    required: true
  - name: criteria
    description: Current acceptance criteria
    type: array
    required: false
outputs:
  - clarity_gaps
  - ambiguities
  - clarity_score
tokens:
  avg: 3000
  max: 6000
  min: 1500
---

# Analyze Task Clarity

## CRITICAL: Output Format Requirement

**You MUST output ONLY valid JSON. Do NOT output markdown, do NOT wrap in code blocks, do NOT add any text before or after the JSON.**

Your response must be a single JSON object matching the schema defined in the "Output Format" section at the end of this prompt. Start directly with `{` and end with `}`.

## Objective

Systematically assess task clarity and identify ambiguities, gaps, and assumptions that need resolution before implementation.

## Clarity Scoring Framework

Calculate **Clarity Score** across 5 dimensions:

| Dimension               | Weight | Criteria                                  |
| ----------------------- | ------ | ----------------------------------------- |
| **Requirements Clear**  | 25%    | What needs to be built is unambiguous     |
| **Acceptance Testable** | 25%    | Success can be objectively verified       |
| **Context Sufficient**  | 20%    | Relevant constraints/patterns identified  |
| **Scope Bounded**       | 15%    | What's in/out of scope is explicit        |
| **Dependencies Known**  | 15%    | Prerequisites and integrations understood |

```plaintext
Clarity Score = Σ(dimension_score × weight) / 100%
Result: 0.0-1.0 scale (0%-100%)
```

**Thresholds**:
- **≥ 85%**: Mostly clear, minor refinement needed
- **60-84%**: Moderate clarity, requires focused clarification
- **< 60%**: Major gaps, needs significant refinement

## Instructions

### Step 1: Evaluate Requirements Clarity (25%)

**Check for vague language**:

❌ **Red flags**:
- Vague verbs: "improve", "enhance", "better", "optimize"
- Undefined scope: "support X" (all of X? common cases?)
- Implicit assumptions: "users will..." (which users? scenarios?)
- Unspecified behavior: "handle errors" (which errors? how?)

✅ **Good examples**:
- "Reduce page load time to < 2 seconds"
- "Support search by description, amount, and date"
- "Display error message 'Invalid credentials' when login fails"

**Scoring**:
- 1.0: Requirements are specific and unambiguous
- 0.7: Some vague terms but context makes meaning clear
- 0.4: Multiple vague terms, interpretation unclear
- 0.0: Highly ambiguous, multiple interpretations possible

### Step 2: Evaluate Acceptance Criteria (25%)

**Check for testability**:

❌ **Non-testable criteria**:
- "UI should look good"
- "System should be fast"
- "Code should be maintainable"
- "User experience should be smooth"

✅ **Testable criteria**:
- "Button responds to click within 100ms"
- "Search returns results in < 500ms for 95% of queries"
- "All components pass WCAG 2.1 Level AA standards"
- "Form validates all required fields before submission"

**Check for coverage**:
- [ ] Happy path defined
- [ ] Edge cases addressed
- [ ] Error scenarios covered
- [ ] Non-functional requirements specified

**Scoring**:
- 1.0: All criteria testable, comprehensive coverage
- 0.7: Most criteria testable, minor gaps
- 0.4: Some criteria testable, significant gaps
- 0.0: Criteria missing or non-testable

### Step 3: Evaluate Context Sufficiency (20%)

**Check for missing context**:

❌ **Context gaps**:
- Unspecified integrations (which APIs/services?)
- Unknown dependencies (what must exist first?)
- Unclear patterns (which existing code to follow?)
- Missing constraints (performance, security, accessibility?)

✅ **Sufficient context**:
- "Integrate with existing /api/auth endpoint"
- "Follow SearchInput component pattern from AdminSearch"
- "Response time < 500ms per NFR-004"
- "Requires Task Creation (FE0010) to be completed first"

**Scoring**:
- 1.0: All necessary context provided or easily inferable
- 0.7: Most context available, minor gaps
- 0.4: Significant context missing, requires investigation
- 0.0: Critical context missing, cannot proceed

### Step 4: Evaluate Scope Boundaries (15%)

**Check for scope definition**:

❌ **Unclear scope**:
- No explicit "in scope" list
- No "out of scope" items
- Feature creep risk
- Overlap with other tasks

✅ **Clear scope**:
- "In scope: Search by text, date, amount"
- "Out of scope: Advanced filters, saved searches"
- "Excludes: Export functionality (covered in FE0015)"

**Scoring**:
- 1.0: Clear in/out scope boundaries
- 0.7: Scope mostly clear, minor ambiguities
- 0.4: Scope unclear, potential overlaps
- 0.0: Scope undefined, unbounded

### Step 5: Evaluate Dependencies (15%)

**Check for dependency clarity**:

❌ **Unclear dependencies**:
- Dependencies listed but not validated
- Unknown external dependencies
- Implicit dependencies not documented
- Circular dependencies

✅ **Clear dependencies**:
- "Depends on: FE0010 (Task Creation) - completed"
- "External: Slack API v2 - available"
- "Technical: Requires JWT authentication in place"

**Scoring**:
- 1.0: All dependencies identified and validated
- 0.7: Dependencies listed, most validated
- 0.4: Some dependencies unclear or unvalidated
- 0.0: Dependencies unknown or not documented

### Step 6: Calculate Overall Clarity Score

```plaintext
Clarity Score = (
  (Requirements Clarity × 0.25) +
  (Acceptance Testability × 0.25) +
  (Context Sufficiency × 0.20) +
  (Scope Boundaries × 0.15) +
  (Dependencies × 0.15)
)
```

### Step 7: Identify Specific Gaps

For each dimension scoring < 0.7, identify **specific** ambiguities:

**Format**:
```plaintext
Category: [Dimension]
Priority: [P0/P1/P2]
Gap: [Specific missing information]
Impact: [How this affects implementation]
Example: [Clarifying question or example]
```

**Prioritization**:
- **P0 (Critical)**: Blocker - cannot proceed without resolution
- **P1 (Important)**: Affects design decisions
- **P2 (Minor)**: Nice to know, can be inferred/assumed

### Step 8: Categorize Ambiguities

Group ambiguities by type:

#### Requirements Ambiguities
- Vague descriptions
- Undefined behavior
- Missing specifications

#### Acceptance Criteria Gaps
- Non-testable criteria
- Missing negative cases
- Incomplete coverage

#### Context & Constraints
- Unspecified integrations
- Unknown patterns
- Missing performance targets

#### Scope Issues
- Undefined boundaries
- Feature creep risks
- Task overlaps

## Output Format

**IMPORTANT**: The example below is for illustration only. Do NOT include the ` ```json ` and ` ``` ` code block markers in your actual response. Start directly with `{`.

```json
{
  "clarity_score": 0.72,
  "dimension_scores": {
    "requirements_clear": {
      "score": 0.7,
      "weight": 0.25,
      "weighted_score": 0.175,
      "assessment": "Some vague terms present",
      "issues": [
        "\"Search functionality\" - what entities? what fields?",
        "\"Real-time\" - what latency is acceptable?"
      ]
    },
    "acceptance_testable": {
      "score": 0.4,
      "weight": 0.25,
      "weighted_score": 0.10,
      "assessment": "Criteria too vague, major gaps",
      "issues": [
        "\"Users can search\" - not testable without specifics",
        "Missing: empty state, no results, error handling",
        "Missing: performance targets"
      ]
    },
    "context_sufficient": {
      "score": 0.9,
      "weight": 0.20,
      "weighted_score": 0.18,
      "assessment": "Good context from similar task",
      "issues": []
    },
    "scope_bounded": {
      "score": 0.7,
      "weight": 0.15,
      "weighted_score": 0.105,
      "assessment": "Scope somewhat clear",
      "issues": [
        "Unclear if pagination is included",
        "Advanced filters in/out of scope?"
      ]
    },
    "dependencies_known": {
      "score": 1.0,
      "weight": 0.15,
      "weighted_score": 0.15,
      "assessment": "No dependencies listed, task appears independent",
      "issues": []
    }
  },
  "clarity_gaps": [
    {
      "category": "Requirements",
      "priority": "P0",
      "gap": "Search target unclear",
      "description": "\"Search functionality\" doesn't specify what entities to search (transactions, users, all?)",
      "impact": "Cannot determine API endpoint or data model requirements",
      "clarifying_question": "What should users be able to search for? (e.g., transactions only, or multiple entities?)"
    },
    {
      "category": "Acceptance Criteria",
      "priority": "P0",
      "gap": "Non-testable criteria",
      "description": "\"Users can search\" is too vague to verify",
      "impact": "Cannot write automated tests or verify completion",
      "clarifying_question": "What specific search capabilities should be tested? (e.g., search by field X, Y, Z?)"
    },
    {
      "category": "Acceptance Criteria",
      "priority": "P1",
      "gap": "Missing edge cases",
      "description": "No coverage for empty results, invalid input, or errors",
      "impact": "Edge cases likely to be missed in implementation",
      "clarifying_question": "What should happen when search returns no results? With invalid input?"
    },
    {
      "category": "Requirements",
      "priority": "P1",
      "gap": "Performance target undefined",
      "description": "\"Real-time\" is subjective and non-measurable",
      "impact": "No performance baseline for optimization decisions",
      "clarifying_question": "What response time is acceptable? (e.g., < 500ms?)"
    },
    {
      "category": "Scope",
      "priority": "P2",
      "gap": "Pagination unclear",
      "description": "Not specified if results should be paginated",
      "impact": "May need to refactor if pagination required later",
      "clarifying_question": "Should search results be paginated? If so, how many per page?"
    }
  ],
  "ambiguities": {
    "requirements": [
      "Search target entities undefined",
      "Real-time behavior not quantified"
    ],
    "acceptance_criteria": [
      "Criteria not testable",
      "Edge cases missing",
      "Performance targets missing"
    ],
    "context": [],
    "scope": [
      "Pagination in/out of scope unclear"
    ],
    "dependencies": []
  },
  "readiness_assessment": {
    "status": "needs_clarification",
    "threshold": 0.85,
    "gap": 0.13,
    "recommendation": "Moderate clarity. Requires focused clarification of P0 gaps before planning.",
    "can_proceed": false,
    "blocker_count": 2
  }
}
```

## Success Criteria

- ✅ All 5 dimensions evaluated objectively
- ✅ Clarity score calculated using formula
- ✅ Specific gaps identified (not generic)
- ✅ Gaps prioritized (P0/P1/P2)
- ✅ Clarifying questions provided
- ✅ Readiness assessment clear

## Rules

**DO**:
- ✅ Be objective - use scoring criteria consistently
- ✅ Be specific - identify exact ambiguities
- ✅ Prioritize gaps - not all equally critical
- ✅ Provide questions - help resolve ambiguities

**DON'T**:
- ❌ Don't be lenient - clarity matters for implementation
- ❌ Don't skip dimensions - evaluate all 5
- ❌ Don't guess - if unclear, mark as gap
- ❌ Don't assume - make implicit knowledge explicit

## Notes

- This is systematic analysis, not refinement (that's next stage)
- Scoring should be consistent and repeatable
- Focus on identifying gaps, not solving them
- Output informs refinement strategy
- High-priority gaps block proceeding to planning

## REMINDER: Output Requirements

**Output ONLY the JSON object. No markdown, no code blocks, no explanatory text. Start directly with `{` and end with `}`.**

