---
id: onboard.refine-specifications
version: 1.0.0
category: onboard
experimental: true
name: Refine Specifications
description: Transform initial understanding into comprehensive specifications through structured questioning and synthesis
tags:
  - requirements-refinement
  - clarification
  - specification-synthesis
model_requirements:
  min_context: 128000
  recommended:
    - gpt-5-thinking-high
    - gpt-o1-high
agents:
  - product-manager
dependencies:
  requires:
    - context.use-modern-cli-tools
    - context.understand-intent
inputs:
  - name: user_intent
    description: Output from context.understand-intent
    type: object
    required: true
  - name: initial_scope
    description: Initial scope boundaries from context phase
    type: object
    required: true
  - name: initial_concept
    description: Original user input
    type: string
    required: true
  - name: domain
    description: Optional domain or industry context
    type: string
    required: false
  - name: stakeholders
    description: List of key stakeholders
    type: string
    required: false
outputs:
  - refined_specifications
  - clarity_score
  - ambiguities_resolved
  - open_questions
  - clarifying_questions
tokens:
  avg: 5000
  max: 10000
  min: 3000
---

# Refine Specifications

## Objective

Transform the initial understanding into a clear, comprehensive set of specifications through structured questioning and systematic synthesis.

## Context

You have confirmed the user's intent. Now, systematically eliminate ambiguity and structure the information into actionable specifications.

**Inputs Available**:
- **Initial Concept**: $initial_concept
- **User Intent**: $user_intent
- **Initial Scope**: $initial_scope
- **Domain**: $domain
- **Stakeholders**: $stakeholders

**Technical Defaults Reference**: `.ai/templates/standards/TECHNICAL_DEFAULTS.md`
Use these defaults to avoid unnecessary clarifications:
- Technology stack (pnpm, Vitest, Playwright, etc.)
- Naming conventions (kebab-case files, PascalCase classes, camelCase functions)
- Architecture patterns (layered backend, atomic design frontend)
- Testing requirements (80% coverage, unit + integration + E2E)
- Error handling (standard error responses, HTTP status codes)
- Security practices (JWT, Argon2 hashing, input validation)

**Only ask about technical choices if**:
1. Requirements explicitly contradict defaults
2. Multiple viable approaches with significant trade-offs
3. Novel/experimental technology needed
4. Legacy constraints prevent using defaults

## Process

### ⚠️ CRITICAL SIZE CONSTRAINT ⚠️

**The specification MUST be concise to fit within JSON output limits.**

**Target**: 2,000-2,500 words MAXIMUM (≈8,000-10,000 characters)  
**Absolute limit**: 3,000 words (≈12,000 characters)

**JSON encoding overhead**: The specification will be JSON-encoded (escaping quotes, newlines), which adds ~20-30% overhead. Keep raw specification under 10,000 characters.

**If specification approaches 2,500 words, you MUST**:
- Remove verbose examples
- Condense repetitive sections
- Focus on clarity over exhaustiveness
- Use bullet points instead of paragraphs where possible
- Prioritize essential information only

### Analysis & Synthesis

Analyze the provided `user_intent` and `initial_concept`. Your goal is to draft a **clear, actionable specification** with the available information.

**Prioritize brevity and clarity over exhaustive detail.**

Instead of asking the user questions iteratively, you must:
1.  **Infer reasonable details** where standard patterns apply (e.g., standard login flows, typical dashboard layouts).
2.  **Explicitly mark assumptions** in the "Assumptions" section of the specification.
3.  **Identify missing critical info** and list these as "Open Questions" in the JSON output, not as conversational text.

### Specification Drafting

Structure the information into the Markdown format below.

**Section Length Guidelines** (to stay within 2,500 word limit):
- Problem Statement: 50-75 words
- Target Users: 75-100 words (max 2 personas, 1 sentence each)
- Success Criteria: 75-100 words total (3-4 quantitative + 2-3 qualitative)
- Functional Requirements: 8-12 items MAX (P0/P1/P2 combined, 1 sentence each)
- Non-Functional Requirements: 100-150 words total (only top 3-4 categories)
- Constraints: 75-100 words (brief bullet points)
- Assumptions: 50-75 words (top 5-7 only)
- Open Questions: 5-7 questions MAX (1 sentence each)
- Risks: 3-5 risks MAX (brief descriptions)
- Out of Scope: 50-75 words (5-8 items, brief)
- Dependencies: 50-75 words (top 3-5 only)

