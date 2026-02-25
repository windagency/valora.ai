---
id: review.validate-completeness
version: 3.0.0
category: review
experimental: true
name: Validate Completeness
description: Generic validation for specifications, PRDs, and implementation plans
tags:
  - validation
  - quality-assurance
  - completeness-check
model_requirements:
  min_context: 128000
  recommended:
    - gpt-5-thinking-high
    - gpt-o1-high
agents:
  - product-manager
  - lead
dependencies:
  requires:
    - context.use-modern-cli-tools
inputs:
  - name: document
    description: The document to validate (specifications, PRD, or plan structure)
    type: string|object
    required: true
  - name: document_type
    description: Type of document being validated
    type: string
    required: true
    validation:
      enum: ["specifications", "prd", "plan"]
  - name: plan_structure
    description: Parsed plan structure (only for document_type=plan)
    type: object
    required: false
  - name: task_requirements
    description: Task requirements (only for document_type=plan)
    type: object
    required: false
  - name: clarity_score
    description: Optional initial clarity score from previous stage
    type: number
    required: false
    validation:
      min: 0
      max: 1
outputs:
  - validation_results
  - missing_elements
  - completeness_score
  - ready_for_next_stage
tokens:
  avg: 3000
  max: 6000
  min: 1500
---

# Validate Completeness

## Objective

Validate that documents are complete, consistent, and actionable before proceeding to the next stage.

**For specifications**: Ensure readiness for PRD generation  
**For PRDs**: Ensure readiness for backlog decomposition  
**For plans**: Ensure readiness for implementation

## Context

You have a requirements document (specification or PRD). Validate its quality against objective criteria and determine if it's ready for the next phase.

## Tools and Data Access

### Available Tools

**Use these tools to gather information:**

1. **read_file** - Read document files:
   - Target document to validate
   - Previous plan versions (if path provided in inputs)
   - `.ai/commands/*.md` - Command definitions
   - `.ai/agents/*.md` - Agent definitions

2. **query_session** - Access session data safely:
   - `action: "get", session_id: "<id>"` - Get session execution details
   - `action: "search", query: "<search-term>"` - Find previous plans or commands
   - `action: "list"` - List recent sessions

3. **glob_file_search** / **codebase_search** - Find files:
   - Search for previous plan versions
   - Find related documents

**IMPORTANT - DO NOT use:**
- `read_file` on `.ai/sessions/` - use `query_session` instead
- Direct access to session files - always use the `query_session` tool

### Accessing Previous Plans

If you need to compare with previous plan versions:

1. **If `previous_plan_version` input is provided**: Use `read_file` with the provided path
2. **If searching for previous plans**: Use `glob_file_search` to find files matching the pattern (e.g., `**/*PLAN*.md`)
3. **If accessing session data**: Use `query_session` with `action: "search"` to find previous executions

**Never attempt to read `.ai/sessions/` directly** - this directory contains large session data files that should only be accessed via the `query_session` tool.

## Validation Process

### Step 1: Determine Validation Criteria

Based on `document_type`, use appropriate validation criteria:

**For "specifications"**:

- 6 core dimensions (Clarity, Completeness, Consistency, Feasibility, Measurability, Prioritization)
- Goal: Ready for PRD generation
- Threshold: ≥90% for proceed

**For "prd"**:

- 12 dimensions (Executive Summary, Success Metrics, User Stories, Acceptance Criteria, Dependencies, Risks, Technical Scope, NFRs, Out of Scope, Diagrams, Consistency, Completeness)
- Goal: Ready for backlog decomposition
- Threshold: ≥95% for proceed

**For "plan"**:

- 8 required sections (Task Overview, Complexity Assessment, Dependencies, Risk Assessment, Implementation Steps, Testing Strategy, Rollback Strategy, Effort Estimate)
- Goal: Ready for implementation
- Threshold: ≥90% for proceed (≥80% for simple tasks with complexity < 4)

---

### Step 2: Apply Validation Checklist

#### For Specifications (document_type = "specifications")

Evaluate against these 6 criteria:

#### 1. Clarity

**Question**: Can someone unfamiliar with the project understand this?

**Check**:

