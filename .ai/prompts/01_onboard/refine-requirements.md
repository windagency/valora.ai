---
id: onboard.refine-requirements
version: 1.0.0
category: onboard
experimental: true
name: Refine Requirements
description: Clarify requirements through structured questioning or reasonable inference
tags:
  - requirement-clarification
  - question-generation
  - assumption-documentation
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
    - claude-sonnet-4
agents:
  - product-manager
dependencies:
  requires:
    - context.load-task
    - onboard.analyze-clarity
inputs:
  - name: task
    description: Task details from context.load-task
    type: object
    required: true
  - name: gaps
    description: Clarity gaps from onboard.analyze-clarity
    type: array
    required: true
  - name: interactive
    description: Whether to ask questions interactively
    type: boolean
    required: false
    default: false
outputs:
  - refined_requirements
  - clarifying_questions
  - assumptions_made
tokens:
  avg: 4000
  max: 8000
  min: 2000
---

# Refine Requirements

## CRITICAL: Output Format Requirement

**You MUST output ONLY valid JSON. Do NOT output markdown, do NOT wrap in code blocks, do NOT add any text before or after the JSON.**

Your response must be a single JSON object matching the schema defined in the "Output Format" section at the end of this prompt. Start directly with `{` and end with `}`.

Even in interactive mode, output a JSON object with the questions embedded as a string field.

## Objective

Resolve ambiguities identified in clarity analysis through either:
1. **Interactive mode**: Structured questions to user
2. **Auto mode**: Reasonable inferences based on context and patterns

## Mode Selection

**Interactive Mode** (`interactive: true`):
- Ask 3-5 targeted questions at a time
- Wait for user responses
- Iterate until critical gaps resolved
- Use when: P0 gaps exist, task is critical, or multiple interpretations possible

**Auto Mode** (`interactive: false`, default):
- Make reasonable inferences from:
  - Similar features in codebase
  - PRD requirements context
  - Standard domain practices
  - Linked acceptance criteria
- Document assumptions explicitly
- Flag high-risk assumptions for validation
- Use when: Patterns exist, time pressure, or lower priority task

## Instructions

### Step 1: Prioritize Gaps for Resolution

Sort gaps by priority:

**P0 (Critical blockers)**:
- Must resolve before proceeding
- Cannot make reasonable assumption
- High risk of incorrect interpretation
- Affects core functionality

**P1 (Important)**:
- Affects design decisions
- Can make cautious assumption with validation
- Moderate impact on implementation

**P2 (Minor)**:
- Nice to know
- Safe to infer from standard practices
- Low risk, can adjust later

**Strategy**:
- Interactive mode: Focus on P0, include some P1
- Auto mode: Resolve P0 through inference, document P1 assumptions

### Step 2A: Interactive Mode - Generate Questions

For each P0 gap (and select P1 gaps), create targeted questions:

#### Question Patterns

**For vague requirements**:
```plaintext
"When you say [vague term], do you mean:
  A) [specific interpretation 1]
  B) [specific interpretation 2]
  C) Something else? (please specify)"
```

**For edge cases**:
```plaintext
"What should happen when [edge case scenario]?
  A) [behavior option 1]
  B) [behavior option 2]
  C) Display error: [message]"
```

**For scope boundaries**:
```plaintext
"Is [related feature] part of this task or separate?
  - Part of this task
  - Separate task (will be added to backlog)
  - Out of scope (not planned)"
```

**For performance/quality**:
```plaintext
"What [metric] is acceptable?
  - < [value 1] (standard)
  - < [value 2] (relaxed)
  - < [value 3] (strict)
  - Other: _______"
```

#### Question Guidelines

✅ **Be specific** - Use concrete examples
✅ **Offer options** - "A or B?" easier than open-ended
✅ **Reference context** - "Like existing feature X?"
✅ **Limit batch size** - 3-5 questions maximum
✅ **Prioritize blockers** - P0 questions first