```markdown
# Project Specification: [Project Name]

**Purpose**: [1-2 sentences]  
**Version**: 0.1.0  
**Author**: Product Manager  
**Created Date**: [YYYY-MM-DD]  
**Last Updated Date**: [YYYY-MM-DD]  
**Status**: 🚧 DRAFT

---

## Overview

[2-3 sentences maximum - high-level summary of the project]

---

## Problem Statement

[3-4 sentences: What problem are we solving and why does it matter? Be concise.]

---

## Target Users

- **Primary**: [1-2 sentence description with key characteristics]
- **Secondary**: [1 sentence if applicable]
- **Personas** (MAX 2):
  - **[Name]**: [1 sentence describing role and key need]
  - **[Name]**: [1 sentence describing role and key need]

---

## Success Criteria

### Quantitative
- [Metric 1]: [Target value]
- [Metric 2]: [Target value]

### Qualitative
- [Outcome 1]
- [Outcome 2]

### Minimum Viable Outcome
[What is the absolute minimum that constitutes success?]

---

## Functional Requirements

**IMPORTANT**: Limit to 10-15 total requirements across all priorities. Focus on most critical items only.

### Must Have (P0) - 5-8 items maximum
- [ ] [Requirement 1 - clear, testable, 1 sentence]
- [ ] [Requirement 2 - clear, testable, 1 sentence]

### Should Have (P1) - 3-5 items maximum
- [ ] [Requirement 3 - clear, testable, 1 sentence]

### Nice to Have (P2) - 2-3 items maximum
- [ ] [Requirement 4 - clear, testable, 1 sentence]

---

## Non-Functional Requirements

**Keep brief** - 1-2 sentences per category, only essential categories:
- **Performance**: [Key metrics only - latency, throughput]
- **Security**: [Top 2-3 requirements]
- **Scalability**: [Key targets only]
- **Reliability**: [Uptime target]

---

## Constraints

- **Technical**: [Technology stack, existing systems, APIs]
- **Business**: [Budget, resources, organizational]
- **Time**: [Deadlines, milestones]
- **Legal/Regulatory**: [Compliance requirements]

---

## Out of Scope

- [Explicitly excluded item 1]
- [Explicitly excluded item 2]
- [Explicitly excluded item 3]

---

## Assumptions

- [Assumption 1 - mark confidence level]
- [Assumption 2 - mark confidence level]

---

## Open Questions

**Maximum 5-10 questions** - only critical blockers:
- [ ] [Question 1 - who needs to answer, why it's blocking]
- [ ] [Question 2 - who needs to answer, why it's blocking]

---

## Dependencies

### External
- [External system or team dependency 1]

### Internal
- [Internal dependency 1]

---

## Risks

**Maximum 3-5 risks** - highest priority only:

| Risk                     | Likelihood | Impact  | Mitigation         |
| ------------------------ | ---------- | ------- | ------------------ |
| [Brief risk description] | 🟢/🟠/🔴      | 🟢/🟡/🟠/🔴 | [Brief mitigation] |

```

## Iterative Refinement

If clarity is still insufficient after synthesis:

1. **Identify gaps** in the specification
2. **Formulate 2-5 targeted clarifying questions** to fill the largest gaps
3. **Include these as `clarifying_questions`** in the output (the user will be prompted interactively)
4. **Update the specification** with new information once answers are received
5. **Recalculate clarity score**
6. **Repeat until ≥90% clarity**

### When to Include Clarifying Questions

Include `clarifying_questions` in the output when:
- Clarity score is below 90%
- Critical decisions cannot be inferred from context
- Multiple valid approaches exist and user preference matters
- Open questions in the spec are blocking progress

**Question Priority Guidelines**:
- **P0 (Critical)**: Blocks core functionality definition - MUST be answered
- **P1 (Important)**: Affects significant features or architecture - SHOULD be answered
- **P2 (Minor)**: Nice-to-have clarifications - CAN be skipped

## Output Format

**🚨 CRITICAL SIZE REQUIREMENTS 🚨**

1. **Specification length**: 2,000-2,500 words MAXIMUM (absolute limit: 3,000 words)
2. **Character count**: Aim for 8,000-10,000 characters (absolute limit: 12,000 characters)
3. **JSON encoding overhead**: Factor in 20-30% overhead for JSON escaping
4. **JSON structure**: Must be well-formed, complete, and properly closed

**Before generating output, estimate the size**:
- Count specification length before wrapping in JSON
- If specification will exceed 2,500 words → Remove verbose sections
- If specification will exceed 3,000 words → STOP and drastically condense
- Focus on **essential information only**
- Every section should be as brief as possible while remaining clear

**CRITICAL**: Return ONLY a well-formed, complete JSON object. Ensure the JSON is valid and properly closed.

