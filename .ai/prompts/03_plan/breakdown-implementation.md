---
id: plan.breakdown-implementation
version: 1.0.0
category: plan
experimental: true
name: Breakdown Implementation
description: Create step-by-step implementation plan with validation criteria
tags:
  - implementation-planning
  - task-breakdown
  - execution-planning
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
    - gpt-5-thinking-high
agents:
  - lead
dependencies:
  requires:
    - context.analyze-task-context
    - plan.assess-complexity
    - plan.identify-dependencies
    - plan.assess-risks
inputs:
  - name: task_scope
    description: Task scope from analyze-task-context
    type: object
    required: true
  - name: complexity_score
    description: Complexity score from assess-complexity
    type: number
    required: true
  - name: dependencies
    description: Dependencies from identify-dependencies
    type: object
    required: true
  - name: risks
    description: Risks from assess-risks
    type: object
    required: true
  - name: mode
    description: Implementation mode (standard or incremental)
    type: string
    required: true
    validation:
      enum: ["standard", "incremental"]
outputs:
  - implementation_steps
  - estimated_effort
  - testing_strategy
  - rollback_strategy
tokens:
  avg: 5000
  max: 10000
  min: 3000
---

# Breakdown Implementation

## Objective

Create a detailed, actionable implementation plan with clear steps, validation criteria, testing strategy, and rollback procedures.

## Context

This prompt synthesizes all prior analysis (scope, complexity, dependencies, risks) into an executable plan.

**Mode determines granularity**:
- **Standard**: High-level phases, single PR
- **Incremental**: Detailed steps, multiple PRs

## Planning Mode Selection (Optimization)

**Purpose**: Route tasks to appropriate planning depth based on complexity.

### Complexity-Based Routing

Check `complexity_score` input:

```plaintext
IF complexity_score < 3 (TRIVIAL):
  → Use EXPRESS PLANNING (Steps 0.1-0.3 below)
  → Skip deep analysis
  → Time: 2-3 min vs 13-15 min
  → Savings: 10-12 min

ELSE IF complexity_score >= 3:
  → Use STANDARD PLANNING (Steps 1-7 below)
  → Full detailed analysis
  → Time: 13-15 min
```

### Step 0: Express Planning for Trivial Tasks

**When**: `complexity_score < 3`

**Characteristics of trivial tasks**:
- 1-3 files affected
- < 100 lines of code
- No database changes
- No new dependencies
- No integration points
- Low risk (score 1-2)
- Examples: Fix typo, add simple validation, update configuration

#### Step 0.1: Create Lightweight Implementation Steps

```json
{
  "planning_mode": "express",
  "complexity_score": 2.1,
  "implementation_steps": [
    {
      "step": 1,
      "title": "Update validation schema",
      "file": "src/validators/user.validator.ts",
      "actions": [
        "Import email validation helper",
        "Add email format check to userSchema",
        "Export updated validator"
      ],
      "validation": "Run validator tests, ensure email validation works",
      "estimate_minutes": 15
    },
    {
      "step": 2,
      "title": "Add unit tests",
      "file": "tests/unit/validators/user.validator.test.ts",
      "actions": [
        "Add test for valid email",
        "Add test for invalid email"
      ],
      "validation": "Tests pass with 100% coverage",
      "estimate_minutes": 10
    }
  ],
  "total_steps": 2
}
```

**Keep it simple**:
- 2-4 steps maximum
- File-level granularity (not sub-operations)
- Brief action lists (3-5 bullet points per step)
- Quick validation criteria

#### Step 0.2: Minimal Testing Strategy

```json
{
  "testing_strategy": {
    "unit_tests": {
      "files": ["tests/unit/validators/user.validator.test.ts"],
      "scenarios": [
        "Valid email passes validation",
        "Invalid email fails validation",
        "Edge case: email with special characters"
      ],
      "coverage_target": "100% for changed functions"
    },
    "integration_tests": null,
    "e2e_tests": null
  }
}
```

**Skip**:
- Integration tests (if not needed)
- E2E tests (for backend-only changes)
- Performance tests
- Security tests (unless auth-related)

#### Step 0.3: Simple Rollback & Effort

```json
{
  "rollback_strategy": {
    "method": "git revert",
    "steps": ["Revert commit", "Verify tests pass"],
    "estimated_time": "< 2 minutes"
  },
  "effort_estimate": {
    "total_minutes": 30,
    "breakdown": {
      "implementation": 15,
      "testing": 10,
      "review": 5
    },
    "confidence": "high",
    "assumptions": [
      "Simple change with no dependencies",
      "Validator pattern already exists"
    ]
  }
}
```

