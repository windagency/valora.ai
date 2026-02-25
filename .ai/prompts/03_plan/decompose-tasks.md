---
id: plan.decompose-tasks
version: 1.0.0
category: plan
experimental: true
name: Decompose Tasks
description: Break down analyzed requirements into actionable, prioritized tasks for backlog
tags:
  - task-decomposition
  - backlog-planning
  - work-breakdown
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - product-manager
dependencies:
  requires:
    - onboard.analyze-requirements
    - context.use-modern-cli-tools
inputs:
  - name: analysis
    description: Requirements analysis from onboard stage
    type: object
    required: true
  - name: dependencies
    description: Dependency graph from onboard stage
    type: object
    required: true
  - name: complexity
    description: Complexity map from onboard stage
    type: object
    required: true
  - name: granularity
    description: Task granularity level (fine/medium/coarse)
    type: string
    required: false
    default: medium
    validation:
      enum: [fine, medium, coarse]
outputs:
  - task_list
  - task_dependencies
  - priority_order
tokens:
  avg: 8000
  max: 15000
  min: 5000
---

# Decompose Tasks

## Objective

Transform analyzed requirements into actionable, implementable tasks with clear acceptance criteria, effort estimates, priorities, and dependencies.

## CRITICAL: Output Format Requirement

**You MUST output ONLY valid JSON. Do NOT output markdown, do NOT wrap in code blocks, do NOT add any text before or after the JSON.**

Your response must be a single JSON object matching the schema defined in the "Output Format" section at the end of this prompt. The JSON must contain:
- `task_list`: Array of task objects
- `task_dependencies`: Object mapping task IDs to their dependencies
- `priority_order`: Object with phase arrays

## Instructions

### Step 1: Apply Granularity Settings

Based on `granularity` input:

**Fine granularity**:
- Target: 1-2 day tasks
- High detail, granular breakdown
- Each task is a single, focused change
- Best for: Junior teams, complex projects, high-risk work

**Medium granularity** (default):
- Target: 2-5 day tasks
- Balanced detail level
- Task may span multiple related changes
- Best for: Most projects, mixed-skill teams

**Coarse granularity**:
- Target: 5-10 day tasks (epic-level)
- High-level breakdown
- Task represents a complete feature area
- Best for: Experienced teams, straightforward work

**Rule**: No task should exceed 5 days regardless of granularity. If coarse tasks exceed this, flag for decomposition warning.

### Step 2: Decompose Requirements into Tasks

For each requirement from the analysis:

**Task naming convention**:

```
[DOMAIN][XXXX]: [Action] [Subject] [Context]
```

**Domain prefixes**:
- `FE` = Frontend
- `BE` = Backend
- `DB` = Data/Database
- `INFRA` = Infrastructure
- `TEST` = Testing
- `DOC` = Documentation

**Examples**:
- `FE001: Implement user authentication form`
- `BE012: Create rate limiting middleware`
- `DB003: Add user_sessions table migration`
- `INFRA005: Configure Redis cache cluster`
- `TEST008: Add E2E tests for checkout flow`
- `DOC002: Document API authentication endpoints`

**Decomposition rules**:

1. **One task = One PR** (ideally)
   - Task should result in single, atomic pull request
   - Exception: Multi-phase tasks may span multiple PRs

2. **Task must be ≤ 5 days**
   - If longer, decompose into subtasks
   - Mark as epic if naturally large

3. **Each task maps to ≥ 1 requirement**
   - Link back to FR-XXX or NFR-XXX
   - Maintain traceability

4. **Acceptance criteria must be testable**
   - Use Given-When-Then format
   - Must be verifiable (automated test or manual check)

5. **Dependencies must be explicit**
   - List prerequisite task IDs
   - No implicit "should probably do this first" assumptions

**Task template structure**:

