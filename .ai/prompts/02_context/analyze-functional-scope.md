---
id: context.analyze-functional-scope
version: 1.0.0
category: context
experimental: true
name: Analyze Functional Scope
description: Identify feature scope, requirements, acceptance criteria, and user workflows for functional validation
tags:
  - functional-review
  - requirements-analysis
  - scope-definition
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.use-modern-cli-tools
  optional:
    - context.load-prd
    - context.load-task
inputs:
  - name: scope
    description: The scope to review (file paths, feature name, or description)
    type: string
    required: true
outputs:
  - feature_scope
  - requirements_list
  - acceptance_criteria
  - user_workflows
  - integration_points
tokens:
  avg: 3500
  max: 7000
  min: 2000
---

# Analyze Functional Scope

## Objective

Identify the feature being reviewed, extract requirements and acceptance criteria, map user workflows, and define validation boundaries for functional review.

## Context

You are preparing for a functional review. You need to understand what was supposed to be built, identify all acceptance criteria, and map out user workflows that need validation.

## Instructions

### Step 1: Identify Feature Scope

Analyze the provided scope to understand what feature is being reviewed.

**Actions**:
1. Parse the scope argument (file paths, feature name, or description)
2. Use `codebase_search` to locate related components
3. Identify all modified/created files
4. Determine feature boundaries

**Output**:
```json
{
  "feature_name": "Email Verification",
  "feature_description": "Token-based email verification for new user registrations",
  "affected_files": [
    "src/api/auth.ts",
    "src/services/email.service.ts",
    "src/models/user.model.ts"
  ],
  "scope_type": "backend",
  "risk_level": "medium"
}
```

### Step 2: Extract Requirements and Acceptance Criteria

Locate and extract requirements from PRD, task description, or commit messages.

**Sources to Check**:
1. `knowledge-base/PRD.md` - Product Requirements Document
2. `knowledge-base/FUNCTIONAL.md` - Functional requirements
3. Recent commit messages
4. Code comments with acceptance criteria
5. Test descriptions

**Actions**:
- Read PRD/task specifications
- Extract acceptance criteria (Given-When-Then format preferred)
- Identify success metrics
- Note constraints and business rules

**Output**:
```json
{
  "requirements_source": "knowledge-base/PRD.md",
  "requirements": [
    {
      "id": "REQ-001",
      "description": "User receives verification email upon registration",
      "priority": "P0",
      "type": "functional"
    },
    {
      "id": "REQ-002",
      "description": "User can verify email by clicking token link",
      "priority": "P0",
      "type": "functional"
    }
  ],
  "acceptance_criteria": [
    {
      "id": "AC-001",
      "requirement_id": "REQ-001",
      "criterion": "Given a new user registers, When registration succeeds, Then verification email is sent within 5 seconds",
      "testable": true
    },
    {
      "id": "AC-002",
      "requirement_id": "REQ-002",
      "criterion": "Given a verification link, When user clicks it, Then email is marked as verified",
      "testable": true
    }
  ],
  "business_rules": [
    "Verification tokens expire after 24 hours",
    "Unverified users cannot access protected features",
    "Email must be unique per user"
  ]
}
```

### Step 3: Map User Workflows

Identify all user workflows that need validation.

**Primary Workflows**:
- Main happy path from user perspective
- Common use cases

**Secondary Workflows**:
- Alternative paths
- Edge cases
- Error scenarios

**Actions**:
- Map out step-by-step user journeys
- Identify decision points
- Note expected outcomes at each step

**Output**:
```json
{
  "primary_workflows": [
    {
      "id": "WF-001",
      "name": "Email Verification - Happy Path",
      "steps": [
        "User completes registration form",
        "System creates account and sends verification email",
        "User receives email with verification link",
        "User clicks verification link",
        "System validates token and marks email as verified",
        "User is redirected to dashboard"
      ],
      "expected_outcome": "User has verified email and full account access",
      "priority": "critical"
    }
  ],
  "secondary_workflows": [
    {
      "id": "WF-002",
      "name": "Expired Token Handling",
      "steps": [
        "User clicks verification link after 24 hours",
        "System detects expired token",
        "User sees error message with option to resend",
        "User requests new verification email",
        "New email sent with fresh token"
      ],
      "expected_outcome": "User can request new verification link",
      "priority": "high"
    }
  ],
  "edge_cases": [
    "User clicks same link multiple times",
    "User registers with already-verified email",
    "Email service is unavailable",
    "Token is tampered with or invalid"
  ]
}
```