**Express planning output complete** - skip to Step 7 for final assembly.

**Time saved**: 10-12 minutes per trivial task.

---

## Instructions

### Step 1: Organize Implementation Phases

Group work into logical phases based on dependencies and architecture.

#### Standard Phases

**Phase 1: Preparation**
- Setup prerequisites
- Configuration changes
- Environment setup

**Phase 2: Data Layer**
- Database migrations
- Model updates
- Data validation

**Phase 3: Business Logic**
- Service layer implementation
- Core algorithms
- Business rules

**Phase 4: API/Interface Layer**
- API endpoints
- Request/response handling
- Middleware

**Phase 5: Presentation Layer (if applicable)**
- UI components
- State management
- User interactions

**Phase 6: Integration**
- Connect layers
- End-to-end flows
- Error handling

**Phase 7: Testing & Quality**
- Unit tests
- Integration tests
- E2E tests

**Phase 8: Documentation & Deployment**
- Code documentation
- API documentation
- Deployment preparation

### Step 2: Break Down Into Steps

For each phase, create specific, actionable steps.

#### Step Requirements

Each step MUST have:

1. **Clear Action**: What to do (verb + object)
2. **Files/Components**: Where to make changes
3. **Expected Outcome**: What should work after
4. **Validation Criteria**: How to verify it's done correctly

#### Step Template

```json
{
  "step": 1.1,
  "phase": "Preparation",
  "action": "Add SENDGRID_API_KEY to environment configuration",
  "files": [
    ".env.example",
    ".env.staging",
    ".env.production",
    "README.md"
  ],
  "estimated_time": "15 minutes",
  "description": "Add SendGrid API key configuration to environment files and document setup instructions",
  "expected_outcome": "API key configurable via environment variable",
  "validation": [
    "SENDGRID_API_KEY present in .env.example",
    "README documents how to obtain and set API key",
    "Application reads API key from process.env"
  ],
  "dependencies": [],
  "risks": [],
  "rollback": "Remove environment variable"
}
```

#### Granularity by Mode

**Standard Mode**:
- Broad steps (e.g., "Implement email verification service")
- Grouped related changes
- Fewer, larger steps

**Incremental Mode**:
- Atomic steps (e.g., "Add generateToken method to TokenService")
- Single responsibility per step
- Each step is independently reviewable
- More, smaller steps

### Step 3: Establish Dependencies Between Steps

For each step, identify prerequisites:

**Dependency Types**:
- **Hard**: Step B cannot start until Step A is complete
- **Soft**: Step B is easier after Step A (but not blocked)
- **None**: Step can start anytime

**Example**:
```json
{
  "step": 2.2,
  "action": "Update User model with email verification fields",
  "dependencies": [
    {
      "step": 2.1,
      "type": "hard",
      "reason": "Model needs schema to exist"
    }
  ]
}
```

### Step 4: Add Validation Criteria

For each step, define **how to verify** it's complete and correct.

**Validation Types**:

1. **Functional**: Does it work as expected?
   - "User can request verification email"
   - "Token validation succeeds with valid token"

2. **Technical**: Is code quality acceptable?
   - "Unit tests pass with >80% coverage"
   - "ESLint shows no errors"
   - "TypeScript compiles without errors"

3. **Integration**: Does it work with other components?
   - "API endpoint returns 200 on success"
   - "Frontend successfully calls backend API"

4. **Performance**: Does it meet performance requirements?
   - "Email sends in < 2 seconds"
   - "API response time < 500ms"

5. **Security**: Is it secure?
   - "Tokens are cryptographically random"
   - "Rate limiting prevents abuse"

**Example**:
```json
{
  "step": 3.2,
  "validation": {
    "functional": [
      "generateToken() returns 32-character string",
      "validateToken() returns true for valid token",
      "validateToken() returns false for expired token"
    ],
    "technical": [
      "Unit tests cover all edge cases",
      "TypeScript types are correct",
      "No linting errors"
    ],
    "security": [
      "Tokens use crypto.randomBytes()",
      "Token expiration enforced"
    ]
  }
}
```

### Step 5: Estimate Effort

For each step, estimate time:

**Estimation Factors**:
- Complexity (simple, moderate, complex)
- Familiarity (known pattern vs. new territory)
- Testing requirements
- Documentation needs

