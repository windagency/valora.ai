---
id: review.assess-constraints
version: 1.0.0
category: review
experimental: true
name: Assess Constraints
description: Identify technical, performance, security, and infrastructure constraints
tags:
  - constraints
  - limitations
  - requirements
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
    - gpt-5-thinking-high
agents:
  - lead
dependencies:
  requires:
    - context.use-modern-cli-tools
    - context.scan-codebase
    - onboard.analyze-patterns
    - onboard.map-dependencies
inputs:
  - name: tech_stack
    description: Tech stack from scan-codebase
    type: object
    required: true
  - name: patterns
    description: Coding patterns from analyze-patterns
    type: object
    required: true
  - name: dependencies
    description: External dependencies from map-dependencies
    type: object
    required: true
outputs:
  - technical_constraints
  - performance_considerations
  - security_requirements
tokens:
  avg: 4000
  max: 8000
  min: 2000
---

# Assess Constraints

## Objective

Identify technical limitations, performance targets, security requirements, and other constraints affecting implementation.

## Instructions

### Step 1: Performance Constraints

Identify existing performance targets and bottlenecks:

**Look for**:
- Documented SLAs or performance requirements
- Monitoring configs with thresholds
- Load testing or benchmark results
- Performance-related comments in code

**Document**:
```json
{
  "response_time": {
    "api_endpoints": "< 500ms (p95)",
    "page_load": "< 2s",
    "database_queries": "< 100ms"
  },
  "throughput": {
    "requests_per_second": "1000",
    "concurrent_users": "10000"
  },
  "resource_limits": {
    "memory": "512MB per container",
    "cpu": "2 cores",
    "storage": "10GB"
  },
  "known_bottlenecks": [
    {
      "area": "Database queries",
      "issue": "N+1 query problem in user listing",
      "workaround": "Added eager loading"
    }
  ]
}
```

### Step 2: Security Requirements & Constraints

Document security requirements:

**Authentication & Authorization**:
- Auth mechanism (JWT, Sessions, OAuth)
- Authorization model (RBAC, ABAC, ACL)
- User roles and permissions
- Protected routes/endpoints

**Data Security**:
- Encryption (at rest, in transit, TLS version)
- Sensitive data handling (PII, passwords, tokens)
- Secrets management (env vars, vault, KMS)
- CORS policy
- CSP headers

**Security Practices**:
- Input validation and sanitization
- SQL injection prevention
- XSS prevention
- CSRF protection
- Rate limiting
- Security headers

**Output**:
```json
{
  "authentication": {
    "mechanism": "JWT with refresh tokens",
    "authorization": "RBAC",
    "roles": ["admin", "user", "guest"]
  },
  "data_security": {
    "encryption_at_rest": true,
    "encryption_in_transit": "TLS 1.3",
    "secrets_management": "Environment variables"
  },
  "security_practices": [
    "Input validation with Zod",
    "SQL injection prevention via ORM",
    "Rate limiting: 100 req/min per IP"
  ]
}
```

### Step 3: Technology Constraints

**Language & Framework Limitations**:
- Language version and known limitations
- Framework version and breaking changes
- Browser support requirements
- Runtime version (Node.js, Python, etc.)
- Deprecated features to avoid

**Third-Party Service Limitations**:
- API rate limits
- Quota restrictions
- Feature limitations on current plan
- SLA guarantees

**Output**:
```json
{
  "language_framework": {
    "typescript": "5.0.0",
    "react": "18.2.0",
    "node": "20.x",
    "limitations": [
      "TypeScript decorators experimental",
      "React 18 requires updated testing patterns"
    ]
  },
  "third_party_limits": [
    {
      "service": "Stripe API",
      "rate_limit": "100 req/sec",
      "plan": "Standard",
      "limitations": ["No custom webhook endpoints on Standard plan"]
    }
  ],
  "browser_support": ["Chrome 90+", "Firefox 88+", "Safari 14+"]
}
```

### Step 4: Infrastructure Constraints