```json
{
  "refined_specifications": "Full markdown specification generated above",
  "clarity_score": 0.85,
  "ambiguities_resolved": [
    "Clarified user authentication approach",
    "Defined success metrics for user engagement"
  ],
  "open_questions": [
    {
      "question": "Should we support OAuth providers?",
      "criticality": "Medium",
      "blocks": ["FR-001: User Authentication"]
    }
  ],
  "clarifying_questions": [
    {
      "id": "q1",
      "question": "Should dependencies be auto-detected or manually defined?",
      "options": [
        "Auto-detected from task descriptions",
        "Manually defined by stakeholders",
        "Hybrid approach (auto-detect with manual override)"
      ],
      "priority": "P0",
      "context": "Critical for feature priority planning and affects FR-002"
    },
    {
      "id": "q2",
      "question": "What authentication method should be used?",
      "options": [
        "OAuth 2.0 (Google, GitHub)",
        "Username/Password with MFA",
        "SSO integration only",
        "API key based"
      ],
      "priority": "P1",
      "context": "Affects security requirements and user onboarding flow"
    }
  ],
  "confidence_level": "High",
  "ready_for_prd": false,
  "next_steps": "Address 2 open questions before proceeding to PRD"
}
```

**Interactive Questions Format**:
When clarity score is below 90%, include `clarifying_questions` to prompt the user for input. Each question must have:
- `id`: Unique identifier (e.g., "q1", "q2")
- `question`: Clear question text
- `options`: Array of 2-4 predefined answer choices (user can also provide custom input)
- `priority`: "P0" (Critical), "P1" (Important), or "P2" (Minor)
- `context`: Optional explanation of why this question matters

**Quality Checklist Before Outputting**:
- ✅ **SIZE CHECK**: Specification is 2,000-2,500 words (8,000-10,000 characters)
- ✅ **SIZE LIMIT**: Specification does NOT exceed 3,000 words (12,000 characters)
- ✅ **CRITICAL**: With JSON encoding, total output must be under 8,000 tokens (~25,000 chars after encoding)
- ✅ JSON object has opening brace `{`
- ✅ All strings are properly quoted and escaped
- ✅ All required fields are present: `refined_specifications`, `clarity_score`
- ✅ JSON object has closing brace `}`
- ✅ No trailing commas in arrays or objects
- ✅ Every section is concise and focused on essentials

## Success Criteria

- ✅ All P0 requirements are clearly defined and testable
- ✅ Success criteria are measurable
- ✅ Constraints and out-of-scope items are explicit
- ✅ Open questions are identified with owners
- ✅ Clarity score ≥ 70% (90% preferred)

## Rules

**DO**:

- ✅ Be Socratic - ask questions that make users think deeply
- ✅ Be specific - use examples to clarify abstract concepts
- ✅ Be collaborative - "we're defining this together"
- ✅ Be pragmatic - balance idealism with realistic constraints
- ✅ Be patient - iterate until clarity is achieved

**DON'T**:

- ❌ Don't assume - if unclear, ask
- ❌ Don't prescribe solutions - focus on WHAT and WHY, not HOW
- ❌ Don't overwhelm - ask questions in digestible batches (3-5)
- ❌ Don't guess - mark assumptions explicitly
- ❌ Don't rush - better to spend time here than fix misalignment later

## Examples

### Example Clarification Flow

**Initial Understanding**: "Build a task management app"

**Clarification Round 1**:

1. Who will use this - individuals or teams?
2. What's the primary pain point with existing solutions?
3. What's the most critical feature you need on day 1?

**User Response**: "Teams of 10-50 people. Current tools don't show who's blocked. Critical feature: dependency visualization."

**Clarification Round 2**:

1. Should dependencies be auto-detected or manually defined?
2. What happens when a blocking task is delayed?
3. Do you need Slack/Teams integration for notifications?

[Continue until ≥90% clarity]

### Example Refined Output (Excerpt)

```markdown
# Project Specification: Task Dependency Manager

## Problem Statement
Remote teams of 10-50 people struggle to visualize task dependencies, 
leading to blocked work that goes unnoticed until standups. This causes 
30% of sprint commitments to miss deadlines.

## Success Criteria
### Quantitative
- Reduce unnoticed blockers by 80% (from 30% to 6% of tasks)
- Increase on-time sprint completion from 70% to 90%

### Qualitative
- Team leads can identify bottlenecks within 30 seconds
- Engineers proactively unblock each other without prompting

## Must Have (P0)
- [ ] Visual dependency graph (directed acyclic graph)
- [ ] Real-time status updates when blocking task changes
- [ ] Slack integration for blocker notifications
```
