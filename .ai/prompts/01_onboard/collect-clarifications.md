---
id: onboard.collect-clarifications
version: 1.0.0
category: onboard
experimental: true
name: Collect User Clarifications
description: Present clarifying questions to the user and collect answers for specification refinement
tags:
  - interactive
  - user-input
  - clarification
  - specification-refinement
model_requirements:
  min_context: 32000
  recommended:
    - claude-sonnet-4.5
    - claude-haiku-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.use-modern-cli-tools
    - onboard.refine-specifications
inputs:
  - name: clarifying_questions
    description: Array of questions from onboard.refine-specifications
    type: array
    required: true
  - name: refined_specifications
    description: Current specification document
    type: string
    required: true
  - name: clarity_score
    description: Current clarity score (0-1)
    type: number
    required: true
  - name: collected_user_answers
    description: Pre-collected user answers from the CLI interactive handler (Record<questionId, answer>)
    type: object
    required: false
  - name: collected_summary
    description: Pre-generated summary of user answers
    type: string
    required: false
outputs:
  - answers
  - summary
  - questions_answered
  - questions_skipped
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Collect User Clarifications

## Objective

Format user answers to clarifying questions for incorporation into the final specification document.

**IMPORTANT**: In the current workflow, user answers are collected by the CLI's interactive question handler BEFORE this prompt executes. Your job is to format the already-collected answers into the expected JSON output structure.

## Instructions

### Step 0: Check for Pre-Collected Answers

**CRITICAL**: Check if `collected_user_answers` input is provided.

If `collected_user_answers` is provided (normal flow):
1. The user has already answered questions via the CLI interactive handler
2. Skip Steps 1-5 (question presentation)
3. Use the provided `collected_user_answers` and `collected_summary` inputs
4. Format them into the expected JSON output structure (see Output Format section)
5. Map each answer from `collected_user_answers` to the corresponding question in `clarifying_questions`
6. Calculate `questions_answered` and `questions_skipped` counts

If `collected_user_answers` is NOT provided (legacy mode):
- Follow Steps 1-5 below for interactive question collection
- This path is deprecated and should not normally execute

## Instructions

### Step 1: Display Current Status

Show the user the current specification status:

```plaintext
## Specification Refinement

**Current Clarity Score**: [XX]%
**Target Score**: 90%
**Questions to Address**: [N]

The following questions will help clarify the specification.
You can answer, skip, or provide custom responses.
```

### Step 2: Present Questions by Priority

Present questions grouped by priority (P0 first, then P1, then P2):

```plaintext
### Critical Questions (P0) - Must answer

**Q1**: [Question text]
Context: [Why this matters]

Options:
  [1] [Option 1]
  [2] [Option 2]
  [3] [Option 3]
  [C] Custom answer
  [S] Skip this question

> Your choice: _
```

### Step 3: Collect User Responses

For each question, record:
- The question ID
- The original question text
- The user's answer (selected option or custom text)
- Whether it was a custom answer
- Whether the question was skipped

**If user selects numbered option**:
- Record the selected option text as the answer
- Set `was_custom: false`

**If user selects [C] Custom**:
- Prompt: "Please provide your answer:"
- Record custom text as the answer
- Set `was_custom: true`

**If user selects [S] Skip**:
- Record `answer: null`
- Set `skipped: true`
- Continue to next question

### Step 4: Handle Question Flow

After each answer, show progress:

```plaintext
Question 1 of 5 answered

Progress: [##--------] 20%
Estimated clarity improvement: +5%

Continue to next question? [Y/n]
```

### Step 5: Allow Review Before Finalising

After all questions, show summary:

```plaintext
## Summary of Your Answers

| # | Question | Your Answer |
|---|----------|-------------|
| 1 | [Question 1] | [Answer 1] |
| 2 | [Question 2] | [Answer 2] |
| 3 | [Question 3] | (Skipped) |

**Answered**: 2 of 3
**Skipped**: 1 of 3

[C] Confirm and apply answers
[E] Edit an answer
[X] Cancel refinement

> Your choice: _
```

### Step 6: Generate Answer Summary

Create a human-readable summary of all answers for the specification document:

```markdown
## User Clarifications

The following decisions were made during specification refinement:

### Cache TTL Configuration
**Question**: What should be the optimal cache TTL for health check results?
**Decision**: 5 seconds
**Rationale**: Provides fresher data with acceptable load on target services.

### Self-Health Logic
**Question**: When should the aggregator report itself as unhealthy?
**Decision**: Any critical service unhealthy
**Rationale**: Conservative approach that reflects critical service health directly.

---
*Collected on: [ISO timestamp]*
*Mode: Interactive*
```

## Output Format

