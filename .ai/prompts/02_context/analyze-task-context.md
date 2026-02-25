---
id: context.analyze-task-context
version: 1.0.0
category: context
experimental: true
name: Analyze Task Context
description: Parse task requirements and identify affected components and scope
tags:
  - task-analysis
  - scope-definition
  - component-mapping
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
    - gpt-5-thinking-high
agents:
  - lead
dependencies:
  requires:
    - context.scan-codebase
    - context.use-modern-cli-tools
  optional:
    - context.understand-intent
inputs:
  - name: task_description
    description: The task requirements and description
    type: string
    required: true
    validation:
      min: 10
  - name: gathered_knowledge
    description: Optional gathered knowledge from knowledge base
    type: object
    required: false
outputs:
  - task_scope
  - affected_components
  - relevant_files
  - scope_boundaries
tokens:
  avg: 3500
  max: 7000
  min: 2000
---

# Analyze Task Context

## Objective

Parse task requirements, understand what needs to be built, and identify which components of the codebase will be affected.

## Context

You are receiving a task description that may range from well-defined to vague. Your job is to extract actionable scope, map it to the existing codebase, and define clear boundaries.

## Instructions

### Step 1: Parse Task Requirements

Extract key elements from `task_description`:

**Identify**:
1. **What** needs to be built/changed
2. **Why** it's needed (problem being solved)
3. **Who** will benefit (target users/systems)
4. **Success criteria** (how we know it's done)
5. **Constraints** (limitations, requirements)

**Output**:
```json
{
  "what": "Clear description of the change",
  "why": "Problem or need being addressed",
  "who": "Target users or systems",
  "success_criteria": ["Criterion 1", "Criterion 2"],
  "constraints": ["Constraint 1", "Constraint 2"]
}
```

### Step 2: Define Scope Boundaries

Clearly establish what IS and IS NOT included:

**In Scope**:
- Components/features to be modified or created
- Required tests
- Necessary documentation updates
- Configuration changes

**Out of Scope**:
- Related features NOT included in this task
- Future enhancements
- Adjacent concerns deferred

**Uncertain/Needs Clarification**:
- Ambiguous requirements
- Missing acceptance criteria
- Unclear dependencies

**Output**:
```json
{
  "in_scope": ["Item 1", "Item 2", "Item 3"],
  "out_of_scope": ["Item 1", "Item 2"],
  "needs_clarification": ["Question 1", "Question 2"]
}
```

### Step 3: Identify Affected Components

Use `codebase_search` and `grep` to locate components that will be modified:

**Areas to Map**:
1. **Backend Components**:
   - API endpoints to create/modify
   - Services and business logic
   - Data models and schemas
   - Middleware or utilities

2. **Frontend Components**:
   - UI components to create/modify
   - State management (Redux, Zustand, etc.)
   - Routing changes
   - Hooks or utilities

3. **Data Layer**:
   - Database schema changes
   - Migrations needed
   - Data validation rules

4. **Infrastructure**:
   - Configuration changes
   - Environment variables
   - Deployment updates
   - CI/CD modifications

5. **Testing**:
   - Test files to create/update
   - Test fixtures or mocks

6. **Documentation**:
   - API documentation
   - User guides
   - Code comments

**For Each Component**:
```json
{
  "component": "UserService",
  "path": "src/services/user.service.ts",
  "type": "backend",
  "change_type": "modify",
  "reason": "Add email verification logic",
  "confidence": "high"
}
```

**Use Tools**:
- `codebase_search`: Find components by meaning (e.g., "Where is user authentication handled?")
- `grep`: Find exact symbols (e.g., class names, function names)
- `read_file`: Review relevant files to understand current implementation
- `list_dir`: Explore directory structure

### Step 4: Identify Relevant Files

List specific files that need to be read or modified:

**Categorize**:
- **Critical**: Must be modified for the task
- **Supporting**: May need updates (tests, docs)
- **Reference**: Should be reviewed for context

**Output**:
```json
{
  "critical_files": [
    {
      "path": "src/api/auth.ts",
      "reason": "Add new endpoint for email verification",
      "estimated_changes": "medium"
    }
  ],
  "supporting_files": [
    {
      "path": "tests/api/auth.test.ts",
      "reason": "Add tests for new endpoint"
    }
  ],
  "reference_files": [
    {
      "path": "src/services/email.service.ts",
      "reason": "Understand email sending patterns"
    }
  ]
}
```

### Step 5: Map to Architecture

Understand how the task fits into the system:

**Questions**:
- Which architectural layers are affected? (presentation, business, data)
- Are there cross-cutting concerns? (logging, auth, validation)
- Does this follow existing patterns or introduce new ones?
- Are there similar implementations to reference?

**Output**:
```json
{
  "architectural_layers": ["api", "service", "data"],
  "cross_cutting_concerns": ["authentication", "validation"],
  "follows_patterns": true,
  "similar_implementations": [
    {
      "feature": "Password reset flow",
      "location": "src/api/password-reset.ts",
      "relevance": "Similar verification token pattern"
    }
  ]
}
```

### Step 6: Assess Completeness

Check if you have enough information to proceed:

**Completeness Checklist**:
- [ ] Task requirements are clear
- [ ] Scope boundaries are defined
- [ ] Affected components identified
- [ ] Key files located
- [ ] Architectural fit understood
- [ ] No major ambiguities remain

**If incomplete**:
- List specific questions that need answers
- Identify missing information
- Suggest where to look for answers

**Output**:
```json
{
  "completeness_score": 0.85,
  "ready_for_planning": true,
  "missing_information": ["Clarify: Should email be required or optional?"],
  "recommended_actions": ["Review existing email validation in UserModel"]
}
```

## Output Format

```json
{
  "task_scope": {
    "summary": "Add email verification to user registration flow",
    "what": "Implement email verification with token-based confirmation",
    "why": "Prevent fake accounts and verify user identity",
    "who": "New users during registration",
    "success_criteria": [
      "User receives verification email upon registration",
      "User can verify email by clicking token link",
      "Unverified users cannot access protected features"
    ],
    "constraints": [
      "Must use existing email service",
      "Token expires in 24 hours",
      "Must be backward compatible with existing users"
    ]
  },
  "scope_boundaries": {
    "in_scope": [
      "Email verification endpoint",
      "Token generation and validation",
      "Email template",
      "User model update (verified_email field)",
      "Middleware to check verification status"
    ],
    "out_of_scope": [
      "Two-factor authentication",
      "Phone verification",
      "Social login integration"
    ],
    "needs_clarification": []
  },
  "affected_components": [
    {
      "component": "AuthAPI",
      "path": "src/api/auth.ts",
      "type": "backend",
      "change_type": "modify",
      "reason": "Add verification endpoints",
      "confidence": "high"
    },
    {
      "component": "UserModel",
      "path": "src/models/user.model.ts",
      "type": "data",
      "change_type": "modify",
      "reason": "Add email verification fields",
      "confidence": "high"
    },
    {
      "component": "EmailService",
      "path": "src/services/email.service.ts",
      "type": "backend",
      "change_type": "extend",
      "reason": "Add verification email template",
      "confidence": "medium"
    }
  ],
  "relevant_files": {
    "critical": [
      "src/api/auth.ts",
      "src/models/user.model.ts",
      "src/services/email.service.ts"
    ],
    "supporting": [
      "tests/api/auth.test.ts",
      "tests/services/email.test.ts",
      "docs/api/authentication.md"
    ],
    "reference": [
      "src/api/password-reset.ts"
    ]
  },
  "architectural_context": {
    "layers_affected": ["api", "service", "data"],
    "cross_cutting_concerns": ["authentication", "email"],
    "follows_existing_patterns": true,
    "pattern_references": [
      {
        "pattern": "Token-based verification",
        "example": "Password reset flow (src/api/password-reset.ts)"
      }
    ]
  },
  "completeness_assessment": {
    "score": 0.90,
    "ready_for_planning": true,
    "confidence": "high",
    "missing_information": [],
    "recommendations": [
      "Review password reset implementation for token pattern",
      "Check email service rate limits"
    ]
  }
}
```

## Success Criteria

- ✅ Task scope clearly defined with success criteria
- ✅ Scope boundaries explicit (in/out/unclear)
- ✅ All affected components identified
- ✅ Critical files located
- ✅ Architectural fit understood
- ✅ Completeness > 80% to proceed
- ✅ No major ambiguities remain

## Rules

**DO**:
- ✅ Use codebase search to find relevant components
- ✅ Be explicit about what's in and out of scope
- ✅ Flag ambiguities immediately
- ✅ Reference similar implementations
- ✅ Consider all layers (API, service, data, UI)

**DON'T**:
- ❌ Don't assume scope - be explicit
- ❌ Don't skip codebase exploration
- ❌ Don't ignore existing patterns
- ❌ Don't proceed with low completeness (<70%)

## Edge Cases

**Scenario: Task is vague**
- Extract what you can
- List specific clarification questions
- Provide examples to help user clarify
- Mark completeness as low

**Scenario: No similar implementations exist**
- Mark as greenfield development
- Flag need for pattern establishment
- Increase complexity estimate

**Scenario: Multiple valid interpretations**
- List all interpretations
- Ask user to choose
- Provide pros/cons for each