**Deployment Environment**:
- Platform (AWS, GCP, Azure, Heroku, Vercel)
- Container orchestration (Docker, Kubernetes, ECS)
- Scaling strategy (horizontal, vertical, auto-scaling)
- Region/availability zones
- Network restrictions (VPC, firewall, IP whitelist)

**CI/CD Pipeline**:
- Build time
- Deployment frequency
- Rollback strategy
- Deployment gates (tests, approvals)

**Output**:
```json
{
  "platform": {
    "provider": "AWS",
    "orchestration": "ECS",
    "scaling": "Auto-scaling (2-10 instances)",
    "regions": ["us-east-1", "eu-west-1"]
  },
  "ci_cd": {
    "build_time": "~5 minutes",
    "deployment_frequency": "Multiple times per day",
    "rollback_strategy": "Blue-green deployment"
  }
}
```

### Step 5: Compliance & Regulatory Constraints

Look for:
- Data residency requirements
- Compliance standards (GDPR, HIPAA, SOC2, PCI-DSS)
- Audit logging requirements
- Data retention policies
- Privacy requirements

**Output**:
```json
{
  "compliance": ["GDPR", "SOC2"],
  "data_residency": "EU only",
  "audit_logging": "All user actions logged",
  "retention": "User data kept for 7 years"
}
```

### Step 6: Development Constraints

**Code Quality Gates**:
- Test coverage requirements
- Linting enforcement
- Code review requirements
- Branch protection rules

**Known Technical Debt**:
- Document known issues and planned resolutions

**Output**:
```json
{
  "quality_gates": {
    "test_coverage": "80% minimum",
    "linting": "ESLint enforced (warnings allowed)",
    "code_review": "2 approvals required",
    "branch_protection": "main branch protected"
  },
  "technical_debt": [
    {
      "issue": "Legacy authentication system",
      "impact": "high",
      "planned_resolution": "Migrate to OAuth2 in Q2"
    }
  ]
}
```

## Output Format

```json
{
  "technical_constraints": {
    "language_framework": {
      "typescript": "5.0.0",
      "limitations": ["Decorators experimental"]
    },
    "third_party": [
      {
        "service": "Stripe",
        "rate_limit": "100/sec",
        "plan_limitations": ["No custom webhooks"]
      }
    ],
    "browser_support": ["Chrome 90+", "Firefox 88+"]
  },
  "performance_considerations": {
    "targets": {
      "api_response": "< 500ms (p95)",
      "page_load": "< 2s"
    },
    "resource_limits": {
      "memory": "512MB",
      "cpu": "2 cores"
    },
    "bottlenecks": [
      {
        "area": "Database",
        "issue": "N+1 queries",
        "mitigation": "Eager loading"
      }
    ]
  },
  "security_requirements": {
    "authentication": {
      "mechanism": "JWT",
      "model": "RBAC"
    },
    "encryption": {
      "at_rest": true,
      "in_transit": "TLS 1.3"
    },
    "practices": [
      "Input validation",
      "Rate limiting: 100/min"
    ]
  },
  "infrastructure": {
    "platform": "AWS ECS",
    "scaling": "Auto-scaling (2-10)",
    "regions": ["us-east-1"]
  },
  "compliance": {
    "standards": ["GDPR", "SOC2"],
    "data_residency": "EU only"
  },
  "development": {
    "quality_gates": {
      "coverage": "80%",
      "reviews": "2 approvals"
    },
    "technical_debt": [
      {
        "issue": "Legacy auth",
        "impact": "high"
      }
    ]
  }
}
```

## Success Criteria

- ✅ Performance targets documented
- ✅ Security requirements identified
- ✅ Technology limitations noted
- ✅ Infrastructure constraints captured
- ✅ Compliance requirements documented
- ✅ Development constraints listed
- ✅ Known technical debt flagged

## Rules

**DO**:
- ✅ Look for documented requirements in configs
- ✅ Check monitoring thresholds
- ✅ Document known bottlenecks
- ✅ Flag security requirements
- ✅ Note third-party limitations

**DON'T**:
- ❌ Don't assume constraints without evidence
- ❌ Don't skip infrastructure details
- ❌ Don't ignore compliance requirements
- ❌ Don't forget about technical debt

