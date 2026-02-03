---
id: context.understand-intent
version: 1.0.0
category: context
experimental: true
name: Understand Intent
description: Capture the essence of what the user wants to build and confirm initial understanding
tags:
  - context-gathering
  - requirements
  - initial-analysis
model_requirements:
  min_context: 128000
  recommended:
    - gpt-5-thinking-high
agents:
  - product-manager
inputs:
  - name: initial_concept
    description: The user's initial concept or project idea
    type: string
    required: true
    validation:
      min: 10
  - name: domain
    description: Optional domain or industry context
    type: string
    required: false
outputs:
  - user_intent
  - initial_scope
  - problem_statement
  - target_users
  - constraints_identified
tokens:
  avg: 2500
  max: 5000
  min: 1500
---

# Understand Intent

## Objective

Capture the essence of what the user wants to build and confirm your understanding before diving into detailed clarification.

## Context

You are receiving the user's initial concept. This may range from a vague idea to a partially formed specification. Your job is to extract signal from noise and confirm alignment.

## Instructions

### Step 1: Read and Analyze

Examine the user's input (`$initial_concept`) and identify:

1. **The Problem Being Solved**
   - What pain point or need is being addressed?
   - Why does this problem matter?
   - What are the consequences of not solving it?

2. **The Target Users or Beneficiaries**
   - Who will use or benefit from this?
   - What are their characteristics (technical proficiency, context, constraints)?
   - Are there primary vs. secondary user groups?

3. **The Desired Outcomes or Success Metrics**
   - What does success look like?
   - What measurable improvements are expected?
   - What is the minimum viable outcome?

4. **Any Constraints Mentioned**
   - **Time**: Are there deadlines or timeline expectations?
   - **Budget**: Are there cost limitations?
   - **Technical**: Are there existing systems, platforms, or technologies to consider?
   - **Regulatory/Legal**: Are there compliance requirements?
   - **Resources**: Are there team size or skill limitations?

### Step 2: Synthesize Understanding

Create a concise understanding statement (2-3 sentences) that captures:

- The core problem
- The intended solution direction
- The primary user/beneficiary
- Key constraints (if any)

**Example Format**:

> **Initial Understanding**: This project aims to [solve problem X] for [target users Y] by [high-level approach Z]. The primary constraint is [constraint if applicable], and success will be measured by [outcome].

**Note on Interaction**:
Do not ask the user for confirmation. Instead, provide your analysis in the required JSON format. Use the `confidence_score` and `missing_information` fields to indicate uncertainty.

## Output Format

Return ONLY a structured JSON object. Do not output any conversational text before or after the JSON.

```json
{
  "user_intent": {
    "problem": "Clear problem statement",
    "solution_direction": "High-level approach",
    "target_users": "Primary and secondary users",
    "success_criteria": "Initial success indicators"
  },
  "initial_scope": {
    "in_scope": ["Item 1", "Item 2"],
    "likely_out_of_scope": ["Item 1", "Item 2"],
    "unclear": ["Item 1", "Item 2"]
  },
  "constraints_identified": {
    "time": "Description or null",
    "budget": "Description or null",
    "technical": "Description or null",
    "regulatory": "Description or null",
    "other": "Description or null"
  },
  "confidence_score": 0.75,
  "missing_information": ["Critical gap 1", "Critical gap 2"],
  "recommended_next_questions": ["Question 1", "Question 2", "Question 3"]
}
```

## Success Criteria

- ✅ Core problem is clearly identified
- ✅ Target users are described (even if broadly)
- ✅ At least one success criterion is identified
- ✅ Constraints are explicitly listed or marked as "none identified"
- ✅ User confirms understanding is accurate

## Failure Modes

- ❌ **Assuming too much**: If unclear, mark as "unclear" rather than guessing
- ❌ **Being too vague**: "Improve user experience" is not a problem statement
- ❌ **Skipping confirmation**: Always confirm before proceeding
- ❌ **Overcomplicating**: Keep this stage simple and high-level

## Notes

- This is a **divergent** phase: cast a wide net
- Don't worry about completeness yet
- Focus on alignment, not detail
- If the user provides very detailed input, extract the essence rather than restating everything