**Effort Scale**:
- **XS**: 15-30 minutes (config change, simple addition)
- **S**: 30 minutes - 2 hours (single component, straightforward)
- **M**: 2-4 hours (multiple related changes)
- **L**: 4-8 hours (complex feature, multiple components)
- **XL**: 8+ hours (major feature, should be decomposed)

**For Incremental Mode**: No step should be > 4 hours (M)

**Example**:
```json
{
  "step": 3.3,
  "action": "Implement email verification service",
  "estimated_time": "3 hours",
  "effort": "M",
  "breakdown": {
    "implementation": "2 hours",
    "testing": "45 minutes",
    "documentation": "15 minutes"
  }
}
```

### Step 6: Define Testing Strategy

Specify testing at multiple levels.

#### Technology Stack Requirements (TypeScript Projects)

For TypeScript projects, the testing strategy MUST use the following mandatory stack:

| Test Type | Required Tool | Configuration | Notes |
|-----------|---------------|---------------|-------|
| **Unit Tests** | Vitest | `vitest.config.ts` | NEVER use Jest, Mocha, or other runners |
| **Integration Tests** | Vitest + Testcontainers | `vitest.config.ts` | Use Testcontainers for databases/services |
| **E2E Tests** | Playwright | `playwright.config.ts` | NEVER use Cypress, Puppeteer |
| **Package Manager** | pnpm | `pnpm-lock.yaml` | NEVER use npm or yarn |
| **Dev Environment** | devcontainer | `.devcontainer/` | Required for consistent environments |

**Enforcement Rules**:
- All test commands MUST use `pnpm test`, `pnpm run test:unit`, etc.
- Database integration tests MUST use Testcontainers for isolation
- E2E tests MUST use Playwright with proper configuration
- Plans MUST NOT propose alternative testing frameworks

#### Unit Tests (Vitest)

**For each component** (using Vitest):
```json
{
  "component": "TokenService",
  "test_file": "tests/services/token.service.test.ts",
  "framework": "vitest",
  "config_file": "vitest.config.ts",
  "scenarios": [
    {
      "scenario": "generateToken returns valid token",
      "test_cases": [
        "Token is 32 characters",
        "Token is URL-safe",
        "Token is unique on each call"
      ]
    },
    {
      "scenario": "validateToken handles expired tokens",
      "test_cases": [
        "Returns false for expired token",
        "Returns true for valid token",
        "Returns false for invalid format"
      ]
    }
  ],
  "coverage_target": "100%",
  "mocks_needed": ["Database", "Clock (for expiration testing)"],
  "run_command": "pnpm test:unit"
}
```

#### Integration Tests (Vitest + Testcontainers)

**For workflows** (using Vitest with Testcontainers for database/services):
```json
{
  "workflow": "Email verification flow",
  "test_file": "tests/integration/email-verification.test.ts",
  "framework": "vitest",
  "testcontainers": {
    "enabled": true,
    "containers": [
      {
        "type": "PostgreSQLContainer",
        "image": "postgres:16-alpine",
        "purpose": "Isolated database for integration tests"
      }
    ]
  },
  "scenarios": [
    {
      "scenario": "Complete verification flow",
      "steps": [
        "User registers with email",
        "Verification email sent",
        "User clicks token link",
        "Email marked as verified",
        "User can access protected features"
      ]
    },
    {
      "scenario": "Token expiration handling",
      "steps": [
        "Generate token",
        "Wait for expiration",
        "Attempt verification",
        "Verify rejection",
        "Request new token"
      ]
    }
  ],
  "mocks_needed": ["Email service (stub sends)"],
  "run_command": "pnpm test:integration"
}
```

#### E2E Tests (Playwright)

**For user journeys** (using Playwright):
```json
{
  "journey": "New user signup and verification",
  "test_file": "e2e/auth/signup-verification.spec.ts",
  "framework": "playwright",
  "config_file": "playwright.config.ts",
  "scenarios": [
    {
      "scenario": "Happy path signup",
      "steps": [
        "Navigate to signup page",
        "Fill registration form",
        "Submit form",
        "Verify email sent message displayed",
        "Open email (test inbox)",
        "Click verification link",
        "Verify success message",
        "Verify can access protected page"
      ]
    }
  ],
  "test_environment": "Staging with test email provider",
  "run_command": "pnpm test:e2e",
  "browsers": ["chromium", "firefox", "webkit"]
}
```

#### Acceptance Criteria

Overall success criteria for the feature:

