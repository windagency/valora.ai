---
id: plan.define-architecture
version: 1.0.0
category: plan
experimental: true
name: Define Architecture
description: Establish high-level architectural decisions including technology choices, component boundaries, and integration strategy
tags:
  - architecture
  - technology-selection
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
    - context.use-modern-cli-tools
    - context.analyze-task-context
inputs:
  - name: task_details
    description: Task description and requirements
    type: object
    required: true
  - name: context_analysis
    description: Context analysis from analyze-task-context
    type: object
    required: true
  - name: acceptance_criteria
    description: Acceptance criteria from task
    type: array
    required: true
outputs:
  - technology_choices
  - component_boundaries
  - integration_points
  - constraints
  - trade_offs
  - go_no_go_criteria
tokens:
  avg: 3000
  max: 6000
  min: 2000
---

# Define Architecture

## Objective

Establish high-level architectural decisions that provide a solid foundation for detailed implementation planning. This prompt is designed for quick validation (~5 minutes) before investing time in detailed planning.

## Context

Architecture definition helps:
1. Validate approach early with stakeholders
2. Identify blocking issues before detailed planning
3. Establish clear boundaries and responsibilities
4. Make and document trade-off decisions

## Architecture Dimensions

Evaluate and document decisions across these dimensions:

### 1. Technology Selection

**For each technology choice**:

| Aspect | Requirement |
|--------|-------------|
| Technology | Name and version |
| Purpose | What problem it solves |
| Rationale | Why this choice over alternatives |
| Alternatives | Other options considered |
| Rejection reasons | Why alternatives weren't chosen |

**Technology selection criteria**:
- **Team familiarity** - Does the team know this technology?
- **Ecosystem maturity** - Is it well-supported with good documentation?
- **Performance fit** - Does it meet performance requirements?
- **Integration ease** - How well does it integrate with existing stack?
- **Maintenance burden** - What's the long-term maintenance cost?

**TypeScript project requirements**:
- Package manager: pnpm (MANDATORY)
- Unit/Integration testing: Vitest (MANDATORY)
- E2E testing: Playwright (MANDATORY)
- Test containers: Testcontainers (MANDATORY)

### 2. Component Boundaries

**For each component**:

| Aspect | Requirement |
|--------|-------------|
| Name | Clear, descriptive name |
| Responsibility | Single primary responsibility |
| Boundaries | What it does NOT do |
| Interface | How other components interact with it |
| Dependencies | What it depends on |

**Boundary definition criteria**:
- **Single Responsibility** - One reason to change
- **High Cohesion** - Related functionality grouped
- **Loose Coupling** - Minimal dependencies between components
- **Clear Contracts** - Well-defined interfaces

**Component diagram format**:
```
+----------------+     +----------------+
|  Component A   | --> |  Component B   |
|  [Responsibility]|    |  [Responsibility]|
+----------------+     +----------------+
```

### 3. Integration Points

**For each integration**:

| Aspect | Requirement |
|--------|-------------|
| From/To | Source and target components |
| Type | Sync/Async |
| Protocol | HTTP/gRPC/Events/etc. |
| Data format | JSON/Protobuf/etc. |
| Authentication | How it's secured |
| Error handling | How failures are managed |

**Internal integrations** - Between components in this system
**External integrations** - With third-party services or other systems

**Integration considerations**:
- Rate limits and quotas
- Retry and circuit breaker patterns
- Timeout configurations
- Fallback strategies

### 4. Constraints Identification

**Technical constraints**:
| Constraint | Impact | Source |
|------------|--------|--------|
| [e.g., Must use existing auth] | [Limits options] | [Architecture decision] |

**Business constraints**:
| Constraint | Impact | Source |
|------------|--------|--------|
| [e.g., Backward compatibility] | [Cannot break existing APIs] | [Product requirement] |

**Resource constraints**:
| Constraint | Impact | Source |
|------------|--------|--------|
| [e.g., Limited capacity] | [Sequential implementation] | [Team capacity] |

### 5. Trade-off Analysis

**For each significant decision**:

| Decision | Option A | Option B | Chosen | Rationale |
|----------|----------|----------|--------|-----------|
| [Decision point] | [First option with pros/cons] | [Second option with pros/cons] | [Which one] | [Why] |

**Trade-off dimensions**:
- **Performance vs. Simplicity** - Optimisation cost vs. maintainability
- **Flexibility vs. Complexity** - Configurability vs. cognitive load
- **Speed vs. Quality** - Time to market vs. technical debt
- **Build vs. Buy** - Custom solution vs. third-party

