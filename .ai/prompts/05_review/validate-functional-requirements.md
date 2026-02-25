---
id: review.validate-functional-requirements
version: 1.0.0
category: review
experimental: true
name: Validate Functional Requirements
description: Comprehensive functional validation including requirements coverage, UX, workflows, edge cases, and integration
tags:
  - functional-review
  - requirements-validation
  - ux-validation
  - workflow-validation
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.use-modern-cli-tools
    - context.analyze-functional-scope
  optional:
    - review.validate-accessibility
inputs:
  - name: scope
    description: Feature scope to validate
    type: string
    required: true
  - name: requirements
    description: Requirements list from scope analysis
    type: object
    required: true
  - name: severity
    description: Minimum severity to report
    type: string
    required: false
    validation:
      enum: ["critical", "high", "medium", "low"]
  - name: check_a11y
    description: Whether to include accessibility validation
    type: boolean
    required: false
    default: false
outputs:
  - completeness_score
  - requirements_coverage
  - ux_issues
  - functional_gaps
  - workflow_validation
tokens:
  avg: 5000
  max: 10000
  min: 3000
---

# Validate Functional Requirements

## Objective

Systematically validate that implemented features fully satisfy functional requirements, acceptance criteria, user workflows, and UX expectations.

## Context

You have a feature implementation to validate against requirements and acceptance criteria. Your goal is to verify feature completeness, proper workflows, edge case handling, and user experience quality.

## Validation Process

### Step 1: Validate Requirements Coverage

Check each requirement against the implementation.

**Actions**:
1. For each P0 requirement:
   - Locate implementation in code
   - Verify acceptance criteria are met
   - Test against expected behavior
   - Document status (MET, PARTIAL, UNMET)

2. For each business rule:
   - Find enforcement in code
   - Verify rule logic is correct
   - Check for exceptions/edge cases

**Severity Mapping**:
- **CRITICAL**: P0 requirement completely unmet or broken
- **HIGH**: P0 requirement partially met or P1 requirement unmet
- **MEDIUM**: P1 requirement partially met or UX degradation
- **LOW**: P2/nice-to-have missing or minor polish

**Output**:
```json
{
  "requirements_coverage": {
    "total_requirements": 5,
    "met": 4,
    "partial": 1,
    "unmet": 0,
    "coverage_percentage": 90,
    "details": [
      {
        "id": "REQ-001",
        "description": "User receives verification email",
        "status": "MET",
        "evidence": "Verified in src/api/auth.ts:45-67, email sent after registration",
        "acceptance_criteria_met": 3,
        "acceptance_criteria_total": 3
      },
      {
        "id": "REQ-002",
        "description": "Token expires after 24 hours",
        "status": "PARTIAL",
        "evidence": "Expiration check exists but error message unclear",
        "gaps": ["Error message doesn't offer resend option"],
        "severity": "MEDIUM"
      }
    ]
  }
}
```

### Step 2: Validate User Workflows

Test each user workflow end-to-end.

**For Each Primary Workflow**:
1. Walk through each step
2. Verify expected outcomes
3. Check state transitions
4. Validate feedback mechanisms (loading, success, error)
5. Confirm navigation flows correctly

**For Each Secondary Workflow**:
1. Verify alternative paths work
2. Check error handling
3. Validate recovery mechanisms

**Output**:
```json
{
  "workflow_validation": {
    "primary_workflows": [
      {
        "id": "WF-001",
        "name": "Email Verification - Happy Path",
        "status": "PASS",
        "steps_validated": 6,
        "issues": [],
        "notes": "Workflow completes successfully end-to-end"
      }
    ],
    "secondary_workflows": [
      {
        "id": "WF-002",
        "name": "Expired Token Handling",
        "status": "FAIL",
        "steps_validated": 3,
        "steps_failed": 2,
        "issues": [
          {
            "step": "User sees error message with resend option",
            "problem": "No resend button present in error page",
            "severity": "HIGH",
            "user_impact": "User cannot recover without leaving the flow"
          }
        ]
      }
    ],
    "edge_cases": [
      {
        "case": "Multiple clicks on same link",
        "status": "PASS",
        "behavior": "Idempotent - subsequent clicks show 'already verified'"
      },
      {
        "case": "Email service unavailable",
        "status": "FAIL",
        "behavior": "500 error shown to user, no retry mechanism",
        "severity": "CRITICAL",
        "expected": "Graceful error with option to resend"
      }
    ]
  }
}
```

### Step 3: Assess UX and Usability

Evaluate user experience from user perspective.

**Check**:
1. **Intuitiveness**: Is the feature discoverable and easy to use?
2. **Feedback**: Are loading states, success, and errors clearly communicated?
3. **Consistency**: Does it follow existing UI/UX patterns?
4. **Error Messages**: Are they user-friendly and actionable?
5. **Responsiveness**: Does it work on mobile/tablet?
6. **Accessibility** (if check_a11y=true): WCAG compliance