```json
{
  "acceptance_criteria": [
    {
      "criterion": "New users receive verification email",
      "verification": "E2E test + manual smoke test"
    },
    {
      "criterion": "Users can verify email by clicking link",
      "verification": "E2E test"
    },
    {
      "criterion": "Unverified users blocked from protected features",
      "verification": "Integration test"
    },
    {
      "criterion": "Existing users unaffected",
      "verification": "Regression test suite"
    },
    {
      "criterion": "Email delivery rate > 95%",
      "verification": "Monitoring metrics"
    }
  ]
}
```

### Step 7: Define Rollback Strategy

For each major phase, document rollback:

#### Rollback Levels

**1. Feature Flag (Preferred)**
```json
{
  "strategy": "feature_flag",
  "flag_name": "email_verification_enabled",
  "rollback_action": "Set flag to false",
  "recovery_time": "Immediate (< 1 minute)",
  "data_impact": "None - data preserved for re-enabling"
}
```

**2. Code Revert**
```json
{
  "strategy": "code_revert",
  "rollback_action": "Revert PR #123 and redeploy",
  "recovery_time": "~15 minutes (CI/CD pipeline)",
  "data_impact": "None if backward compatible"
}
```

**3. Database Rollback**
```json
{
  "strategy": "database_rollback",
  "rollback_action": "Run down migration",
  "migration_file": "20241114_add_email_verification.down.sql",
  "recovery_time": "~5 minutes",
  "data_impact": "email_verified column dropped, verification data lost",
  "prerequisites": [
    "Code must be reverted first",
    "Verify no active verification flows"
  ],
  "testing": "Test rollback on staging first"
}
```

#### Rollback Decision Tree

```json
{
  "rollback_triggers": [
    {
      "condition": "Email delivery failure rate > 50%",
      "severity": "high",
      "action": "Disable feature flag immediately",
      "notification": "Alert on-call engineer"
    },
    {
      "condition": "Existing user auth broken",
      "severity": "critical",
      "action": "Immediate rollback (code + DB if needed)",
      "notification": "Page on-call + incident manager"
    },
    {
      "condition": "Signup conversion drops > 15%",
      "severity": "medium",
      "action": "Disable feature flag, analyze metrics",
      "notification": "Notify product team"
    }
  ]
}
```

### Step 8: Add Implementation Notes

For complex steps, provide guidance:

**Technical Hints**:
- Existing patterns to follow
- Libraries to use
- Architectural considerations

**Gotchas**:
- Common mistakes
- Edge cases to handle
- Platform-specific issues

**Example**:
```json
{
  "step": 3.3,
  "notes": {
    "patterns": "Follow existing password reset flow for token generation pattern (see src/api/password-reset.ts)",
    "libraries": "Use crypto.randomBytes() for token generation, not Math.random()",
    "gotchas": [
      "Remember to URL-encode tokens in email links",
      "Set Content-Type header for email HTML",
      "Handle email provider rate limits gracefully"
    ],
    "references": [
      "Password reset implementation (similar pattern)",
      "SendGrid API docs (https://docs.sendgrid.com/api-reference)"
    ]
  }
}
```

### Step 9: Calculate Critical Path

Identify the longest dependency chain:

```json
{
  "critical_path": [
    "2.1: Create DB migration",
    "2.2: Update User model",
    "3.2: Implement TokenService",
    "3.3: Implement EmailService",
    "4.1: Add verification API endpoints",
    "5.1: Update frontend auth flow",
    "7.1: Write integration tests"
  ],
  "estimated_duration": "14 hours",
  "parallel_opportunities": [
    {
      "tasks": ["7.2: Unit tests", "8.1: Documentation"],
      "can_start_after": "5.1",
      "saves_time": "~2 hours"
    }
  ]
}
```

## Output Format