**CRITICAL**: Return ONLY valid JSON. No markdown, no code blocks.

**When `collected_user_answers` is provided** (normal flow):

Transform the collected answers into the full structured format:

1. For each question in `clarifying_questions`:
   - Check if `collected_user_answers[question.id]` exists
   - If yes, create an entry in the `answers` object
   - If no, mark as skipped

2. Use the `collected_summary` as the `summary` field
3. Count answered vs skipped questions

Example output:
```json
{
  "answers": {
    "q1": {
      "question": "What cache TTL duration should be used?",
      "answer": "5 seconds (fresher data, more backend load)",
      "selected_option": "5 seconds (fresher data, more backend load)",
      "was_custom": false,
      "skipped": false,
      "priority": "P1",
      "affects_sections": ["Non-Functional Requirements", "Functional Requirements"]
    },
    "q2": {
      "question": "What latency threshold should mark a service as degraded?",
      "answer": "Configurable per-service latency threshold",
      "selected_option": "Configurable per-service latency threshold",
      "was_custom": false,
      "skipped": false,
      "priority": "P1",
      "affects_sections": ["Functional Requirements"]
    }
  },
  "summary": "## User Clarifications\n\n[Use collected_summary value here]",
  "questions_answered": 2,
  "questions_skipped": 0,
  "clarity_improvement": 0.05,
  "new_clarity_score": 0.93
}
```

**Legacy format** (only if `collected_user_answers` is NOT provided - deprecated path):

```json
{
  "answers": {
    "q1": {
      "question": "What should be the optimal cache TTL?",
      "answer": "5 seconds",
      "selected_option": 1,
      "was_custom": false,
      "skipped": false,
      "priority": "P0",
      "affects_sections": ["Non-Functional Requirements", "Functional Requirements"]
    },
    "q2": {
      "question": "When should the aggregator report itself as unhealthy?",
      "answer": "Any critical service unhealthy",
      "selected_option": 1,
      "was_custom": false,
      "skipped": false,
      "priority": "P0",
      "affects_sections": ["Health Status Logic", "Functional Requirements"]
    },
    "q3": {
      "question": "Config source priority?",
      "answer": null,
      "selected_option": null,
      "was_custom": false,
      "skipped": true,
      "priority": "P1",
      "affects_sections": ["Constraints"]
    }
  },
  "summary": "## User Clarifications\n\nThe following decisions were made during specification refinement:\n\n### Cache TTL Configuration\n**Question**: What should be the optimal cache TTL?\n**Decision**: 5 seconds\n**Rationale**: Fresher data with acceptable load.\n\n### Self-Health Logic\n**Question**: When should the aggregator report itself as unhealthy?\n**Decision**: Any critical service unhealthy\n**Rationale**: Conservative approach reflecting critical service health.\n\n---\n*Collected on: 2025-01-28T10:30:00Z*\n*Mode: Interactive*",
  "questions_answered": 2,
  "questions_skipped": 1,
  "clarity_improvement": 0.10,
  "new_clarity_score": 0.95
}
```

## Handling Edge Cases

### No Questions Provided

If `clarifying_questions` is empty or null:

```json
{
  "answers": {},
  "summary": "No clarifying questions were required. Specification clarity is sufficient.",
  "questions_answered": 0,
  "questions_skipped": 0,
  "clarity_improvement": 0,
  "new_clarity_score": 0.90
}
```

### User Cancels

If user selects [X] Cancel:

```json
{
  "answers": {},
  "summary": "User cancelled the clarification process.",
  "questions_answered": 0,
  "questions_skipped": 0,
  "clarity_improvement": 0,
  "new_clarity_score": null,
  "cancelled": true,
  "cancellation_reason": "User chose to cancel"
}
```

### All Questions Skipped

```json
{
  "answers": {
    "q1": { "question": "...", "answer": null, "skipped": true, ... }
  },
  "summary": "All questions were skipped. Proceeding with current assumptions.",
  "questions_answered": 0,
  "questions_skipped": 3,
  "clarity_improvement": 0,
  "new_clarity_score": 0.85
}
```

## Success Criteria

- Questions are presented clearly with context
- User can answer, skip, or provide custom input
- All answers are properly recorded
- Summary is human-readable for document inclusion
- Progress is shown throughout the process
- User can review and confirm before finalising

## Rules

**DO**:
- Present questions in priority order (P0 first)
- Provide helpful context for each question
- Allow custom answers beyond predefined options
- Let users skip non-critical questions
- Show progress and estimated impact

**DON'T**:
- Force answers to P2 questions
- Accept empty custom answers
- Skip the review/confirmation step
- Proceed without user confirmation
- Hide the impact of decisions
