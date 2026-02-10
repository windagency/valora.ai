---
id: plan.identify-dependencies
version: 1.0.0
category: plan
experimental: true
name: Identify Dependencies
description: Map technical, data, and integration dependencies with execution order
tags:
  - dependency-mapping
  - technical-analysis
  - planning
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
  optional:
    - review.assess-constraints
    - onboard.map-dependencies
inputs:
  - name: task_scope
    description: Task scope from analyze-task-context
    type: object
    required: true
  - name: affected_components
    description: List of affected components
    type: array
    required: true
outputs:
  - technical_dependencies
  - data_dependencies
  - integration_dependencies
  - execution_order
  - clarifying_questions
tokens:
  avg: 3000
  max: 6000
  min: 2000
---

# Identify Dependencies

## Objective

Map all technical, data, and integration dependencies to understand what's needed and in what order work should be done.

## Context

Dependencies fall into three categories:
1. **Technical**: Libraries, frameworks, services needed
2. **Data**: Schemas, migrations, models required
3. **Integration**: External APIs, services, systems to connect

## Instructions

### Step 1: Identify Technical Dependencies

Map all code-level dependencies needed for implementation.

#### 1.1 Package Dependencies

**Analyze**:
- New packages to install
- Existing packages to upgrade
- Package conflicts to resolve

**Check**:
- `package.json`, `requirements.txt`, `pom.xml`, etc.
- Version compatibility
- Security vulnerabilities
- License compatibility

**Output**:
```json
{
  "new_packages": [
    {
      "name": "@sendgrid/mail",
      "version": "^7.7.0",
      "reason": "Email sending for verification",
      "alternatives": ["nodemailer", "aws-ses"]
    }
  ],
  "upgrades": [
    {
      "name": "jsonwebtoken",
      "current": "8.5.1",
      "target": "9.0.0",
      "reason": "Security fix for token validation",
      "breaking_changes": true
    }
  ],
  "conflicts": []
}
```

#### 1.2 Service Dependencies

**Identify**:
- Internal services needed (microservices, APIs)
- Shared libraries or modules
- Platform features (auth, logging, caching)

**For each service**:
```json
{
  "service": "UserService",
  "type": "internal",
  "reason": "Need to query user data",
  "availability": "ready",
  "version": "v2.3",
  "documentation": "docs/services/user-service.md"
}
```

#### 1.3 Platform Dependencies

**Check**:
- Runtime version (Node.js, Python, JVM)
- Framework features
- Browser compatibility requirements
- Operating system features

**Output**:
```json
{
  "runtime": {
    "name": "Node.js",
    "min_version": "18.0.0",
    "current": "20.10.0",
    "compatible": true
  },
  "browser_support": ["Chrome 90+", "Firefox 88+", "Safari 14+"],
  "os_features": []
}
```

#### 1.4 Code Module Dependencies

**Map**:
- Existing code modules to use
- Shared utilities
- Common patterns or abstractions

**Output**:
```json
{
  "modules": [
    {
      "name": "TokenGenerator",
      "path": "src/utils/token.ts",
      "reason": "Reuse existing token generation logic",
      "modifications_needed": false
    }
  ]
}
```

### Step 2: Identify Data Dependencies

Map all data-related requirements.

#### 2.1 Database Schema Changes

**Analyze**:
- New tables
- New columns on existing tables
- Indexes needed
- Constraints (foreign keys, unique, checks)
- Data type changes

**For each change**:
```json
{
  "type": "add_column",
  "table": "users",
  "details": {
    "column": "email_verified",
    "data_type": "boolean",
    "default": false,
    "nullable": false
  },
  "migration_complexity": "low",
  "backward_compatible": true
}
```

#### 2.2 Data Migrations

**Identify**:
- Backfill requirements (existing data)
- Data transformations
- Data volume considerations
- Downtime requirements

**Output**:
```json
{
  "migrations": [
    {
      "name": "backfill_email_verified",
      "description": "Set email_verified=true for existing users",
      "affected_rows": "~50,000",
      "estimated_duration": "< 1 minute",
      "requires_downtime": false,
      "rollback_strategy": "Set all to false"
    }
  ]
}
```

#### 2.3 State Management Dependencies

**For frontend/stateful applications**:
- State shape changes
- Reducers/actions to modify
- Persistence requirements (localStorage, sessionStorage)
- Cache invalidation

**Output**:
```json
{
  "state_changes": [
    {
      "slice": "auth",
      "changes": "Add emailVerified field to user state",
      "impact": "medium",
      "backward_compatible": true
    }
  ]
}
```

#### 2.4 Data Validation Rules

**Identify**:
- Validation schemas to create/update
- Business rules for data
- Constraints enforcement

