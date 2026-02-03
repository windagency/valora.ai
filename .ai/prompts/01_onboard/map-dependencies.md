---
id: onboard.map-dependencies
version: 1.0.0
category: onboard
experimental: true
name: Map Dependencies
description: Analyze internal and external dependencies and identify integration points
tags:
  - dependencies
  - integrations
  - third-party
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
inputs:
  - name: structure
    description: Codebase structure from scan-codebase
    type: object
    required: true
  - name: tech_stack
    description: Tech stack from scan-codebase
    type: object
    required: true
outputs:
  - internal_dependencies
  - external_dependencies
  - integration_points
tokens:
  avg: 4000
  max: 8000
  min: 2000
---

# Map Dependencies

## Objective

Create comprehensive dependency map (internal and external) and identify integration boundaries.

## Instructions

### Step 1: Analyze External Dependencies

From package files (`package.json`, `requirements.txt`, etc.):

**Categorize dependencies**:

1. **Production Dependencies**:
   - Dependency name and version
   - Purpose/usage
   - Critical: Yes/No
   - Used in: [Modules]
   - Migration risk: Low/Medium/High

2. **Development Dependencies**:
   - Tool name and purpose (testing, linting, building)

3. **Deprecated/Outdated**:
   - Current version vs latest
   - Security issues (if any)

**Key questions per major dependency**:
- Why is it used? (What problem does it solve?)
- Where is it used? (Which modules import it?)
- Known issues or limitations?

**Output**:
```json
{
  "production": [
    {
      "name": "express",
      "version": "4.18.2",
      "purpose": "HTTP server framework",
      "critical": true,
      "used_in": ["backend/api"],
      "migration_risk": "low"
    }
  ],
  "development": [
    {
      "name": "vitest",
      "version": "1.0.0",
      "purpose": "Unit testing"
    }
  ]
}
```

### Step 2: Map Internal Dependencies

**For each major module/package**:

```plaintext
Module: [Name]
Depends On:
- [Module A]: [Reason/usage]
- [Module B]: [Reason/usage]

Used By:
- [Module C]: [How it's used]
- [Module D]: [How it's used]

Coupling Level: Low / Medium / High
```

**Identify circular dependencies** (flag as technical debt)

**Output**:
```json
{
  "module_graph": {
    "frontend": {
      "depends_on": ["shared-utils"],
      "used_by": [],
      "coupling": "low"
    },
    "backend": {
      "depends_on": ["shared-utils", "database"],
      "used_by": [],
      "coupling": "medium"
    }
  },
  "circular_dependencies": []
}
```

### Step 3: Document Integration Points

**External Services/APIs**:

For each external integration:
- Service name
- Type (REST API, GraphQL, gRPC, WebSocket, Message Queue)
- Base URL/endpoint
- Authentication method
- Purpose
- Critical: Yes/No
- Failure handling strategy
- Rate limits (if known)
- Configuration location

**Databases**:
- Database type (PostgreSQL, MongoDB, Redis, etc.)
- Connection configuration location
- Schema location (migration files, models)
- ORM/Query builder
- Access patterns

**Third-Party Libraries/SDKs**:
- Payment gateways (Stripe, PayPal)
- Auth providers (Auth0, Firebase)
- Analytics (Google Analytics, Mixpanel)
- Monitoring (Sentry, Datadog)
- Communication (SendGrid, Twilio)

**Output**:
```json
{
  "external_services": [
    {
      "name": "Stripe API",
      "type": "REST API",
      "base_url": "https://api.stripe.com",
      "auth": "API Key",
      "purpose": "Payment processing",
      "critical": true,
      "rate_limit": "100 req/sec",
      "config": ".env (STRIPE_SECRET_KEY)"
    }
  ],
  "databases": [
    {
      "type": "PostgreSQL",
      "connection": "src/config/database.ts",
      "schema": "prisma/schema.prisma",
      "orm": "Prisma",
      "access_pattern": "Read-heavy"
    }
  ]
}
```

### Step 4: Identify Shared Libraries

Document shared utilities and libraries:

```plaintext
Shared Module: [Name]
- Location: [Path]
- Purpose: [What it provides]
- Used By: [List of modules]
- Stability: Stable / Evolving / Experimental
```

**Output**: List of shared modules with usage information

### Step 5: Document API Contracts

**Internal APIs**:
- REST endpoints or GraphQL schemas
- Request/response formats
- Validation rules
- Error codes

**External APIs** (consumed):
- Contract expectations
- Version used
- Breaking change risk

## Output Format

```json
{
  "internal_dependencies": {
    "module_graph": {
      "frontend": {
        "depends_on": ["shared-utils", "api-client"],
        "used_by": [],
        "coupling": "low"
      }
    },
    "shared_libraries": [
      {
        "name": "shared-utils",
        "path": "packages/shared-utils",
        "purpose": "Common utility functions",
        "used_by": ["frontend", "backend"],
        "stability": "stable"
      }
    ],
    "circular_dependencies": []
  },
  "external_dependencies": {
    "production": [
      {
        "name": "express",
        "version": "4.18.2",
        "purpose": "HTTP server",
        "critical": true,
        "used_in": ["backend"],
        "migration_risk": "low"
      }
    ],
    "development": [
      {
        "name": "vitest",
        "version": "1.0.0",
        "purpose": "Testing framework"
      }
    ],
    "deprecated": []
  },
  "integration_points": {
    "external_services": [
      {
        "name": "Stripe API",
        "type": "REST API",
        "auth": "API Key",
        "purpose": "Payments",
        "critical": true,
        "rate_limit": "100/sec"
      }
    ],
    "databases": [
      {
        "type": "PostgreSQL",
        "orm": "Prisma",
        "schema": "prisma/schema.prisma"
      }
    ],
    "internal_apis": [
      {
        "type": "REST",
        "base_path": "/api/v1",
        "documentation": "docs/API.md"
      }
    ]
  }
}
```

## Success Criteria

- ✅ External dependencies categorized and documented
- ✅ Internal module dependencies mapped
- ✅ External service integrations documented
- ✅ Database connections identified
- ✅ Shared libraries cataloged
- ✅ API contracts documented
- ✅ Circular dependencies identified (if any)
- ✅ Critical dependencies flagged

## Rules

**DO**:
- ✅ Categorize dependencies by type and purpose
- ✅ Flag critical dependencies
- ✅ Document integration authentication
- ✅ Identify rate limits and constraints
- ✅ Map module relationships

**DON'T**:
- ❌ Don't skip development dependencies
- ❌ Don't ignore deprecated packages
- ❌ Don't miss external service configs
- ❌ Don't overlook circular dependencies