- [ ] Problem statement is self-contained (no assumed context)
- [ ] Target users are described with sufficient detail
- [ ] Success criteria are unambiguous
- [ ] Requirements avoid jargon or define technical terms

**Score**: Pass = 1, Fail = 0

---

#### 2. Completeness

**Question**: Are all critical dimensions covered?

**Check**:

- [ ] Problem statement exists and is specific
- [ ] Target users are identified
- [ ] Success criteria (quantitative + qualitative) are defined
- [ ] At least 3 P0 (must-have) requirements are listed
- [ ] Non-functional requirements (performance, security, accessibility) are addressed
- [ ] Constraints are documented
- [ ] Out-of-scope items are explicitly listed

**Score**: (Checked items / 7) = X

---

#### 3. Consistency

**Question**: Do requirements contradict each other?

**Check**:

- [ ] No conflicting requirements (e.g., "fast response" vs. "complex calculations")
- [ ] Scope boundaries are consistent (no in-scope item listed as out-of-scope)
- [ ] Success metrics align with problem statement
- [ ] Constraints don't make requirements impossible

**Score**: Pass = 1, Fail = 0 (if ANY contradiction exists)

---

#### 4. Feasibility

**Question**: Are requirements realistic given constraints?

**Check**:

- [ ] Requirements don't obviously violate technical constraints
- [ ] Timeline expectations align with scope (if mentioned)
- [ ] Budget constraints align with requirements (if mentioned)
- [ ] No "impossible" requirements (e.g., "100% accuracy" for ML, "zero latency")

**Score**: Pass = 1, Fail = 0.5 (if concerns exist)

---

#### 5. Measurability

**Question**: Can success be objectively assessed?

**Check**:

- [ ] At least 2 quantitative metrics are defined
- [ ] Metrics have target values or ranges
- [ ] Qualitative outcomes are observable (not abstract like "better UX")
- [ ] Acceptance criteria for P0 requirements are testable

**Score**: (Checked items / 4) = Y

---

#### 6. Prioritization

**Question**: Is there clear priority ranking?

**Check**:

- [ ] Requirements are categorized (P0, P1, P2 or Must/Should/Nice)
- [ ] At least 3 requirements are marked as P0
- [ ] P0 list is realistic (not everything is P0)
- [ ] Dependencies between requirements are noted

**Score**: (Checked items / 4) = Z

---

#### For PRDs (document_type = "prd")

Evaluate against these 12 criteria:

1. **Executive Summary** (0-10 points): Clear problem, solution, users, metrics, timeline
2. **Success Metrics** (0-10 points): ≥3 quantitative metrics with baselines and targets
3. **User Stories** (0-20 points): All P0 requirements have stories in "As a... I want... So that..." format
4. **Acceptance Criteria** (0-15 points): All P0 stories have testable criteria (Given-When-Then)
5. **Dependencies** (0-10 points): All external/internal dependencies listed with criticality
6. **Risks** (0-10 points): ≥3 risks with impact, likelihood, and mitigation
7. **Technical Scope** (0-10 points): Architecture, tech stack, APIs, data models documented
8. **Non-Functional Requirements** (0-10 points): Specific targets for performance, security, scalability
9. **Out of Scope** (0-5 points): Explicitly listed to prevent scope creep
10. **Diagrams** (0-5 points): Architecture and relevant diagrams present
11. **Consistency** (0-5 points): No contradictions, consistent terminology
12. **Completeness** (0-5 points): All sections filled, no TODO/TBD placeholders

**Total**: 105 points max

---

#### For Plans (document_type = "plan")

Evaluate against these 8 required sections (each weighted):

1. **Task Overview** (20% weight)
   - [ ] Task description is clear and self-contained
   - [ ] Scope boundaries explicitly defined (in-scope/out-of-scope)
   - [ ] Success criteria are quantifiable
   - [ ] Acceptance criteria are testable
   - **Quality**: Substantive (not placeholder), Specific (not generic), Detailed (actionable)

2. **Complexity Assessment** (10% weight)
   - [ ] Complexity score with numerical value (0-10)
   - [ ] 3+ contributing factors identified
   - [ ] Implementation mode specified (standard/incremental)
   - [ ] Rationale for complexity rating provided

