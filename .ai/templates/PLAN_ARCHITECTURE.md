# Architecture Plan: [TASK-ID] - [Task Title]

## Overview

**Task**: [Brief description of the task]
**Date**: [YYYY-MM-DD]
**Author**: [Agent/Human]

---

## 1. Technology Choices

### Selected Technologies

| Component | Technology | Version | Rationale |
|-----------|------------|---------|-----------|
| [e.g., Runtime] | [e.g., Node.js] | [e.g., 20.x] | [Why this choice] |
| [e.g., Database] | [e.g., PostgreSQL] | [e.g., 15] | [Why this choice] |
| [e.g., Framework] | [e.g., Express] | [e.g., 4.x] | [Why this choice] |

### Alternatives Considered

| Alternative | Pros | Cons | Rejection Reason |
|-------------|------|------|------------------|
| [Technology A] | [Benefits] | [Drawbacks] | [Why not selected] |
| [Technology B] | [Benefits] | [Drawbacks] | [Why not selected] |

---

## 2. Component Boundaries

### Components Overview

```
[High-level diagram or ASCII representation]

e.g.:
+----------------+     +----------------+     +----------------+
|   Frontend     | --> |    API Layer   | --> |   Database     |
|   (React)      |     |   (Express)    |     |  (PostgreSQL)  |
+----------------+     +----------------+     +----------------+
                              |
                              v
                       +----------------+
                       | External APIs  |
                       +----------------+
```

### Component Responsibilities

| Component | Responsibility | Boundaries |
|-----------|---------------|------------|
| [Component A] | [What it does] | [What it does NOT do] |
| [Component B] | [What it does] | [What it does NOT do] |
| [Component C] | [What it does] | [What it does NOT do] |

### Interface Contracts

| Interface | From | To | Contract Type |
|-----------|------|-----|---------------|
| [Interface A] | [Component] | [Component] | [REST/gRPC/Event/etc.] |
| [Interface B] | [Component] | [Component] | [REST/gRPC/Event/etc.] |

---

## 3. Integration Points

### Internal Integrations

| Integration | Type | Protocol | Data Format |
|-------------|------|----------|-------------|
| [Service A <-> Service B] | [Sync/Async] | [HTTP/gRPC/Events] | [JSON/Protobuf] |

### External Integrations

| External System | Purpose | Authentication | Rate Limits |
|-----------------|---------|----------------|-------------|
| [e.g., Stripe API] | [Payment processing] | [API Key/OAuth] | [100 req/min] |
| [e.g., SendGrid] | [Email delivery] | [API Key] | [1000 req/min] |

### Data Flow

```
[Data flow diagram or description]

e.g.:
User Request --> API Gateway --> Auth Middleware --> Route Handler
    --> Service Layer --> Repository --> Database
    --> Response Serialisation --> User Response
```

---

## 4. Key Constraints

### Technical Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| [e.g., Must use existing auth system] | [Limits custom auth] | [Extend existing, don't replace] |
| [e.g., Max 200ms response time] | [No complex queries in request path] | [Use caching, async processing] |

### Business Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| [e.g., Must maintain backward compatibility] | [Cannot change existing API contracts] | [Version API, deprecation period] |
| [e.g., GDPR compliance required] | [Data handling restrictions] | [Implement data anonymisation] |

### Resource Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| [e.g., Limited team capacity] | [Cannot parallelise work] | [Sequential implementation] |
| [e.g., Budget limits] | [Cannot use premium services] | [Use open-source alternatives] |

---

## 5. Trade-offs

### Key Trade-off Decisions

| Decision | Option A | Option B | Chosen | Rationale |
|----------|----------|----------|--------|-----------|
| [e.g., Data storage] | [SQL - ACID guarantees] | [NoSQL - horizontal scale] | [SQL] | [Data consistency critical] |
| [e.g., API style] | [REST - simplicity] | [GraphQL - flexibility] | [REST] | [Team familiarity, simpler caching] |

### Implications of Choices

**Chosen approach enables:**
- [Benefit 1]
- [Benefit 2]

**Chosen approach limits:**
- [Limitation 1]
- [Limitation 2]

---

## 6. Go/No-Go Criteria

### Prerequisites (Must be true to proceed)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | [Required dependency available] | [ ] Y / [ ] N | [Link/reference] |
| 2 | [Required access/permissions granted] | [ ] Y / [ ] N | [Link/reference] |
| 3 | [Required infrastructure in place] | [ ] Y / [ ] N | [Link/reference] |
| 4 | [No blocking technical issues] | [ ] Y / [ ] N | [Link/reference] |

### Validation Checks

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Architecture aligns with existing patterns | [ ] Y / [ ] N | |
| 2 | No security concerns identified | [ ] Y / [ ] N | |
| 3 | Performance requirements achievable | [ ] Y / [ ] N | |
| 4 | Team has required expertise | [ ] Y / [ ] N | |

### Go/No-Go Decision

- [ ] **GO** - Proceed to detailed implementation planning
- [ ] **NO-GO** - Address blocking issues first

**Blocking issues (if No-Go):**
1. [Issue description and resolution path]

---

## 7. Open Questions

| # | Question | Impact | Owner | Due Date |
|---|----------|--------|-------|----------|
| 1 | [Question requiring clarification] | [High/Medium/Low] | [Person] | [Date] |
| 2 | [Question requiring clarification] | [High/Medium/Low] | [Person] | [Date] |

---

## Approval

| Role | Name | Status | Date |
|------|------|--------|------|
| Tech Lead | | [ ] Approved / [ ] Rejected | |
| Architect | | [ ] Approved / [ ] Rejected | |
| Product Owner | | [ ] Approved / [ ] Rejected | |

**Next Step**: If approved, proceed to `/plan-implementation` for detailed breakdown.