**Output**:
```json
{
  "ux_assessment": {
    "overall_quality": "GOOD",
    "issues": [
      {
        "category": "feedback",
        "issue": "No loading indicator while email is being sent",
        "severity": "MEDIUM",
        "user_impact": "User doesn't know if registration succeeded",
        "location": "src/components/RegistrationForm.tsx:89",
        "recommendation": "Add loading spinner and 'Sending verification email...' message"
      },
      {
        "category": "error_messages",
        "issue": "Generic 'Invalid token' error doesn't explain why or what to do",
        "severity": "HIGH",
        "user_impact": "User is confused and may abandon",
        "location": "src/pages/VerifyEmail.tsx:34",
        "recommendation": "Show 'Verification link expired. Request new verification email?' with action button"
      }
    ],
    "strengths": [
      "Clear success message after email verification",
      "Consistent with existing auth flows",
      "Good form validation with inline feedback"
    ]
  }
}
```

### Step 4: Validate Edge Cases and Error Handling

Verify robust handling of edge cases and errors.

**Test Categories**:
1. **Empty States**: No data, zero results
2. **Error States**: Network failures, validation errors, API errors
3. **Boundary Conditions**: Min/max values, length limits, expiration
4. **Concurrent Operations**: Race conditions, simultaneous requests
5. **Permission Boundaries**: Unauthorized access attempts

**Output**:
```json
{
  "edge_case_validation": {
    "total_cases": 8,
    "passed": 5,
    "failed": 3,
    "details": [
      {
        "case": "Email service timeout",
        "status": "FAIL",
        "severity": "CRITICAL",
        "current_behavior": "Unhandled exception, 500 error to user",
        "expected_behavior": "Graceful error: 'Unable to send email. Please try again later.'",
        "location": "src/services/email.service.ts:78"
      },
      {
        "case": "Token already used",
        "status": "PASS",
        "behavior": "Shows 'Email already verified' message"
      }
    ]
  }
}
```

### Step 5: Validate Integration and Data Flow

Verify integration points work correctly.

**Check**:
1. **API Calls**: Correct endpoints, payloads, response handling
2. **State Management**: Consistent state across components
3. **Data Transformations**: Correct mapping and formatting
4. **Side Effects**: Events triggered, external systems notified
5. **Error Propagation**: Errors handled at appropriate layers

**Output**:
```json
{
  "integration_validation": {
    "status": "PARTIAL",
    "issues": [
      {
        "integration_point": "EmailService",
        "issue": "No retry logic for transient failures",
        "severity": "HIGH",
        "recommendation": "Add exponential backoff retry (3 attempts)"
      }
    ],
    "data_flow": {
      "status": "PASS",
      "validated": "User state correctly updated across components"
    }
  }
}
```

### Step 6: Accessibility Validation (Conditional)

If `check_a11y == true`, delegate to accessibility validation:

**Use**:
- `review.validate-accessibility` prompt
- Check WCAG 2.1 AA compliance
- Validate keyboard navigation
- Verify screen reader compatibility

**Output** (if applicable):
```json
{
  "accessibility": {
    "checked": true,
    "wcag_level": "AA",
    "status": "PASS",
    "issues": [],
    "score": 95
  }
}
```

## Output Format

Return comprehensive validation results:

```json
{
  "validation_summary": {
    "overall_status": "CHANGES_REQUESTED",
    "completeness_score": 85,
    "total_issues": 8,
    "critical": 2,
    "high": 3,
    "medium": 2,
    "low": 1
  },
  "requirements_coverage": {
    "percentage": 90,
    "met": 4,
    "partial": 1,
    "unmet": 0,
    "details": [...]
  },
  "workflow_validation": {
    "primary_workflows_passed": 2,
    "primary_workflows_total": 2,
    "secondary_workflows_passed": 1,
    "secondary_workflows_total": 2,
    "edge_cases_passed": 5,
    "edge_cases_total": 8,
    "details": [...]
  },
  "ux_issues": [
    {
      "category": "feedback",
      "severity": "MEDIUM",
      "issue": "No loading indicator",
      "user_impact": "User uncertain about request status",
      "recommendation": "Add loading state"
    }
  ],
  "functional_gaps": [
    {
      "requirement_id": "REQ-005",
      "gap": "No resend verification email option",
      "severity": "HIGH",
      "user_impact": "Users with expired tokens cannot recover",
      "recommendation": "Add resend button to error page"
    }
  ],
  "integration_validation": {
    "status": "PARTIAL",
    "issues": [...]
  },
  "accessibility": {
    "checked": true,
    "status": "PASS"
  }
}
```

## Success Criteria

- ✅ All requirements validated (MET/PARTIAL/UNMET)
- ✅ User workflows tested end-to-end
- ✅ UX assessed from user perspective
- ✅ Edge cases and error scenarios verified
- ✅ Integration points validated
- ✅ Accessibility checked (if applicable)
- ✅ Issues categorized by severity
- ✅ User impact assessed for each issue

## Rules

**DO**:
- ✅ Test workflows as an end user would
- ✅ Verify actual behavior matches expected behavior
- ✅ Check error messages are user-friendly
- ✅ Validate graceful degradation
- ✅ Consider mobile/responsive behavior
- ✅ Assess user impact for every issue

**DON'T**:
- ❌ Don't just check if code exists (test it works)
- ❌ Don't skip error scenarios
- ❌ Don't ignore UX feedback quality
- ❌ Don't overlook integration failures
- ❌ Don't confuse functional issues with code quality issues

**Severity Guidelines**:
- **CRITICAL**: Core functionality broken, data loss, complete workflow failure
- **HIGH**: Major feature gaps, broken user workflows, significant UX degradation
- **MEDIUM**: Minor feature gaps, usability issues, inconsistent behavior
- **LOW**: Polish items, nice-to-have improvements, minor UX enhancements

