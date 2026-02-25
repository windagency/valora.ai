---
id: review.collect-user-feedback
version: 1.0.0
category: review
experimental: true
name: Collect User Feedback
description: Interactive or non-interactive user satisfaction and feedback collection
tags:
  - feedback
  - user-satisfaction
  - interactive
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.use-modern-cli-tools
    - context.identify-completed-workflow
inputs:
  - name: workflow_executed
    description: Workflow type from context stage
    type: string
    required: true
  - name: satisfaction_arg
    description: Non-interactive satisfaction score (1-10)
    type: number
    required: false
    validation:
      min: 1
      max: 10
  - name: interactive_mode
    description: Whether to collect interactive feedback
    type: boolean
    required: false
    default: false
outputs:
  - satisfaction_score
  - feedback_comments
  - improvement_suggestions
  - pain_points
  - success_highlights
tokens:
  avg: 1500
  max: 3000
  min: 800
---

# Collect User Feedback

## OUTPUT FORMAT - READ THIS FIRST

**YOUR ENTIRE RESPONSE MUST BE EXACTLY THIS JSON (with values filled in):**

```json
{
  "satisfaction_score": 7,
  "feedback_source": "auto-assessed",
  "feedback_comments": {
    "what_went_well": "Workflow completed successfully",
    "frustrations": "No user feedback collected",
    "improvements": "Consider using --interactive for detailed feedback"
  },
  "improvement_suggestions": [],
  "pain_points": [],
  "success_highlights": ["Workflow completed"]
}
```

**RULES:**
- Start your response with `{`
- End your response with `}`
- NO text before or after the JSON
- NO markdown code fences
- NO explanations

---

## Objective

Gather qualitative user feedback about the workflow experience.

### Non-Interactive Mode (if `satisfaction_arg` provided)

Use the provided satisfaction score directly:

```json
{
  "satisfaction_score": satisfaction_arg,
  "feedback_source": "non-interactive",
  "feedback_comments": {
    "source": "non-interactive"
  },
  "improvement_suggestions": [],
  "pain_points": [],
  "success_highlights": []
}
```

Skip interactive prompts.

### Interactive Mode (if `interactive_mode` = true)

Display workflow summary:

```plaintext
📊 Workflow Feedback Session

Workflow: [workflow_executed]
Duration: [duration]
Commands: [command1] → [command2] → [command3]

Overall, how satisfied are you with this workflow? (1-10): _
```

**Prompt user for satisfaction (1-10)**

Then ask guided questions:

```plaintext
✨ What went well?
> _

😤 What was frustrating or slow?
> _

💡 What could be improved?
> _

⏱️ Which part took longer than expected?
> _

❓ Were there any confusing steps?
> _

🎯 Any suggestions for specific agents or prompts?
> _
```

### Step 1: Capture Satisfaction Score

- **1-3**: Very dissatisfied
- **4-6**: Somewhat dissatisfied
- **7-8**: Satisfied
- **9-10**: Very satisfied

### Step 2: Parse Feedback Comments

Extract from user responses:

**Success Highlights:**
- Positive aspects mentioned in "What went well?"
- High satisfaction indicators

**Pain Points:**
- Issues mentioned in "What was frustrating?"
- Slowness complaints
- Confusion indicators

**Improvement Suggestions:**
- Specific recommendations from user
- Ideas from "What could be improved?"
- Agent/prompt specific suggestions

### Step 3: Categorize Feedback

Group feedback by:
- **Performance**: Speed, duration, bottlenecks
- **Quality**: Output quality, accuracy, completeness
- **Usability**: Clarity, ease of use, intuitiveness
- **Agent-Specific**: Feedback about specific agents
- **Prompt-Specific**: Feedback about specific prompts

## Output Format

```json
{
  "satisfaction_score": 8,
  "feedback_source": "interactive",
  "feedback_comments": {
    "what_went_well": "Implementation phase was smooth, AI understood requirements clearly",
    "frustrations": "Test phase took longer than expected, had to fix linter errors manually",
    "improvements": "Better linter integration before commit, auto-fix common issues",
    "slow_parts": "Test command, took 15 minutes",
    "confusing_steps": "None",
    "agent_suggestions": "Engineer agent could be more proactive with error fixes"
  },
  "improvement_suggestions": [
    "Add auto-fix for common linter errors",
    "Improve test command performance",
    "Better error messages during implementation"
  ],
  "pain_points": [
    "Manual linter fixes required",
    "Slow test execution"
  ],
  "success_highlights": [
    "Clear requirement understanding",
    "Quality commit messages"
  ],
  "categorized_feedback": {
    "performance": ["Slow test execution"],
    "quality": ["Quality commit messages"],
    "usability": ["Clear requirement understanding"],
    "agent_specific": {
      "backend-engineer-api": ["Could be more proactive with error fixes"]
    },
    "prompt_specific": {}
  }
}
```

## Success Criteria

- ✅ Satisfaction score captured (1-10)
- ✅ All feedback questions answered (if interactive)
- ✅ Comments categorized appropriately
- ✅ Suggestions extracted as actionable items
- ✅ Pain points identified clearly

## Error Handling

- **User skips questions**: Mark as "no response" but continue
- **Invalid satisfaction score**: Prompt again or use default (5)
- **Non-interactive without score**: Return default JSON with neutral assessment

## Response Format Reminder

**IMPORTANT**: Your entire response must be a single valid JSON object. Do not include:
- Explanatory text before or after the JSON
- Markdown code fences (no ```json or ```)
- Comments or annotations

Start your response directly with `{` and end with `}`.