### Step 4: Identify Integration Points

Map out where this feature integrates with existing systems.

**Check for**:
- API endpoints called
- External services used
- Database interactions
- State management
- Event emissions

**Output**:
```json
{
  "integration_points": [
    {
      "type": "api",
      "component": "POST /api/auth/register",
      "interaction": "Creates user and triggers email verification"
    },
    {
      "type": "external_service",
      "component": "EmailService",
      "interaction": "Sends verification emails via SMTP"
    },
    {
      "type": "data",
      "component": "UserModel",
      "interaction": "Stores verification status and token"
    }
  ],
  "dependencies": [
    "Email service must be configured",
    "User model must have verification fields",
    "Token generation must be secure"
  ]
}
```

### Step 5: Define Edge Cases to Verify

List specific edge cases and boundary conditions to test.

**Categories**:
- Empty states (no data, zero results)
- Error states (network failures, validation errors)
- Extreme values (very long text, large numbers)
- Concurrent operations (race conditions)
- Permission boundaries (unauthorized access)

**Output**:
```json
{
  "edge_cases": [
    {
      "category": "error_handling",
      "case": "Email service unavailable during registration",
      "expected_behavior": "User account created but flagged for retry, clear error message shown"
    },
    {
      "category": "boundary_condition",
      "case": "Token clicked after expiration",
      "expected_behavior": "Clear error with option to resend verification"
    },
    {
      "category": "concurrent_operation",
      "case": "Same verification link clicked simultaneously",
      "expected_behavior": "Only first request succeeds, subsequent show already verified"
    }
  ]
}
```

## Output Format

Return comprehensive scope analysis:

```json
{
  "feature_scope": {
    "name": "Email Verification",
    "description": "Token-based email verification for user registration",
    "affected_components": ["AuthAPI", "EmailService", "UserModel"],
    "affected_files": ["src/api/auth.ts", "src/services/email.service.ts"],
    "scope_type": "backend",
    "risk_level": "medium"
  },
  "requirements_list": {
    "source": "knowledge-base/PRD.md",
    "total_requirements": 5,
    "p0_requirements": 3,
    "requirements": [
      {
        "id": "REQ-001",
        "description": "User receives verification email",
        "priority": "P0",
        "type": "functional"
      }
    ],
    "business_rules": [
      "Tokens expire in 24 hours",
      "Unverified users have limited access"
    ]
  },
  "acceptance_criteria": [
    {
      "id": "AC-001",
      "requirement_id": "REQ-001",
      "criterion": "Given new registration, When account created, Then verification email sent within 5s",
      "testable": true
    }
  ],
  "user_workflows": {
    "primary": [
      {
        "id": "WF-001",
        "name": "Happy Path - Email Verification",
        "steps": ["Register", "Receive email", "Click link", "Verify"],
        "priority": "critical"
      }
    ],
    "secondary": [
      {
        "id": "WF-002",
        "name": "Expired Token",
        "steps": ["Click expired link", "See error", "Request new"],
        "priority": "high"
      }
    ],
    "edge_cases": [
      "Multiple clicks on same link",
      "Invalid/tampered token",
      "Email service down"
    ]
  },
  "integration_points": [
    {
      "type": "api",
      "component": "AuthAPI",
      "interaction": "Handles registration and verification endpoints"
    },
    {
      "type": "external_service",
      "component": "EmailService",
      "interaction": "Sends verification emails"
    }
  ],
  "validation_checklist": [
    "All P0 requirements implemented",
    "Primary workflow functions end-to-end",
    "Error handling for email failures",
    "Token expiration enforced",
    "Security: tokens are cryptographically secure"
  ]
}
```

## Success Criteria

- ✅ Feature scope clearly defined
- ✅ All requirements extracted from source
- ✅ Acceptance criteria identified (testable)
- ✅ User workflows mapped (primary + secondary)
- ✅ Integration points documented
- ✅ Edge cases listed for validation
- ✅ Validation checklist prepared

## Rules

**DO**:
- ✅ Search for PRD/task specifications first
- ✅ Extract actual acceptance criteria (don't infer)
- ✅ Map complete user journeys (not just API calls)
- ✅ Identify integration points explicitly
- ✅ Consider edge cases and error scenarios

**DON'T**:
- ❌ Don't assume requirements (always find source)
- ❌ Don't skip edge case identification
- ❌ Don't ignore error workflows
- ❌ Don't overlook integration dependencies