3. **Dependencies** (10% weight)
   - [ ] Technical dependencies listed (libraries, frameworks, versions)
   - [ ] Data dependencies noted (schema, migrations)
   - [ ] External service dependencies identified
   - [ ] Each dependency has availability/version info

4. **Risk Assessment** (15% weight)
   - [ ] At least 3 risks identified
   - [ ] Each risk has severity (low/medium/high/critical)
   - [ ] Each risk has mitigation strategy
   - [ ] High-severity risks have detailed mitigations

5. **Implementation Steps** (25% weight)
   - [ ] At least 3 steps defined
   - [ ] Steps are sequential and numbered
   - [ ] Each step specifies affected files
   - [ ] Each step has validation criteria
   - [ ] Steps are atomic (one clear action each)

6. **Testing Strategy** (10% weight)
   - [ ] At least 2 test types planned (unit/integration/e2e)
   - [ ] Test scenarios for happy path
   - [ ] Test scenarios for error cases
   - [ ] Coverage target specified

7. **Rollback Strategy** (5% weight)
   - [ ] Rollback steps defined
   - [ ] Data recovery addressed
   - [ ] Rollback triggers specified

8. **Effort Estimate** (5% weight)
   - [ ] Time range provided
   - [ ] Confidence level stated
   - [ ] Key assumptions listed

**Scoring per section**:
- All criteria met + high quality: 1.0
- Most criteria met: 0.7-0.9
- Some criteria met: 0.4-0.6
- Minimal or placeholder: 0.0-0.3
- Missing: 0.0

**Deductions**:
- Missing section: -2.0 points per section
- Present but inadequate: -1.0 point per section
- Generic/boilerplate content: -0.5 point per section

---

### Step 3: Calculate Completeness Score

#### For Specifications

```plaintext
Completeness Score = (
  (Clarity × 20%) +
  (Completeness × 25%) +
  (Consistency × 20%) +
  (Feasibility × 15%) +
  (Measurability × 10%) +
  (Prioritization × 10%)
) × 100%
```

**Interpretation**:

- **≥ 90%**: Ready for PRD generation
- **70-89%**: Needs minor clarification
- **< 70%**: Needs major refinement

#### For PRDs

```plaintext
Completeness Score = (Total Points / 105) × 100%
```

**Interpretation**:

- **≥ 95%**: Ready for backlog decomposition
- **85-94%**: Minor gaps, can proceed with warnings
- **< 85%**: Needs refinement

#### For Plans

```plaintext
For each section:
  section_score = presence_score × quality_score × weight

Completeness Score = sum(section_scores) × 10

Result: 0.0 - 10.0
```

**Interpretation**:
- **9.0-10.0**: Excellent - All sections present and detailed
- **7.5-8.9**: Good - Minor gaps or improvements needed
- **6.0-7.4**: Acceptable - Several sections need work
- **4.0-5.9**: Needs Work - Significant gaps identified
- **0.0-3.9**: Inadequate - Major revision required

**Threshold**:
- Standard: ≥7.0 (ready for implementation)
- Simple tasks (complexity < 4): ≥6.0 (can proceed with caution)
- Strict mode: ≥8.0

---

### Step 4: Identify Gaps

For any criteria that scored below threshold, identify **specific** missing elements:

**Example for Specifications**:

- ❌ **Completeness**: Missing non-functional requirements for accessibility
- ❌ **Measurability**: Success metrics lack target values
- ⚠️ **Feasibility**: "Real-time sync across 10,000 users" may conflict with "low budget" constraint

**Example for PRDs**:

- ❌ **Success Metrics**: Missing baseline for 2 metrics
- ❌ **Acceptance Criteria**: 3 user stories missing error scenarios
- ⚠️ **Technical Scope**: Data model needs more detail

**Example for Plans**:

- ❌ **Rollback Strategy**: Section missing entirely
- ❌ **Implementation Steps**: Steps 2, 5, and 7 lack file references
- ⚠️ **Risk Assessment**: Only 1 risk identified, needs at least 3

---

### Step 5: Decision Point

Based on document type and score, populate the `status`, `recommendation`, and `missing_elements` fields in the JSON output.

#### For Specifications (≥ 90%)

**Status**: "ready_for_next_stage"
**Recommendation**: "Proceed to /create-prd"

#### For Specifications (70-89%)

