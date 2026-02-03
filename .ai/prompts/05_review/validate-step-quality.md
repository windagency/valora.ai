---
id: review.validate-step-quality
version: 1.0.0
category: review
experimental: true
name: Validate Step Quality
description: Ensure implementation steps are clear, specific, actionable, and properly sequenced
tags:
  - plan-review
  - step-validation
  - actionability
  - clarity
model_requirements:
  min_context: 128000
  recommended:
    - gpt-5-thinking-high
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - review.load-plan-context
inputs:
  - name: plan_structure
    description: Parsed plan structure from load-plan-context
    type: object
    required: true
outputs:
  - step_quality_score
  - vague_steps
  - actionability_issues
tokens:
  avg: 3000
  max: 6000
  min: 2000
---

# Validate Step Quality

## Objective

Ensure implementation steps are clear, specific, actionable, properly sequenced, and executable by an engineer.

## Context

You are reviewing the Implementation Steps section of a plan to verify that each step provides sufficient guidance for execution.

## Step Quality Criteria

A high-quality step must be:

1. **Atomic** - One clear action per step
2. **Specific** - Exact files, functions, or components named
3. **Actionable** - Engineer knows exactly what to do
4. **Sequential** - Proper dependency order
5. **Testable** - Can verify completion
6. **Reversible** - Can undo if needed

## Instructions

### Step 1: Extract Implementation Steps

Parse steps from plan:

```json
{
  "steps": [
    {
      "step_number": 1,
      "action": "Add email_verified column to users table",
      "files_affected": ["migrations/add_email_verified.sql"],
      "expected_outcome": "users table has nullable boolean email_verified column",
      "validation_criteria": "Query users table schema shows new column",
      "location": "lines 120-125"
    }
  ],
  "total_steps": 12
}
```

### Step 2: Evaluate Each Step

For each step, assess against quality criteria:

#### Criterion 1: Atomic (One Action)

**Good Examples**:
- ✅ "Create VerifyEmailButton component in components/auth/"
- ✅ "Add email_verified column to users table"
- ✅ "Write unit tests for token generation function"

**Bad Examples**:
- ❌ "Create components and add validation" (two actions)
- ❌ "Update the authentication flow" (too broad)
- ❌ "Fix the bugs and add tests" (multiple actions)

**Scoring**:
- Atomic (one action): 0 deduction
- Multiple actions: -0.3 per step
- Vague action scope: -0.5 per step

#### Criterion 2: Specific (Names Files/Components)

**Good Examples**:
- ✅ "Update UserProfile.tsx to add email validation using Zod schema"
- ✅ "Modify auth.controller.ts verifyEmail() method to check token expiry"
- ✅ "Add sendVerificationEmail() function to services/email.service.ts"

**Bad Examples**:
- ❌ "Update the component" (which component?)
- ❌ "Add validation to the form" (which form, which field?)
- ❌ "Handle errors" (where, how?)

**Scoring**:
- Specific file/component named: 0 deduction
- Generic reference ("the component"): -0.4 per step
- No file reference: -0.6 per step

#### Criterion 3: Actionable (Clear Instructions)

**Good Examples**:
- ✅ "In users.service.ts, add generateVerificationToken() method that uses crypto.randomBytes(32) to create a 64-character hex token"
- ✅ "Create POST /api/verify-email endpoint that accepts {token, email}, validates token exists and hasn't expired, then updates user.email_verified = true"

**Bad Examples**:
- ❌ "Implement email verification" (how?)
- ❌ "Make it work properly" (not actionable)
- ❌ "Handle edge cases" (which ones?)

**Scoring**:
- Clear, actionable instructions: 0 deduction
- Somewhat vague but understandable: -0.3 per step
- Very vague or unclear: -0.7 per step
- Not actionable: -1.0 per step

#### Criterion 4: Sequential (Proper Order)

**Check Ordering**:
- Database changes before code that uses them
- Utilities/services before consumers
- Backend API before frontend integration
- Tests after implementation

**Dependencies**:
```plaintext
Step 3 requires Step 1 output → OK
Step 5 uses function from Step 8 → BAD (ordering issue)
```