**Output**:
```json
{
  "validation": [
    {
      "entity": "User",
      "rules": [
        "Email must be valid format",
        "Email must be unique",
        "Verification token must be 32 characters"
      ],
      "library": "zod"
    }
  ]
}
```

### Step 3: Identify Integration Dependencies

Map external systems and services.

#### 3.1 External APIs

**For each API**:
```json
{
  "api": "SendGrid Email API",
  "type": "third-party",
  "purpose": "Send verification emails",
  "documentation": "https://docs.sendgrid.com",
  "authentication": "API key",
  "rate_limits": "100 requests/second",
  "quota": "100,000 emails/month (current plan)",
  "sla": "99.95% uptime",
  "fallback": "Queue for retry if down"
}
```

#### 3.2 Authentication & Authorization

**Check**:
- Auth mechanism changes
- New permissions/roles
- OAuth scopes
- API keys or secrets needed

**Output**:
```json
{
  "auth_changes": [
    {
      "type": "middleware",
      "name": "requireEmailVerified",
      "purpose": "Block unverified users from protected routes",
      "implementation": "Check user.emailVerified flag"
    }
  ],
  "secrets_needed": [
    {
      "name": "SENDGRID_API_KEY",
      "purpose": "Authenticate with SendGrid",
      "storage": "environment variable"
    }
  ]
}
```

#### 3.3 Event Systems

**If using events/webhooks**:
- Events to emit
- Events to consume
- Event schema
- Message queue configuration

**Output**:
```json
{
  "events": [
    {
      "name": "user.email.verified",
      "emitted_by": "AuthService",
      "consumed_by": ["NotificationService", "AnalyticsService"],
      "payload": {
        "userId": "string",
        "email": "string",
        "verifiedAt": "datetime"
      }
    }
  ]
}
```

#### 3.4 Third-Party Integrations

**Map**:
- Analytics services
- Monitoring/logging
- Feature flags
- Payment providers
- Other SaaS tools

**Output**:
```json
{
  "integrations": [
    {
      "service": "Mixpanel",
      "purpose": "Track email verification events",
      "changes_needed": "Add new event tracking"
    }
  ]
}
```

### Step 4: Establish Execution Order

Determine the sequence of implementation based on dependencies.

#### 4.1 Dependency Graph

Build a directed graph:
- Nodes = implementation steps
- Edges = dependencies (A → B means B depends on A)

**Example**:
```
DB Schema → Data Models → API Layer → Frontend → Tests → Docs
```

#### 4.2 Prerequisite Relationships

**Types**:
1. **Hard Prerequisite**: Must be done first (blocking)
2. **Soft Prerequisite**: Better if done first (recommended)
3. **Parallel**: Can be done simultaneously

**Output**:
```json
{
  "execution_order": [
    {
      "step": 1,
      "tasks": ["Create database migration", "Add SendGrid API key to config"],
      "type": "parallel",
      "reason": "No dependencies, can run in parallel"
    },
    {
      "step": 2,
      "tasks": ["Update User model"],
      "type": "sequential",
      "depends_on": ["Create database migration"],
      "reason": "Model needs schema to exist"
    },
    {
      "step": 3,
      "tasks": ["Implement AuthService verification logic", "Create email template"],
      "type": "parallel",
      "depends_on": ["Update User model"],
      "reason": "Both need model, but independent of each other"
    },
    {
      "step": 4,
      "tasks": ["Add API endpoints"],
      "type": "sequential",
      "depends_on": ["Implement AuthService verification logic"],
      "reason": "API calls service methods"
    },
    {
      "step": 5,
      "tasks": ["Update frontend components"],
      "type": "sequential",
      "depends_on": ["Add API endpoints"],
      "reason": "Frontend calls API"
    },
    {
      "step": 6,
      "tasks": ["Write tests", "Update documentation"],
      "type": "parallel",
      "depends_on": ["Update frontend components"],
      "reason": "Both need implementation complete, but independent"
    }
  ]
}
```

#### 4.3 Critical Path

Identify the longest dependency chain:

**Output**:
```json
{
  "critical_path": [
    "DB migration",
    "User model",
    "AuthService logic",
    "API endpoints",
    "Frontend components",
    "Tests"
  ],
  "estimated_duration": "~15 hours"
}
```

#### 4.4 Parallel Opportunities

Identify work that can be done simultaneously:

**Output**:
```json
{
  "parallel_work": [
    {
      "stream": "Backend",
      "tasks": ["AuthService", "Email template"],
      "can_parallel_with": "Frontend mockup work"
    },
    {
      "stream": "Documentation",
      "tasks": ["API docs", "User guide"],
      "can_parallel_with": "Any implementation work"
    }
  ]
}
```

### Step 5: Validate Dependencies

Check for issues:

#### 5.1 Circular Dependencies