**Status**: "needs_clarification"
**Recommendation**: "Needs minor refinement. Please address gaps: [list gaps]"

#### For Specifications (<70%)

**Status**: "needs_refinement"
**Recommendation**: "Significant refinement required. Revisit specifications."

---

#### For PRDs (≥ 95%)

**Status**: ✅ **Ready for Backlog**  
**Action**: Proceed to `/create-backlog`

**Message**:

```plaintext
✅ PRD is production-ready and comprehensive.

**Completeness Score**: [XX]%

All quality checks passed. Ready for backlog decomposition.
```

#### For PRDs (85-94%)

**Status**: ⚠️ **Minor Gaps**  
**Action**: Can proceed or address gaps

**Message**:

```plaintext
⚠️ PRD is mostly complete with minor gaps.

**Completeness Score**: [XX]%

**Gaps**: [List specific gaps]

You may proceed to backlog or address gaps first.
```

#### For PRDs (<85%)

**Status**: 🔴 **Insufficient**  
**Action**: Needs refinement

**Message**:

```plaintext
🔴 PRD needs additional refinement.

**Completeness Score**: [XX]%

**Critical Gaps**: [List]

Recommendation: Address gaps before backlog creation.
Consider re-running /refine-specs if fundamental requirements unclear.
```

---

#### For Plans (≥7.5)

**Status**: ✅ **Ready for Implementation**  
**Action**: Proceed to implementation

**Message**:

```plaintext
✅ Plan is complete and ready for implementation.

**Completeness Score**: [X.X/10.0]

All required sections present and substantive. Ready to proceed.
```

#### For Plans (6.0-7.4)

**Status**: ⚠️ **Acceptable with Gaps**  
**Action**: Proceed with caution or address gaps

**Message**:

```plaintext
⚠️ Plan has some gaps but may be acceptable.

**Completeness Score**: [X.X/10.0]

**Gaps**: [List specific gaps]

Consider addressing gaps before implementation, especially for complex tasks.
```

#### For Plans (<6.0)

**Status**: 🔴 **Needs Work**  
**Action**: Revise plan before implementation

**Message**:

```plaintext
🔴 Plan needs significant revision.

**Completeness Score**: [X.X/10.0]

**Critical Gaps**: [List]

Recommendation: Address critical gaps before proceeding to implementation.
Return to /plan command with feedback incorporated.
```

---

### Step 6: Handoff Preparation

If validation passes:

**For Specifications**:

1. Save to `knowledge-base/SPECS-[YYYYMMDD-HHMMSS].md`
2. Generate summary (3-5 key takeaways)
3. Flag ambiguities for PRD phase
4. Confirm: "Ready to proceed to `/create-prd`?"

**For PRDs**:

1. Confirm saved to `knowledge-base/PRD.md`
2. Generate statistics (requirements count, complexity)
3. Flag open questions for backlog phase
4. Confirm: "Ready to proceed to `/create-backlog`?"

**For Plans**:

1. Validation complete (plan already loaded from input)
2. Return completeness score and gaps
3. Flag sections needing improvement
4. Pass to next review stage or synthesis (part of review pipeline)

---

## Output Format

**CRITICAL: Your response MUST be ONLY valid JSON. No markdown wrapping, no explanations, no prose. Just the JSON object below.**

**For Specifications**:

```json
{
  "document_type": "specifications",
  "validation_results": {
    "clarity": {"score": 1.0, "status": "pass", "issues": []},
    "completeness": {"score": 0.86, "status": "pass", "issues": ["Missing accessibility NFRs"]},
    "consistency": {"score": 1.0, "status": "pass", "issues": []},
    "feasibility": {"score": 1.0, "status": "pass", "issues": []},
    "measurability": {"score": 0.75, "status": "warning", "issues": ["Success metrics lack target values"]},
    "prioritization": {"score": 1.0, "status": "pass", "issues": []}
  },
  "completeness_score": 0.92,
  "status": "ready_for_next_stage",
  "missing_elements": [
    {"category": "Non-Functional Requirements", "item": "Accessibility standards", "criticality": "medium"}
  ],
  "ready_for_next_stage": true,
  "next_stage": "create-prd",
  "recommendation": "Proceed to create-prd. Optional: add accessibility NFRs.",
  "saved_to": "knowledge-base/SPECS-20251113-143022.md"
}
```