**Scoring**:
- Logical sequence: 0 deduction
- Minor ordering suboptimality: -1.0
- Clear dependency violation: -2.0

#### Criterion 5: Testable (Validation Criteria)

**Good Examples**:
- ✅ "Validation: Query users table schema, verify email_verified column exists as BOOLEAN"
- ✅ "Validation: Call endpoint with valid token, expect 200 and user.email_verified = true"
- ✅ "Validation: Run npm test, all tests pass"

**Bad Examples**:
- ❌ "Validation: Check if it works" (not specific)
- ❌ No validation criteria provided
- ❌ "Validation: Test manually" (not verifiable)

**Scoring**:
- Clear validation criteria: 0 deduction
- Vague validation: -0.3 per step
- Missing validation: -0.5 per step

#### Criterion 6: Expected Outcome

**Good Examples**:
- ✅ "Expected: Component renders email verification form with input and submit button"
- ✅ "Expected: Function returns 64-character hex string"
- ✅ "Expected: Email sent via SendGrid with verification link"

**Scoring**:
- Clear expected outcome: 0 deduction
- Vague outcome: -0.2 per step
- Missing outcome: -0.3 per step

### Step 3: Identify Vague Steps

Flag steps with significant issues:

```json
{
  "vague_steps": [
    {
      "step_number": 5,
      "action": "Update the auth flow",
      "issues": [
        "No specific file referenced",
        "Action too broad (not atomic)",
        "Unclear what changes are needed"
      ],
      "severity": "high",
      "suggested_improvement": "In auth.middleware.ts, add checkEmailVerified() function that reads user.email_verified and blocks requests if false. Apply to protected routes in routes/api.ts."
    },
    {
      "step_number": 8,
      "action": "Handle edge cases",
      "issues": [
        "No specific edge cases identified",
        "Not actionable without details"
      ],
      "severity": "medium",
      "suggested_improvement": "Add error handling for: (1) expired tokens, (2) invalid tokens, (3) already verified emails, (4) email send failures. Return appropriate HTTP status codes."
    }
  ]
}
```

### Step 4: Check Actionability

Can an engineer execute this without confusion?

**Checklist per step**:
- [ ] Knows which file to modify
- [ ] Knows what code to write/change
- [ ] Knows what the result should be
- [ ] Knows how to verify it worked
- [ ] Has enough context to proceed

**Red Flags**:
- Step says "update" but doesn't specify what to update
- Step says "add" but doesn't specify where
- Step references undefined terms or components
- Step assumes knowledge not in the plan
- Multiple steps required to understand one step

### Step 5: Assess Coverage

Do steps cover the entire implementation?

**Gap Check**:
- [ ] All components from scope are addressed
- [ ] All dependencies are handled
- [ ] Database migrations included
- [ ] Tests are written
- [ ] Documentation updated (if needed)

**Missing Steps**:
```json
{
  "missing_steps": [
    {
      "area": "error_handling",
      "description": "No step for handling email send failures",
      "criticality": "high"
    },
    {
      "area": "monitoring",
      "description": "No step for adding metrics/logging",
      "criticality": "medium"
    }
  ]
}
```

### Step 6: Calculate Step Quality Score

```plaintext
For each step:
  step_score = 10.0 - total_deductions (max deductions: 10.0)

Average Step Quality:
  average_score = sum(step_scores) / total_steps

Global Deductions:
  - Ordering issues: -X
  - Missing coverage areas: -Y

Final Score = max(0.0, average_score - global_deductions)

Result: 0.0 - 10.0
```

**Interpretation**:
- **9.0-10.0**: Excellent - All steps are clear and actionable
- **7.5-8.9**: Good - Most steps are good, minor improvements needed
- **6.0-7.4**: Acceptable - Several vague steps, needs work
- **4.0-5.9**: Needs Work - Many unclear steps
- **0.0-3.9**: Inadequate - Steps are unusable, rewrite needed

### Step 7: Generate Improvement Recommendations

For each vague step, provide specific improvement:

```json
{
  "improvements": [
    {
      "step_number": 5,
      "current": "Update the auth flow",
      "improved": "In auth.middleware.ts, modify authenticateUser() to check user.email_verified after token validation. If false, return 403 with error message 'Email not verified'.",
      "why_better": "Names specific file, function, and exact logic change"
    },
    {
      "step_number": 8,
      "current": "Handle edge cases",
      "improved": "Add error handling in verifyEmail() for: (1) token not found → 404, (2) token expired → 410, (3) email already verified → 200 with message, (4) email send fails → 500 and retry queue",
      "why_better": "Lists specific edge cases with expected behavior"
    }
  ]
}
```

## Output Format

```json
{
  "step_quality_score": 7.3,
  "status": "acceptable",
  "score_breakdown": {
    "average_step_score": 7.8,
    "global_deductions": {
      "ordering_issues": -0.5,
      "missing_coverage": 0.0
    }
  },
  "step_analysis": {
    "total_steps": 12,
    "excellent_steps": 5,
    "good_steps": 4,
    "needs_improvement": 3,
    "unusable": 0
  },
  "vague_steps": [
    {
      "step_number": 5,
      "action": "Update the auth flow",
      "issues": [
        "No specific file referenced",
        "Action too broad",
        "Unclear what changes needed"
      ],
      "severity": "high",
      "deductions": -1.4
    },
    {
      "step_number": 8,
      "action": "Handle edge cases",
      "issues": [
        "No specific edge cases identified",
        "Not actionable"
      ],
      "severity": "medium",
      "deductions": -0.8
    },
    {
      "step_number": 11,
      "action": "Add tests for the feature",
      "issues": [
        "No specific test scenarios",
        "Missing test file location"
      ],
      "severity": "low",
      "deductions": -0.5
    }
  ],
  "actionability_issues": [
    {
      "issue": "Steps 5 and 8 lack file references",
      "impact": "Engineer must guess which files to modify",
      "recommendation": "Add specific file paths"
    },
    {
      "issue": "Step 11 doesn't specify test scenarios",
      "impact": "Unclear what to test",
      "recommendation": "List specific test cases"
    }
  ],
  "ordering_issues": [
    {
      "description": "Step 7 uses utility from Step 9",
      "impact": "Dependency violation, will cause errors",
      "recommendation": "Move Step 9 before Step 7"
    }
  ],
  "missing_coverage": [],
  "recommendations": {
    "critical": [
      "Add file references to Steps 5 and 8",
      "Reorder: Move Step 9 before Step 7"
    ],
    "important": [
      "Make Step 5 more specific about auth changes",
      "List specific edge cases in Step 8",
      "Add test scenarios to Step 11"
    ],
    "minor": [
      "Add expected outcomes to all steps"
    ]
  },
  "examples": {
    "good_steps": [
      {
        "step_number": 1,
        "action": "Add email_verified column to users table",
        "why_good": "Atomic, specific, clear validation"
      }
    ],
    "improvement_examples": [
      {
        "step_number": 5,
        "current": "Update the auth flow",
        "improved": "In auth.middleware.ts, modify authenticateUser() to check user.email_verified after token validation. If false, return 403.",
        "why_better": "Specific file, function, and logic"
      }
    ]
  }
}
```

## Success Criteria

- ✅ All steps evaluated against quality criteria
- ✅ Vague steps identified with specific issues
- ✅ Actionability assessed objectively
- ✅ Ordering validated for dependencies
- ✅ Coverage gaps identified
- ✅ Step quality score calculated
- ✅ Concrete improvement examples provided

## Rules

**DO**:
- ✅ Flag vague language ("update", "handle", "fix")
- ✅ Require specific file/component names
- ✅ Verify steps are executable
- ✅ Check for logical ordering
- ✅ Provide concrete improvement examples

**DON'T**:
- ❌ Don't accept "the component" without naming it
- ❌ Don't overlook missing validation criteria
- ❌ Don't ignore dependency ordering issues
- ❌ Don't approve steps without file references
- ❌ Don't allow multi-action steps