```markdown
### [TASK-ID]: [Title]

**Requirement(s)**: [FR-001, NFR-002]
**Priority**: [P0/P1/P2]
**Domain**: [Frontend/Backend/Data/Infrastructure/Testing/Documentation]
**Effort**: [XS/S/M/L/XL]
**Dependencies**: [TASK-002, TASK-003] or [None]

**Description**:
[Clear, actionable description of what needs to be done]

**Acceptance Criteria**:
1. Given [context], when [action], then [expected outcome]
2. Given [context], when [action], then [expected outcome]
3. [Additional criteria...]

**Technical Notes**:
- [Implementation hints, architectural considerations]
- [Key files/components to modify]
- [Potential gotchas or risks]

**Testing Requirements**:
- [Unit tests needed]
- [Integration tests needed]
- [E2E scenarios to cover]

**Documentation**:
- [Code comments needed]
- [API documentation updates]
- [User guide updates]
```

### Step 3: Estimate Effort for Each Task

Apply effort sizing:

**Effort levels**:

- **XS** (< 1 day):
  - Simple config changes
  - Documentation updates
  - Minor fixes
  - Single component, clear implementation
  - Examples: Update label text, add environment variable, fix typo

- **S** (1-2 days):
  - Single feature component
  - Straightforward API endpoint
  - Simple database migration
  - Clear requirements, known patterns
  - Examples: Create form component, add CRUD endpoint, add index to table

- **M** (3-5 days):
  - Multiple related components
  - Complex business logic
  - Integration between systems
  - Moderate uncertainty
  - Examples: Complete authentication flow, real-time notifications, search feature

- **L** (5-10 days):
  - Cross-cutting feature
  - Multiple integration points
  - High complexity or uncertainty
  - System-wide changes
  - **Warning**: Should be decomposed if possible
  - Examples: Complete payment system, multi-tenant support, major refactor

- **XL** (> 10 days):
  - **Not allowed** - must decompose
  - If task is naturally this large, break into multiple tasks or mark as epic

**Effort calculation factors**:

1. **Implementation time** (60% of total):
   - Code writing, testing, debugging
   
2. **Testing time** (20% of total):
   - Unit, integration, E2E tests
   
3. **Review/polish time** (10% of total):
   - Code review iterations, refinements
   
4. **Documentation time** (10% of total):
   - Code comments, API docs, user guides

### Step 4: Establish Task Dependencies

For each task, identify dependencies:

**Dependency types**:

1. **Hard prerequisite**: Task B cannot start until Task A is complete
   - Example: `BE002: Create user API` depends on `DB001: User table migration`
   
2. **Soft prerequisite**: Task B is easier if Task A is done first
   - Example: `FE003: User profile page` easier after `FE001: Auth components`
   - Mark as "recommended sequence" not blocking
   
3. **Related**: Tasks touch same code/feature but can be parallel
   - Example: `FE001: Desktop UI` and `FE002: Mobile UI` for same feature
   - Mark as "related" for context

**Rules**:

- Only hard prerequisites go in `dependencies` field
- Avoid circular dependencies (validate and break if found)
- Minimize dependency count for parallelization
- Foundation tasks (infrastructure, data models) naturally have many dependents

**Dependency graph validation**:

- Run topological sort to detect cycles
- If cycle detected, flag for human review
- Suggest breaking one dependency to resolve

### Step 5: Prioritize and Order Tasks

Apply prioritization framework:

**Priority score calculation**:

```
Priority Score = (Business Value × 0.4) + 
                 (Technical Foundation × 0.3) + 
                 (Risk Reduction × 0.2) + 
                 (Quick Wins × 0.1)
```

Where each factor is scored 1-10.

**Priority tiers**:

- **P0 (Critical)**: 
  - Blocks MVP launch
  - High business value
  - Required by other P0 tasks
  - Examples: Core authentication, primary user workflows
  
- **P1 (High)**:
  - Important for launch quality
  - Significant user value
  - Nice-to-have for MVP, must-have for GA
  - Examples: Search functionality, email notifications
  
- **P2 (Medium)**:
  - Post-launch enhancements
  - Low blocking risk
  - Incremental improvements
  - Examples: Advanced filters, export features

**Execution phases**:

Organize tasks into logical phases:

**Phase 0: Foundation**
- Infrastructure setup (CI/CD, environments, monitoring)
- Development environment
- Core database schema
- Authentication framework
- Priority: All tasks P0
- Estimated: 1-2 weeks