❌ **Avoid**:
- Open-ended questions without guidance
- Too many questions at once (overwhelming)
- Questions that could be inferred from context
- Technical implementation questions (that's for planning)

#### Output Interactive Questions

```markdown
## 🔍 Clarification Needed

We need your input on a few details to ensure we build this correctly:

### 1. Search Target (Priority: P0)

When you say "add search functionality," what should users be able to search?

**Options**:
- A) Transactions only (by description, amount, date)
- B) Multiple entities (transactions, users, accounts)
- C) Something else? (please specify)

**Context**: Similar "admin search" feature searches users only. Is this the same pattern?

---

### 2. Performance Target (Priority: P0)

What response time is acceptable for search?

**Options**:
- A) < 500ms (standard for search features per NFR-004)
- B) < 1s (acceptable for complex queries)
- C) < 2s (relaxed for large datasets)

**Context**: Existing search features target < 500ms. Should we match this?

---

### 3. Results Pagination (Priority: P1)

Should search results be paginated?

**Options**:
- A) Yes, 20 results per page (matches current patterns)
- B) Yes, different limit: _____ per page
- C) No, show all results (if < 100 expected)

**Context**: Dashboard currently shows paginated lists of 20 items.

---

**Please respond with your choices (e.g., "1A, 2A, 3A") or provide additional details.**
```

### Step 2B: Auto Mode - Make Inferences

For each gap, attempt resolution through reasoning:

#### Inference Sources

1. **Similar features in codebase**:
   - Search for analogous implementations
   - Extract patterns, conventions, configurations
   - Example: "AdminSearch uses 300ms debounce, apply same"

2. **PRD requirements**:
   - Check linked FR-XXX, NFR-XXX for details
   - Cross-reference user stories
   - Example: "NFR-004 specifies < 500ms response time"

3. **Standard domain practices**:
   - Web search: typically debounced, real-time
   - REST APIs: standard HTTP methods and status codes
   - Example: "Search typically uses GET with ?search= parameter"

4. **Existing acceptance criteria**:
   - Task's linked requirements may have detailed criteria
   - Example: "FR-023 specifies search by description, amount, date"

#### Inference Process

For each gap:

1. **Attempt inference**:
   - Check all 4 sources above
   - Look for consensus or clear pattern
   - Apply if confidence > 70%

2. **Document reasoning**:
   ```plaintext
   Gap: [What was unclear]
   Inference: [What we assume]
   Rationale: [Why this is reasonable]
   Confidence: [High/Medium/Low]
   Validation: [How to verify later]
   ```

3. **Flag high-risk assumptions**:
   - Confidence < 70%: Flag for validation
   - P0 gap: Always flag
   - No similar patterns: Flag

#### Example Inferences

```markdown
## 📋 Assumptions Made

### Assumption 1: Search Target (Priority: P0)

**Gap**: "Search functionality" target undefined

**Inference**: Search transactions only

**Rationale**:
- Task context: "user dashboard" typically shows transactions
- Similar task: FE0008 (Admin search) searches single entity
- PRD FR-023: References "transaction search"
- User story US-023-1: "search my transactions"

**Confidence**: High (90%)

**Validation**: ⚠️ Confirm with stakeholder if unclear

---

### Assumption 2: Performance Target (Priority: P0)

**Gap**: "Real-time" not quantified

**Inference**: < 500ms response time (p95)

**Rationale**:
- NFR-004: Standard API response time < 500ms
- Similar feature: AdminSearch targets 400ms average
- Industry standard: Search typically < 500ms
- Existing patterns: All search features use 500ms target

**Confidence**: High (95%)

**Validation**: Covered by NFR-004, no further validation needed

---

### Assumption 3: Results Pagination (Priority: P1)

**Gap**: Pagination not specified

**Inference**: Paginate at 20 results per page

**Rationale**:
- Existing pattern: All dashboard lists use 20/page
- UX consistency: Should match current pagination
- Performance: Large result sets need pagination

**Confidence**: Medium (75%)

**Validation**: ⚠️ Can adjust limit during implementation if needed

---

### Assumption 4: Debounce Delay (Priority: P2)

**Gap**: Real-time behavior implementation detail

**Inference**: 300ms debounce on input

**Rationale**:
- Existing implementation: AdminSearch uses 300ms
- Best practice: 300ms standard for search inputs
- useDebounce hook: Already configured for 300ms

**Confidence**: High (90%)

**Validation**: Standard pattern, low risk
```

### Step 3: Refine Acceptance Criteria

Based on resolved gaps and assumptions, enhance acceptance criteria:

**Transform vague → testable**:

❌ Before: "Users can search"
✅ After: "User can search transactions by description, amount, or date with results returned in < 500ms"

❌ Before: "Search works in real-time"
✅ After: "Search input debounced to 300ms, results update automatically as user types"

**Add missing coverage**:

```markdown
## Enhanced Acceptance Criteria

### Functional Requirements

**Happy Path**:
- ✅ User types in search field, results appear within 500ms
- ✅ Search matches transaction description (partial, case-insensitive)
- ✅ Search filters by amount (exact or range: "$100-$200")
- ✅ Search filters by date (range: "2024-01-01 to 2024-12-31")
- ✅ Multiple filters can be combined (description + date range)

**Edge Cases**:
- ✅ Empty search shows all transactions (no filter applied)
- ✅ No results shows "No transactions found" message
- ✅ Special characters in search handled safely (no injection)
- ✅ Long search queries (> 100 chars) gracefully handled
- ✅ Search works with paginated results

**Error Cases**:
- ✅ Network error shows "Unable to search, please try again"
- ✅ Server error (500) shows "Search temporarily unavailable"
- ✅ Invalid date format shows "Invalid date format, use YYYY-MM-DD"

### Non-Functional Requirements

**Performance**:
- ✅ Search responds in < 500ms for 95th percentile
- ✅ Input debounced to 300ms (reduce API calls)
- ✅ Loading state shown during search

**Usability**:
- ✅ Search icon visible in input field
- ✅ Clear button (X) to reset search
- ✅ Placeholder: "Search transactions by description, amount, or date"
- ✅ Keyboard accessible (Tab, Enter, Escape)

**Accessibility**:
- ✅ Screen reader announces search results count
- ✅ ARIA labels for search input and clear button
- ✅ Focus management (keyboard navigation)
```

### Step 4: Define Scope Boundaries

Make scope explicit based on clarifications:

```markdown
## Scope Definition

### ✅ In Scope

- Search transactions by description (partial match)
- Search by amount (exact value or range)
- Search by date (range selection)
- Real-time search with debouncing
- Display search results in existing transaction list
- Empty state and no-results handling
- Basic error handling (network, server errors)
- Pagination of results (20 per page)
- Keyboard accessibility

### ❌ Out of Scope

- Advanced filters (status, category, merchant) → Deferred to Phase 3
- Saved searches → Separate task (FE0024)
- Search history → Not planned
- Export search results → Covered by FE0018
- Fuzzy matching / typo correction → Future enhancement
- Search across multiple accounts → Single account only (MVP)

### 🔮 Future Considerations

- Advanced filter combinations
- Search suggestions/autocomplete
- Recent searches
- Saved filter presets
```

### Step 5: Document Refined Requirements

Package all refinements:

```json
{
  "refined_requirements": {
    "description": "Enable users to search their transaction history in real-time by description, amount, and date with results displayed within 500ms",
    "detailed_requirements": [
      "Search by transaction description (partial match, case-insensitive)",
      "Search by amount (exact value or range format: $100-$200)",
      "Search by date (range format: YYYY-MM-DD to YYYY-MM-DD)",
      "Debounce input to 300ms to reduce API calls",
      "Display results in existing transaction list component",
      "Paginate results at 20 per page",
      "Show loading state during search",
      "Handle empty state and no results gracefully"
    ],
    "acceptance_criteria": {
      "functional": [ /* enhanced criteria from Step 3 */ ],
      "non_functional": [ /* performance, usability, accessibility */ ],
      "edge_cases": [ /* all edge cases covered */ ],
      "error_cases": [ /* all error scenarios */ ]
    },
    "scope": {
      "in_scope": [ /* explicit list */ ],
      "out_of_scope": [ /* explicit exclusions */ ],
      "future_considerations": [ /* potential enhancements */ ]
    },
    "technical_context": {
      "api_endpoint": "GET /api/transactions?search=",
      "component_pattern": "Follow SearchInput from AdminSearch (FE0008)",
      "hook": "useDebounce (300ms)",
      "performance_target": "< 500ms (NFR-004)",
      "pagination": "20 results per page (existing pattern)"
    }
  },
  "clarifying_questions": [
    /* if interactive mode, questions asked */
  ],
  "assumptions_made": [
    {
      "assumption": "Search transactions only",
      "rationale": "Task context + PRD FR-023",
      "confidence": "high",
      "validation_needed": false
    },
    {
      "assumption": "< 500ms response time",
      "rationale": "NFR-004 standard",
      "confidence": "high",
      "validation_needed": false
    },
    {
      "assumption": "20 results per page pagination",
      "rationale": "Existing dashboard pattern",
      "confidence": "medium",
      "validation_needed": true
    }
  ],
  "high_risk_assumptions": [
    "Pagination limit (can be adjusted during implementation)"
  ],
  "gaps_resolved": 4,
  "gaps_remaining": 0
}
```

## Output Format

**CRITICAL**: Output ONLY valid JSON. No markdown, no code blocks, no explanatory text.

**IMPORTANT**: The example below is for illustration only. Do NOT include the ` ```json ` and ` ``` ` code block markers in your actual response. Start directly with `{`.

```json
{
  "mode": "auto|interactive",
  "refined_requirements": {
    "description": "Enhanced task description",
    "detailed_requirements": ["requirement 1", "requirement 2"],
    "acceptance_criteria": {
      "functional": ["criterion 1"],
      "non_functional": ["criterion 1"],
      "edge_cases": ["case 1"],
      "error_cases": ["case 1"]
    },
    "scope": {
      "in_scope": ["item 1"],
      "out_of_scope": ["item 1"],
      "future_considerations": ["item 1"]
    },
    "technical_context": {}
  },
  "clarifying_questions": [
    {
      "id": "q1",
      "priority": "P0",
      "question": "Question text here?",
      "options": ["A) Option 1", "B) Option 2", "C) Other"],
      "context": "Why this question matters"
    }
  ],
  "assumptions_made": [
    {
      "assumption": "What was assumed",
      "rationale": "Why this assumption is reasonable",
      "confidence": "high|medium|low",
      "validation_needed": true
    }
  ],
  "high_risk_assumptions": ["assumption requiring validation"],
  "clarifications_applied": ["What was clarified"],
  "gaps_resolved": 4,
  "gaps_remaining": 0,
  "confidence_level": "high|medium|low",
  "recommendation": "Ready for validation stage"
}
```

## Success Criteria

**Interactive Mode**:
- ✅ Questions clear and answerable
- ✅ Options provided for easy selection
- ✅ Context given for informed decisions
- ✅ P0 gaps prioritized
- ✅ 3-5 questions max per iteration

**Auto Mode**:
- ✅ Inferences based on evidence
- ✅ Rationale documented
- ✅ Confidence levels assigned
- ✅ High-risk assumptions flagged
- ✅ All P0 gaps addressed

**Both Modes**:
- ✅ Acceptance criteria enhanced and testable
- ✅ Scope boundaries explicit
- ✅ Technical context provided
- ✅ Requirements specific and unambiguous

## Rules

**DO**:
- ✅ Ask specific questions with options
- ✅ Make reasonable inferences from patterns
- ✅ Document all assumptions explicitly
- ✅ Flag high-risk assumptions
- ✅ Enhance acceptance criteria to be testable
- ✅ Reference similar implementations

**DON'T**:
- ❌ Don't ask open-ended questions without guidance
- ❌ Don't make wild guesses without evidence
- ❌ Don't hide assumptions
- ❌ Don't skip validation flags for critical items
- ❌ Don't prescribe technical solutions (that's planning)
- ❌ Don't change task scope significantly

## Notes

- This prompt resolves ambiguities identified in clarity analysis
- Interactive mode requires user input (iterative)
- Auto mode proceeds autonomously with documented assumptions
- High-confidence inferences safe to proceed, low-confidence require validation
- Output feeds directly into testability validation stage
- Focus on WHAT (requirements), not HOW (implementation)

## REMINDER: Output Requirements

**Output ONLY the JSON object. No markdown, no code blocks, no explanatory text. Start directly with `{` and end with `}`.**

