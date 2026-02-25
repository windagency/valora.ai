---
id: documentation.generate-feedback-summary
version: 1.0.0
category: documentation
experimental: true
name: Generate Feedback Summary
description: Create a concise feedback summary for display - no file output
tags:
  - documentation
  - feedback
  - summary
model_requirements:
  min_context: 64000
  recommended:
    - claude-sonnet-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.use-modern-cli-tools
    - context.identify-completed-workflow
    - review.calculate-performance-metrics
    - review.evaluate-quality-outcomes
    - review.identify-improvement-areas
inputs:
  - name: workflow_executed
    description: Workflow type
    type: string
    required: true
  - name: execution_duration
    description: Total execution duration
    type: number
    required: false
  - name: satisfaction_score
    description: User satisfaction rating (1-10)
    type: number
    required: false
  - name: time_efficiency_score
    description: Time efficiency score (0-100)
    type: number
    required: false
  - name: error_rate
    description: Error rate percentage
    type: number
    required: false
  - name: completion_success_rate
    description: Completion success rate
    type: number
    required: false
  - name: bottlenecks_identified
    description: List of identified bottlenecks
    type: array
    required: false
  - name: overall_quality_score
    description: Overall quality score (0-100)
    type: number
    required: false
  - name: code_quality_score
    description: Code quality score
    type: number
    required: false
  - name: test_quality_score
    description: Test quality score
    type: number
    required: false
  - name: review_quality_score
    description: Review quality score
    type: number
    required: false
  - name: agent_improvements
    description: Agent improvement recommendations
    type: array
    required: false
  - name: prompt_refinements
    description: Prompt refinement suggestions
    type: array
    required: false
  - name: workflow_optimizations
    description: Workflow optimization opportunities
    type: array
    required: false
outputs:
  - feedback_summary
  - key_insights
  - recommendations
tokens:
  avg: 1500
  max: 3000
  min: 800
---

# Generate Feedback Summary

## OUTPUT FORMAT - READ THIS FIRST

**YOUR ENTIRE RESPONSE MUST BE EXACTLY THIS JSON (with values filled in):**

```json
{
  "feedback_summary": "Brief 2-3 sentence summary of the workflow feedback",
  "key_insights": [
    "First key insight about the workflow",
    "Second key insight",
    "Third key insight"
  ],
  "recommendations": [
    {
      "priority": "high",
      "category": "performance",
      "description": "Specific actionable recommendation"
    }
  ]
}
```

**RULES:**
- Start your response with `{`
- End your response with `}`
- NO text before or after the JSON
- NO markdown code fences
- NO explanations
- DO NOT write any files

---

## Objective

Synthesize all collected metrics into a concise summary for display. DO NOT write any files.

## Instructions

### Step 1: Create Executive Summary

Based on the input metrics, create a 2-3 sentence summary covering:
- What workflow was analyzed
- Overall performance assessment
- Main area for improvement (if any)

### Step 2: Extract Key Insights

Identify 3-5 key insights from the metrics:
- Performance highlights or concerns
- Quality observations
- Bottleneck patterns

### Step 3: Prioritize Recommendations

From the improvement data, extract top 3-5 actionable recommendations:
- Focus on highest impact items
- Be specific and actionable
- Use priority: "high", "medium", or "low"
- Use category: "performance", "quality", or "workflow"

## Success Criteria

- Summary is concise (2-3 sentences)
- Key insights are specific and actionable
- Recommendations are prioritized
- NO files are written
- Output is valid JSON only

## Response Format Reminder

Start your response directly with `{` and end with `}`.