Detect cycles in dependency graph and suggest resolution.

#### 5.2 Missing Dependencies

Identify if any expected dependencies are missing.

#### 5.3 Version Conflicts

Check for incompatible version requirements.

#### 5.4 Security & Licensing

Flag security vulnerabilities or license issues in dependencies.

**Output**:
```json
{
  "validation": {
    "circular_dependencies": [],
    "missing_dependencies": [],
    "version_conflicts": [],
    "security_issues": [
      {
        "package": "jsonwebtoken@8.5.1",
        "severity": "medium",
        "issue": "CVE-2022-23529",
        "resolution": "Upgrade to 9.0.0"
      }
    ],
    "license_issues": []
  }
}
```

## Clarifying Questions

When critical dependency decisions require user input, generate clarifying questions. Questions will be presented interactively before proceeding.

### When to Include Questions

Include `clarifying_questions` when:
- Multiple package alternatives exist with significant trade-offs
- External API choices need to be made (e.g., which email provider)
- Database or storage decisions affect architecture
- Version pinning decisions have security/stability trade-offs

### Question Format

Each question must have:
- `id`: Unique identifier (e.g., "deps_q1")
- `question`: Clear question text
- `options`: Array of 2-4 predefined answer choices
- `priority`: "P0" (Critical), "P1" (Important), or "P2" (Minor)
- `context`: Optional explanation of impact

**Example**:
```json
{
  "clarifying_questions": [
    {
      "id": "deps_q1",
      "question": "Which email service provider should be used?",
      "options": [
        "SendGrid (current team experience)",
        "AWS SES (lower cost, AWS integration)",
        "Mailgun (simpler API)"
      ],
      "priority": "P0",
      "context": "Affects package dependencies and integration complexity"
    }
  ]
}
```

## Output Format

```json
{
  "technical_dependencies": {
    "packages": {
      "new": [
        {
          "name": "@sendgrid/mail",
          "version": "^7.7.0",
          "reason": "Email sending for verification"
        }
      ],
      "upgrades": [],
      "conflicts": []
    },
    "services": [
      {
        "name": "UserService",
        "type": "internal",
        "availability": "ready"
      }
    ],
    "platform": {
      "runtime": "Node.js >= 18.0.0",
      "browsers": ["Chrome 90+", "Firefox 88+"]
    },
    "modules": [
      {
        "name": "TokenGenerator",
        "path": "src/utils/token.ts"
      }
    ]
  },
  "data_dependencies": {
    "schema_changes": [
      {
        "type": "add_column",
        "table": "users",
        "details": {
          "column": "email_verified",
          "type": "boolean",
          "default": false
        }
      }
    ],
    "migrations": [
      {
        "name": "backfill_email_verified",
        "affected_rows": "~50,000",
        "requires_downtime": false
      }
    ],
    "state_management": [],
    "validation": [
      {
        "entity": "User",
        "rules": ["Email must be valid format"]
      }
    ]
  },
  "integration_dependencies": {
    "external_apis": [
      {
        "api": "SendGrid Email API",
        "rate_limits": "100 req/s",
        "authentication": "API key"
      }
    ],
    "auth": {
      "secrets_needed": ["SENDGRID_API_KEY"]
    },
    "events": [],
    "third_party": []
  },
  "execution_order": {
    "steps": [
      {
        "step": 1,
        "tasks": ["Create DB migration"],
        "type": "sequential"
      }
    ],
    "critical_path": ["DB migration", "Model update", "Service logic", "API", "Frontend"],
    "parallel_opportunities": ["Frontend mockup work can start early"]
  },
  "validation": {
    "circular_dependencies": [],
    "missing_dependencies": [],
    "version_conflicts": [],
    "security_issues": [],
    "license_issues": []
  },
  "clarifying_questions": []
}
```

**Note**: Include `clarifying_questions` array even if empty. Populate when dependency decisions require user preference.

## Success Criteria

- ✅ All technical dependencies mapped (packages, services, platform)
- ✅ Data dependencies identified (schema, migrations, validation)
- ✅ Integration dependencies documented (APIs, auth, events)
- ✅ Execution order established with prerequisites
- ✅ Critical path identified
- ✅ Parallel work opportunities noted
- ✅ Dependencies validated (no cycles, no conflicts)

## Rules

**DO**:
- ✅ Check existing codebase for reusable modules
- ✅ Identify version compatibility issues
- ✅ Flag security vulnerabilities
- ✅ Map execution order based on actual dependencies
- ✅ Identify parallel work opportunities

**DON'T**:
- ❌ Don't assume packages are available without checking
- ❌ Don't ignore version compatibility
- ❌ Don't skip security checks
- ❌ Don't create artificial sequential dependencies
- ❌ Don't miss parallel work opportunities