**Phase 1: Core Backend**
- API framework
- Core business logic
- Data models and migrations
- Authorization rules
- Priority: P0 tasks
- Estimated: 2-4 weeks

**Phase 2: Core Frontend**
- UI framework setup
- Design system/components
- State management
- API integration (can use mocks initially)
- Priority: P0 tasks
- Estimated: 2-4 weeks

**Phase 3: Integration & Features**
- Connect frontend to real APIs (unmock)
- P1 features
- Third-party integrations
- Priority: P0 + P1 tasks
- Estimated: 3-6 weeks

**Phase 4: Quality & Polish**
- Comprehensive testing
- Performance optimization
- Security hardening
- Documentation
- Priority: P1 + P2 tasks
- Estimated: 2-3 weeks

**Phase 5: Production Readiness**
- Deployment automation
- Monitoring and alerting
- Runbooks
- Load testing
- Priority: All remaining tasks
- Estimated: 1-2 weeks

**Ordering strategies within phases**:

1. **Dependencies first**: Prerequisite tasks before dependent tasks
2. **Quick wins early**: Small, high-value tasks boost momentum
3. **High risk early**: Fail-fast on uncertain/complex items
4. **Group by domain**: Batch similar tasks for context efficiency
5. **Parallel streams**: Identify tasks that can run concurrently

### Step 6: Generate Final Task List

Compile complete backlog:

**Task list structure**:

```markdown
# Project Backlog: [Project Name]

## Phase 0: Foundation (X tasks, ~Y days)

### INFRA001: Setup CI/CD Pipeline
**Requirement(s)**: NFR-005 (Automated deployment)
**Priority**: P0
**Domain**: Infrastructure
**Effort**: M (3 days)
**Dependencies**: None
**Phase**: 0

**Description**:
Configure GitHub Actions for automated testing and deployment to staging/production environments.

**Acceptance Criteria**:
1. Given code is pushed to main branch, when CI runs, then all tests execute
2. Given tests pass on main, when deployment triggered, then code deploys to staging
3. Given manual approval in staging, when production deployment runs, then code deploys to production

**Technical Notes**:
- Use GitHub Actions for CI/CD
- Deploy to AWS using Docker + ECS
- Implement blue-green deployment strategy
- Store secrets in GitHub Secrets

**Testing Requirements**:
- Verify CI runs on PR and main
- Test deployment to staging
- Validate rollback mechanism

**Documentation**:
- Document CI/CD workflow in infrastructure/WORKFLOW.md
- Create runbook for manual deployment steps

---

### DB001: Create user accounts table
[Similar structure...]

---

## Phase 1: Core Backend (X tasks, ~Y days)
[Tasks...]

## Phase 2: Core Frontend (X tasks, ~Y days)
[Tasks...]

[etc.]
```

**Metadata to include**:

- Task count per phase
- Estimated duration per phase
- Total task count
- Total estimated effort
- Critical path length
- Parallel work stream count

## Output Format