**For PRDs**:

```json
{
  "document_type": "prd",
  "validation_results": {
    "executive_summary": {"score": 10, "max": 10, "status": "pass", "issues": []},
    "success_metrics": {"score": 8, "max": 10, "status": "pass", "issues": ["Missing baseline for 1 metric"]},
    "user_stories": {"score": 20, "max": 20, "status": "pass", "issues": []},
    "acceptance_criteria": {"score": 13, "max": 15, "status": "pass", "issues": ["2 stories missing error scenarios"]},
    "dependencies": {"score": 10, "max": 10, "status": "pass", "issues": []},
    "risks": {"score": 8, "max": 10, "status": "pass", "issues": ["1 risk missing mitigation"]},
    "technical_scope": {"score": 9, "max": 10, "status": "pass", "issues": []},
    "nfr": {"score": 8, "max": 10, "status": "pass", "issues": ["Accessibility standards not specified"]},
    "out_of_scope": {"score": 5, "max": 5, "status": "pass", "issues": []},
    "diagrams": {"score": 5, "max": 5, "status": "pass", "issues": []},
    "consistency": {"score": 5, "max": 5, "status": "pass", "issues": []},
    "completeness": {"score": 5, "max": 5, "status": "pass", "issues": []}
  },
  "completeness_score": 0.96,
  "status": "ready_for_next_stage",
  "missing_elements": [
    {"category": "Success Metrics", "item": "Baseline for metric 2", "criticality": "low"},
    {"category": "Acceptance Criteria", "item": "Error scenarios for 2 stories", "criticality": "medium"}
  ],
  "ready_for_next_stage": true,
  "next_stage": "create-backlog",
  "recommendation": "PRD is production-ready. Minor improvements suggested.",
  "saved_to": "knowledge-base/PRD.md"
}
```

**For Plans**:

```json
{
  "document_type": "plan",
  "validation_results": {
    "task_overview": {"score": 0.9, "weight": 0.20, "status": "good", "issues": []},
    "complexity_assessment": {"score": 1.0, "weight": 0.10, "status": "good", "issues": []},
    "dependencies": {"score": 0.8, "weight": 0.10, "status": "good", "issues": ["Version not specified for zod"]},
    "risk_assessment": {"score": 0.6, "weight": 0.15, "status": "acceptable", "issues": ["Only 1 risk identified, needs 3+"]},
    "implementation_steps": {"score": 0.7, "weight": 0.25, "status": "acceptable", "issues": ["Steps 2, 5, 7 lack file references"]},
    "testing_strategy": {"score": 0.8, "weight": 0.10, "status": "good", "issues": []},
    "rollback_strategy": {"score": 0.0, "weight": 0.05, "status": "missing", "issues": ["Section missing"]},
    "effort_estimate": {"score": 1.0, "weight": 0.05, "status": "good", "issues": []}
  },
  "completeness_score": 7.4,
  "status": "acceptable",
  "missing_sections": [
    "Rollback Strategy"
  ],
  "gaps_identified": [
    {"section": "Risk Assessment", "issue": "Only 1 risk identified, needs at least 3", "criticality": "high"},
    {"section": "Implementation Steps", "issue": "3 steps lack file references", "criticality": "medium"},
    {"section": "Rollback Strategy", "issue": "Section missing entirely", "criticality": "critical"}
  ],
  "ready_for_next_stage": false,
  "next_stage": "continue-review",
  "recommendation": "Address critical gap (Rollback Strategy) and improve risk coverage before implementation."
}
```

---

## Success Criteria

**For Specifications**:

- ✅ All 6 dimensions evaluated
- ✅ Completeness score calculated objectively
- ✅ Missing elements specifically identified
- ✅ Decision is actionable (proceed/clarify/refine)
- ✅ If score ≥90%, saved to knowledge-base

**For PRDs**:

- ✅ All 12 dimensions evaluated
- ✅ Completeness score calculated objectively
- ✅ Missing elements specifically identified
- ✅ Decision is actionable (proceed/warn/refine)
- ✅ If score ≥95%, ready for backlog

**For Plans**:

- ✅ All 8 required sections evaluated
- ✅ Completeness score calculated objectively (0-10)
- ✅ Missing/inadequate sections specifically identified
- ✅ Gaps prioritized by criticality
- ✅ If score ≥7.0, ready for implementation review

---

## Rules

**DO**:

- ✅ Be objective - use the checklist, not intuition
- ✅ Be specific - "Missing accessibility NFRs" not "incomplete NFRs"
- ✅ Be constructive - explain how to close gaps
- ✅ Be decisive - give clear proceed/clarify/refine recommendation

**DON'T**:

- ❌ Don't be lenient - if a criterion fails, mark it as failed
- ❌ Don't skip criteria - evaluate all 6 dimensions
- ❌ Don't guess - if information is absent, it's a gap
- ❌ Don't approve with <90% - quality gates exist for a reason

---

## Edge Cases

### Scenario: User pushes back on low score

**Response**: "I understand the urgency, but proceeding with [XX]% clarity often leads to rework later. Addressing [specific gaps] now will save [estimated time/effort]. Can we spend 10 minutes clarifying [specific items]?"

### Scenario: Specification is over-detailed

**Response**: "This is very thorough! For the PRD phase, we can simplify [specific sections] while preserving the key requirements. Shall I proceed?"

### Scenario: Some sections are N/A

**Response**: If a section is genuinely not applicable (e.g., "budget constraints" for an internal tool), mark it as "N/A (not applicable)" rather than penalizing the score. Adjust scoring weights accordingly.

### Scenario: Validating different document types

**Specifications vs. PRDs**:

- Specifications: Lighter validation (6 dimensions), focused on clarity for PRD generation
- PRDs: Heavier validation (12 dimensions), focused on actionability for backlog
- Scoring thresholds differ: 90% vs. 95%
- Always check `document_type` parameter to apply correct criteria

---

## Examples

### Example 1: High Score (94%)

```plaintext
✅ **Validation Passed**

**Final Clarity Score**: 94%

**Breakdown**:
- Clarity: ✅ 100%
- Completeness: ✅ 100%
- Consistency: ✅ 100%
- Feasibility: ✅ 100%
- Measurability: ⚠️ 75% (target values missing for 1 metric)
- Prioritization: ✅ 100%

**Status**: Ready for PRD generation

**Optional Improvement**: Add target value for "user satisfaction" metric (currently qualitative only).

**Next Step**: Proceeding to save specification and prepare for `/create-prd`.
```

---

### Example 2: Moderate Score (78%) - Specifications

```plaintext
⚠️ **Needs Minor Clarification**

**Completeness Score**: 78%
**Document Type**: Specifications

**Breakdown**:
- Clarity: ✅ 100%
- Completeness: ⚠️ 71% (missing accessibility and scalability NFRs)
- Consistency: ✅ 100%
- Feasibility: ⚠️ 50% (concern: "real-time sync" may conflict with "low budget")
- Measurability: ⚠️ 75%
- Prioritization: ✅ 100%

**Questions to Address**:
1. What accessibility standards should we target (e.g., WCAG 2.1 Level AA)?
2. For "real-time sync," what latency is acceptable given budget constraints (e.g., <2s vs <100ms)?
3. What's the expected user load for scalability planning (10s, 100s, or 1000s of concurrent users)?

Once answered, we'll be ready for PRD generation.
```

---

### Example 3: High Score (96%) - PRD

```plaintext
✅ **Validation Passed**

**Completeness Score**: 96%
**Document Type**: PRD

**Breakdown**:
- Executive Summary: ✅ 10/10
- Success Metrics: ⚠️ 8/10 (missing baseline for 1 metric)
- User Stories: ✅ 20/20
- Acceptance Criteria: ✅ 15/15
- Dependencies: ✅ 10/10
- Risks: ⚠️ 8/10 (1 risk missing mitigation strategy)
- Technical Scope: ✅ 10/10
- NFRs: ✅ 10/10
- Out of Scope: ✅ 5/5
- Diagrams: ✅ 5/5
- Consistency: ✅ 5/5
- Completeness: ✅ 5/5

**Status**: Ready for backlog decomposition

**Optional Improvements**:
- Add baseline for "user satisfaction" metric
- Define mitigation for "third-party API outage" risk

**Next Step**: Proceeding to `/create-backlog`.
```