```json
{
  "implementation_steps": [
    {
      "step": "1.1",
      "phase": "Preparation",
      "action": "Add SENDGRID_API_KEY to environment configuration",
      "files": [".env.example", "README.md"],
      "estimated_time": "15 minutes",
      "effort": "XS",
      "description": "Configure SendGrid API key in environment",
      "expected_outcome": "API key configurable via env var",
      "validation": {
        "functional": ["API key readable from process.env"],
        "technical": ["Documentation updated"]
      },
      "dependencies": [],
      "notes": {
        "gotchas": ["Store key in secrets manager, not committed to git"]
      }
    },
    {
      "step": "2.1",
      "phase": "Data Layer",
      "action": "Create database migration for email verification",
      "files": ["migrations/20241114_add_email_verification.sql"],
      "estimated_time": "1 hour",
      "effort": "S",
      "description": "Add email_verified, verification_token, token_expires_at columns to users table",
      "expected_outcome": "Schema supports email verification",
      "validation": {
        "functional": [
          "Migration runs successfully up and down",
          "Columns added with correct types and defaults"
        ],
        "technical": [
          "Migration tested on staging",
          "Rollback migration tested"
        ]
      },
      "dependencies": [],
      "rollback": {
        "strategy": "Run down migration",
        "recovery_time": "~2 minutes"
      }
    }
  ],
  "estimated_effort": {
    "total_time": "14 hours",
    "by_phase": {
      "preparation": "30 minutes",
      "data_layer": "2 hours",
      "business_logic": "4 hours",
      "api_layer": "2 hours",
      "presentation": "2 hours",
      "integration": "1 hour",
      "testing": "2 hours",
      "documentation": "30 minutes"
    },
    "confidence": "medium",
    "assumptions": [
      "Developer familiar with codebase",
      "SendGrid account already configured",
      "No major blockers or surprises"
    ],
    "buffer": "+20% for unknowns"
  },
  "testing_strategy": {
    "unit_tests": [
      {
        "component": "TokenService",
        "scenarios": 5,
        "coverage_target": "100%"
      }
    ],
    "integration_tests": [
      {
        "workflow": "Email verification flow",
        "scenarios": 3
      }
    ],
    "e2e_tests": [
      {
        "journey": "New user signup and verification",
        "scenarios": 2
      }
    ],
    "acceptance_criteria": [
      "New users receive verification email",
      "Users can verify via link",
      "Unverified users blocked from protected features",
      "Existing users unaffected"
    ]
  },
  "rollback_strategy": {
    "preferred_method": "Feature flag",
    "flag_name": "email_verification_enabled",
    "rollback_steps": [
      {
        "step": 1,
        "action": "Disable feature flag",
        "recovery_time": "Immediate"
      },
      {
        "step": 2,
        "action": "If data issues, revert code deployment",
        "recovery_time": "~15 minutes"
      },
      {
        "step": 3,
        "action": "If schema issues, run down migration",
        "recovery_time": "~5 minutes"
      }
    ],
    "rollback_triggers": [
      "Email delivery failure > 50%",
      "Existing user auth broken",
      "Signup conversion drop > 15%"
    ],
    "testing": "Rollback tested on staging before production"
  },
  "critical_path": {
    "steps": ["2.1", "2.2", "3.2", "3.3", "4.1", "5.1", "7.1"],
    "duration": "14 hours",
    "bottlenecks": ["4.1: API implementation (depends on all backend work)"]
  },
  "parallel_opportunities": [
    {
      "description": "Frontend can start with mocked API",
      "tasks": ["5.1", "5.2"],
      "can_parallel_with": ["3.2", "3.3", "4.1"],
      "time_saved": "~3 hours"
    }
  ]
}
```

## Success Criteria

- ✅ All steps are actionable (clear verb + object)
- ✅ Each step has validation criteria
- ✅ Dependencies between steps are explicit
- ✅ Effort estimates are realistic
- ✅ Testing strategy covers unit/integration/E2E
- ✅ Rollback strategy is documented
- ✅ Critical path identified
- ✅ Parallel work opportunities noted

### Technology Stack Compliance (TypeScript Projects)

For TypeScript projects, the plan MUST also satisfy:

- ✅ All commands use `pnpm` (no npm/yarn)
- ✅ devcontainer configuration is present or planned
- ✅ Unit/integration tests use Vitest
- ✅ E2E tests use Playwright
- ✅ Database/service tests use Testcontainers
- ✅ No alternative frameworks proposed (Jest, Cypress, Mocha, etc.)

## Rules

**DO**:
- ✅ Make steps atomic and focused
- ✅ Provide validation criteria for each step
- ✅ Estimate conservatively (add buffer)
- ✅ Document rollback procedures
- ✅ Identify parallel work opportunities
- ✅ Reference existing patterns

**DON'T**:
- ❌ Don't make steps too large (>4 hours in incremental mode)
- ❌ Don't skip validation criteria
- ❌ Don't forget rollback strategy
- ❌ Don't ignore testing requirements
- ❌ Don't create artificial sequential dependencies

## Edge Cases

**Scenario: Step dependencies form a cycle**
- Detect cycle
- Suggest breaking one dependency
- Consider refactoring to remove coupling

**Scenario: Critical path too long**
- Identify parallelization opportunities
- Suggest breaking into smaller deliverables
- Consider phased rollout

**Scenario: High uncertainty in estimates**
- Add larger buffer
- Consider spike/exploration step first
- Flag for incremental mode

