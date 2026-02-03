---
id: context.load-implementation-context
version: 1.0.0
category: context
experimental: true
name: Load Implementation Context
description: Parse implementation plan and prepare context for execution
tags:
  - implementation
  - context-loading
  - parsing
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
    - gpt-5-thinking-high
agents:
  - software-engineer-typescript-backend
  - software-engineer-typescript-frontend
  - platform-engineer
  - secops-engineer
dependencies:
  requires: []
inputs:
  - name: implementation_plan
    description: Path to implementation plan or plan content
    type: string
    required: true
  - name: agent_type
    description: Type of engineer performing implementation
    type: string
    required: false
    validation:
      enum: ["software-engineer-typescript-backend", "software-engineer-typescript-frontend", "platform-engineer", "secops-engineer"]
  - name: mode
    description: Implementation mode
    type: string
    required: false
    default: "standard"
    validation:
      enum: ["standard", "step-by-step"]
  - name: current_step
    description: Current step number for step-by-step mode
    type: number
    required: false
outputs:
  - plan_summary
  - target_files
  - implementation_scope
  - dependencies
  - testing_strategy
  - agent_profile
tokens:
  avg: 2500
  max: 5000
  min: 1500
---

# Load Implementation Context

## Objective

Parse the implementation plan and prepare focused context for code execution based on agent type and implementation mode.

## Context

You are preparing to implement changes. Extract relevant information from the plan based on:
- **Agent type**: Determines which sections and patterns are most relevant
- **Implementation mode**: standard (full) or step-by-step (incremental)
- **Current step**: If in step-by-step mode, which step to focus on

## Instructions

### Step 1: Load and Parse Plan

Read the implementation plan from `implementation_plan` input.

**CRITICAL VALIDATION**:
1. **File must exist at the exact path specified** - If the file does not exist at the path provided in `implementation_plan`, you MUST immediately stop and output an error response. Do NOT search for alternative files or fallback to other plan files.

2. If `read_file` fails with "File not found", output:
```json
{
  "error": "PLAN_NOT_FOUND",
  "message": "Implementation plan file not found: <path>",
  "suggestion": "Verify the file path exists. Use 'valora plan <task>' to create a new plan."
}
```

3. Do NOT:
   - Search for similar files
   - Use a different plan file
   - Proceed without a valid plan

**After confirming file exists**:
- Contains required sections (Task Overview, Implementation Steps)
- Matches expected format

**Extract**:
```json
{
  "task_title": "...",
  "task_description": "...",
  "complexity_score": 6.5,
  "implementation_mode": "standard|step-by-step",
  "total_steps": 8
}
```

### Step 2: Determine Implementation Scope

Based on `mode` and `current_step`:

**For standard mode**:
- Scope = entire plan
- All steps executed in single pass

**For step-by-step mode**:
- Scope = single step from Implementation Steps section
- Extract step N details:
  ```json
  {
    "step_number": 3,
    "step_title": "Add email verification endpoint",
    "step_description": "...",
    "affected_files": ["src/routes/auth.ts", "src/services/email.ts"],
    "dependencies": ["Step 1", "Step 2"],
    "validation_criteria": ["Endpoint returns 200", "Email sent successfully"]
  }
  ```

### Step 3: Load Agent Profile

Based on `agent_type`, identify relevant focus areas:

**software-engineer-typescript-backend**:
- Focus: APIs, business logic, databases, data processing
- Patterns: RESTful design, database migrations, error handling
- Concerns: Performance, scalability, data integrity

**software-engineer-typescript-frontend**:
- Focus: UI components, state management, accessibility, UX
- Patterns: Component composition, state patterns, responsive design
- Concerns: Performance, accessibility, browser compatibility

**platform-engineer**:
- Focus: Infrastructure, CI/CD, containers, deployment
- Patterns: Infrastructure-as-code, containerization, orchestration
- Concerns: Reliability, observability, security

**secops-engineer**:
- Focus: Security features, authentication, authorization
- Patterns: Security best practices, threat modeling, hardening
- Concerns: Vulnerabilities, compliance, data protection

**Output**:
```json
{
  "agent_type": "software-engineer-typescript-backend",
  "focus_areas": ["APIs", "business logic", "databases"],
  "key_patterns": ["RESTful design", "error handling"],
  "quality_concerns": ["performance", "data integrity"]
}
```

### Step 4: Identify Target Files

Extract files to be modified/created:

**From Implementation Steps**:
- List all files mentioned in steps
- Categorize by operation: create, modify, delete
- Identify file types and technologies

**Output**:
```json
{
  "target_files": [
    {
      "path": "src/routes/auth.ts",
      "operation": "modify",
      "file_type": "typescript",
      "purpose": "Add verification endpoint"
    },
    {
      "path": "src/services/email.ts",
      "operation": "create",
      "file_type": "typescript",
      "purpose": "Email service implementation"
    }
  ]
}
```

### Step 5: Extract Dependencies

From plan's Dependencies section:

```json
{
  "dependencies": {
    "technical": [
      {"name": "nodemailer", "version": "^6.9.0", "purpose": "Email sending"}
    ],
    "data": [
      {"type": "schema_change", "table": "users", "migration": "add_email_verified"}
    ],
    "external": [
      {"service": "SendGrid API", "availability": "required"}
    ],
    "prerequisite_steps": [1, 2]
  }
}
```

### Step 6: Extract Testing Strategy

From plan's Testing Strategy section:

```json
{
  "testing_strategy": {
    "test_types": ["unit", "integration"],
    "test_scenarios": {
      "happy_path": [
        "User receives verification email",
        "Valid token verifies email"
      ],
      "error_cases": [
        "Invalid token rejected",
        "Expired token rejected"
      ],
      "edge_cases": [
        "Duplicate verification attempts"
      ]
    },
    "coverage_target": "80%",
    "test_files_to_create": [
      "src/routes/auth.test.ts",
      "src/services/email.test.ts"
    ]
  }
}
```

### Step 7: Prepare Plan Summary

Create concise summary for context retention:

```json
{
  "plan_summary": {
    "task": "Add email verification to user registration",
    "complexity": 6.5,
    "mode": "standard",
    "total_steps": 8,
    "current_step": null,
    "estimated_effort": "4-6 hours",
    "key_risks": [
      "Email service integration failure",
      "Token security vulnerabilities"
    ],
    "acceptance_criteria": [
      "Users receive verification email",
      "Email verification rate > 80%"
    ]
  }
}
```

### Step 8: Apply Agent Filter

Filter plan content based on agent specialization:

**For backend engineer**:
- Emphasize: API implementation, database changes, business logic
- De-emphasize: UI/UX details (note but don't focus)

**For frontend engineer**:
- Emphasize: Component implementation, state management, accessibility
- De-emphasize: Backend API details (use as contracts)

**For platform engineer**:
- Emphasize: Infrastructure changes, deployment updates, CI/CD
- De-emphasize: Application code details

**For secops engineer**:
- Emphasize: Security requirements, authentication, authorization
- De-emphasize: Non-security features (context only)

## Output Format

```json
{
  "plan_summary": {
    "task": "Add email verification",
    "complexity": 6.5,
    "mode": "standard",
    "total_steps": 8,
    "current_step": null
  },
  "target_files": [
    {
      "path": "src/routes/auth.ts",
      "operation": "modify",
      "file_type": "typescript",
      "purpose": "Add verification endpoint"
    }
  ],
  "implementation_scope": {
    "mode": "standard",
    "steps_to_implement": [1, 2, 3, 4, 5, 6, 7, 8],
    "current_step_details": null,
    "focused_areas": ["API endpoints", "Email service integration", "Database migration"]
  },
  "dependencies": {
    "technical": [...],
    "data": [...],
    "external": [...]
  },
  "testing_strategy": {
    "test_types": ["unit", "integration"],
    "test_scenarios": {...},
    "coverage_target": "80%"
  },
  "agent_profile": {
    "agent_type": "software-engineer-typescript-backend",
    "focus_areas": ["APIs", "business logic", "databases"],
    "key_patterns": ["RESTful design", "error handling"]
  }
}
```

## Success Criteria

- ✅ Plan successfully loaded and parsed
- ✅ Implementation scope determined based on mode
- ✅ Target files identified with operations
- ✅ Dependencies extracted
- ✅ Testing strategy captured
- ✅ Agent profile loaded
- ✅ Plan summary prepared for context retention

## Rules

**DO**:
- ✅ Extract only relevant information for current agent and step
- ✅ Preserve exact file paths and technical requirements
- ✅ Identify all dependencies and prerequisites
- ✅ Note agent-specific patterns and concerns

**DON'T**:
- ❌ Don't execute implementation yet (preparation only)
- ❌ Don't infer missing plan sections
- ❌ Don't make assumptions about file structure
- ❌ Don't modify plan requirements