**Document implications**:
- What the chosen approach enables
- What the chosen approach limits
- Conditions that would change the decision

### 6. Go/No-Go Criteria

**Prerequisites (must be true to proceed)**:

| # | Criterion | Evidence Required |
|---|-----------|-------------------|
| 1 | Required dependencies available | Version confirmation |
| 2 | Required access/permissions granted | Credentials available |
| 3 | Required infrastructure in place | Environment ready |
| 4 | No blocking technical issues | Investigation complete |

**Validation checks**:

| # | Check | How to Verify |
|---|-------|---------------|
| 1 | Architecture aligns with patterns | Code review |
| 2 | No security concerns | Security checklist |
| 3 | Performance requirements achievable | Benchmarks/estimates |
| 4 | Team has expertise | Skill assessment |

## Output Format

```json
{
  "technology_choices": [
    {
      "technology": "Express.js",
      "version": "4.18.x",
      "purpose": "HTTP server framework",
      "rationale": "Team familiarity, mature ecosystem, lightweight",
      "alternatives_considered": [
        {
          "name": "Fastify",
          "rejected_because": "Team less familiar, smaller benefit for this use case"
        }
      ]
    }
  ],
  "component_boundaries": [
    {
      "name": "UserService",
      "responsibility": "User lifecycle management",
      "boundaries": "Does not handle authentication (delegated to AuthService)",
      "interface": "REST API",
      "dependencies": ["DatabaseRepository", "EventBus"]
    }
  ],
  "integration_points": {
    "internal": [
      {
        "from": "API Gateway",
        "to": "UserService",
        "type": "sync",
        "protocol": "HTTP",
        "data_format": "JSON"
      }
    ],
    "external": [
      {
        "service": "SendGrid",
        "purpose": "Email delivery",
        "authentication": "API key",
        "rate_limits": "100 req/min"
      }
    ]
  },
  "constraints": {
    "technical": [
      {
        "constraint": "Must use existing PostgreSQL database",
        "impact": "Cannot use NoSQL for this feature",
        "source": "Infrastructure limitation"
      }
    ],
    "business": [
      {
        "constraint": "Must maintain API backward compatibility",
        "impact": "Versioned endpoints required",
        "source": "Product requirement"
      }
    ],
    "resource": []
  },
  "trade_offs": [
    {
      "decision": "API style",
      "option_a": "REST - simpler, team familiar",
      "option_b": "GraphQL - flexible queries, larger learning curve",
      "chosen": "REST",
      "rationale": "Team familiarity outweighs flexibility benefits for this scope",
      "implications": {
        "enables": ["Faster development", "Easier caching"],
        "limits": ["Frontend needs multiple endpoints for complex data"]
      }
    }
  ],
  "go_no_go_criteria": {
    "prerequisites": [
      {
        "criterion": "Database access available",
        "status": "met",
        "evidence": "Connection string in vault"
      }
    ],
    "validation_checks": [
      {
        "check": "Architecture aligns with existing patterns",
        "status": "met",
        "notes": "Follows existing service layer pattern"
      }
    ],
    "decision": "GO",
    "blocking_issues": []
  }
}
```

## Success Criteria

- [ ] All technology choices documented with rationale
- [ ] Alternatives considered and rejection reasons provided
- [ ] Component boundaries clearly defined
- [ ] All integration points mapped
- [ ] Constraints identified and documented
- [ ] Trade-offs explicitly made and justified
- [ ] Go/No-Go criteria evaluated

## Rules

**DO**:
- [ ] Focus on high-level decisions, not implementation details
- [ ] Document rationale for every significant choice
- [ ] Consider team familiarity and maintenance burden
- [ ] Identify blocking issues early
- [ ] Make trade-offs explicit

**DON'T**:
- [ ] Don't dive into implementation details (that's phase 2)
- [ ] Don't skip alternatives analysis
- [ ] Don't assume prerequisites are met without verification
- [ ] Don't leave trade-offs implicit
- [ ] Don't ignore constraints

## Edge Cases

**Scenario: Greenfield project**
- More technology choices to make
- Focus on establishing patterns for future work
- Consider long-term scalability

**Scenario: Existing system modification**
- Constrained by existing choices
- Focus on integration with existing patterns
- Consider backward compatibility

**Scenario: Uncertain requirements**
- Flag as risk
- Consider flexible architecture
- Recommend clarification before detailed planning