```json
{
  "task_list": [
    {
      "id": "INFRA001",
      "title": "Setup CI/CD Pipeline",
      "domain": "Infrastructure",
      "priority": "P0",
      "effort": "M",
      "effort_days": 3,
      "phase": 0,
      "requirements": ["NFR-005"],
      "dependencies": [],
      "description": "Configure GitHub Actions for automated testing and deployment...",
      "acceptance_criteria": [
        "Given code is pushed to main branch, when CI runs, then all tests execute",
        "Given tests pass on main, when deployment triggered, then code deploys to staging",
        "Given manual approval in staging, when production deployment runs, then code deploys to production"
      ],
      "technical_notes": [
        "Use GitHub Actions for CI/CD",
        "Deploy to AWS using Docker + ECS",
        "Implement blue-green deployment strategy"
      ],
      "testing_requirements": [
        "Verify CI runs on PR and main",
        "Test deployment to staging",
        "Validate rollback mechanism"
      ],
      "documentation": [
        "Document CI/CD workflow in infrastructure/WORKFLOW.md",
        "Create runbook for manual deployment steps"
      ]
    },
    {
      "id": "DB001",
      "title": "Create user accounts table",
      "domain": "Data",
      "priority": "P0",
      "effort": "S",
      "effort_days": 1,
      "phase": 0,
      "requirements": ["FR-001", "FR-002"],
      "dependencies": [],
      "description": "Create PostgreSQL migration for user accounts table with authentication fields",
      "acceptance_criteria": [
        "Given migration runs, when database checked, then users table exists with correct schema",
        "Given table exists, when inserting test user, then record is created successfully",
        "Given unique email constraint, when duplicate email inserted, then error is raised"
      ],
      "technical_notes": [
        "Use Sequelize/Prisma for migrations",
        "Include: id, email (unique), password_hash, name, created_at, updated_at",
        "Add indexes on email for fast lookups"
      ],
      "testing_requirements": [
        "Unit tests for migration up/down",
        "Integration test for schema validation"
      ],
      "documentation": [
        "Document schema in knowledge-base/backend/DATA.md",
        "Add ERD diagram to architecture docs"
      ]
    }
  ],
  "task_dependencies": {
    "INFRA001": [],
    "DB001": [],
    "BE001": ["DB001"],
    "BE002": ["BE001"],
    "FE001": [],
    "FE002": ["BE002"],
    "TEST001": ["FE002", "BE002"],
    "DOC001": ["TEST001"]
  },
  "priority_order": {
    "phase_0": ["INFRA001", "DB001", "DB002"],
    "phase_1": ["BE001", "BE002", "BE003"],
    "phase_2": ["FE001", "FE002", "FE003"],
    "phase_3": ["TEST001", "TEST002", "DOC001"],
    "phase_4": ["INFRA002", "DOC002"]
  },
  "metadata": {
    "total_tasks": 42,
    "total_estimated_days": 87,
    "by_priority": {
      "p0": {"count": 14, "days": 35},
      "p1": {"count": 18, "days": 38},
      "p2": {"count": 10, "days": 14}
    },
    "by_domain": {
      "frontend": {"count": 12, "days": 24},
      "backend": {"count": 15, "days": 32},
      "data": {"count": 5, "days": 8},
      "infrastructure": {"count": 4, "days": 10},
      "testing": {"count": 4, "days": 8},
      "documentation": {"count": 2, "days": 5}
    },
    "by_phase": {
      "phase_0": {"count": 5, "days": 10},
      "phase_1": {"count": 8, "days": 18},
      "phase_2": {"count": 10, "days": 22},
      "phase_3": {"count": 12, "days": 25},
      "phase_4": {"count": 7, "days": 12}
    },
    "critical_path_length": 52,
    "parallel_streams": 3,
    "estimated_timeline_weeks": 12
  },
  "warnings": [
    "Task BE005 has high complexity (L) - consider decomposition",
    "Phase 3 has 12 tasks - consider splitting into sub-phases"
  ],
  "parallel_opportunities": [
    {
      "stream": "Frontend Development",
      "tasks": ["FE001", "FE002", "FE003"],
      "note": "Can run parallel to backend if using mocked APIs"
    },
    {
      "stream": "Documentation",
      "tasks": ["DOC001", "DOC002"],
      "note": "Can start early and iterate as implementation progresses"
    }
  ]
}
```

## Success Criteria

- ✅ All requirements decomposed into tasks
- ✅ Every task has clear acceptance criteria
- ✅ All tasks have effort estimates
- ✅ Dependencies mapped and validated (no cycles)
- ✅ Tasks prioritized and phased
- ✅ No task exceeds 5-day threshold
- ✅ Each task links back to ≥ 1 requirement
- ✅ Parallel work opportunities identified

## Notes

- Focus on DECOMPOSITION and STRUCTURE, not generation
- Detailed task descriptions should be clear and actionable
- Maintain traceability (task → requirement → PRD)
- Balance granularity vs. overhead (too many tasks = coordination overhead)
- Consider team skill level when estimating effort
- Quick wins in early phases build momentum
- High-risk tasks early enable fail-fast

## REMINDER: Output Requirements

**Output ONLY the JSON object. No markdown, no code blocks, no explanatory text. Start directly with `{` and end with `}`.**

