---
id: onboard.analyze-requirements
version: 2.0.0
category: onboard
experimental: true
name: Analyze Requirements
description: Generic requirements analysis for PRD generation or backlog decomposition
tags:
  - requirements-analysis
  - user-stories
  - complexity-estimation
model_requirements:
  min_context: 128000
  recommended:
    - gpt-5-thinking-high
    - gpt-o1-high
agents:
  - product-manager
dependencies:
  requires:
    - context.use-modern-cli-tools
inputs:
  - name: source_document
    description: Source document to analyze (specifications or PRD)
    type: object
    required: true
  - name: source_type
    description: Type of source being analyzed
    type: string
    required: true
    validation:
      enum: ["specifications", "prd"]
  - name: project_type
    description: Project type (greenfield, brownfield, etc.)
    type: string
    required: false
  - name: granularity
    description: Analysis granularity (for backlog context)
    type: string
    required: false
    validation:
      enum: ["fine", "medium", "coarse"]
outputs:
  - requirement_analysis
  - complexity_estimate
  - user_stories
  - dependency_graph
  - complexity_map
  - traceability_matrix
tokens:
  avg: 5000
  max: 10000
  min: 3000
---

# Analyze Requirements

## Objective

Analyze requirements from different sources to produce user stories, complexity estimates, and dependency mapping.

## CRITICAL: Output Format Requirement

**You MUST output ONLY valid JSON. Do NOT output markdown, do NOT wrap in code blocks, do NOT add any text before or after the JSON.**

Your response must be a single JSON object matching the schema defined in the "Output Format" section at the end of this prompt.

## Context Awareness

Based on `source_type` parameter:

**"specifications"** (PRD Creation Context):

- Input: Raw specifications or user-provided requirements
- Goal: Transform into structured requirements for PRD document
- Output depth: Foundational analysis (identify requirements, categorize, estimate)
- Next stage: PRD generation

**"prd"** (Backlog Creation Context):

- Input: Existing PRD with structured requirements (FR-XXX, NFR-XXX, US-XXX)
- Goal: Enrich requirements with analysis for task decomposition
- Output depth: Detailed analysis (dependencies, complexity, technical implications)
- Next stage: Task breakdown

---

## Instructions

### Step 0: Determine Analysis Approach

Based on `source_type`:

**If source_type = "specifications"**:

- Extract requirements from unstructured or semi-structured specs
- Create requirement IDs (FR-001, FR-002, etc.)
- Focus on identification and categorization
- Generate initial user stories

**If source_type = "prd"**:

- Requirements already structured with IDs
- Focus on dependency mapping and complexity analysis
- Validate/enhance existing user stories
- Identify technical requirements in detail

---

### Step 1: Extract or Load Requirements

**If source_type = "specifications"**:

Parse `source_document` to extract requirements:

- Identify all functional requirements (what the system should do)
- Identify non-functional requirements (performance, security, scalability)
- Identify user needs and personas
- Assign IDs: FR-001, FR-002... (functional), NFR-001, NFR-002... (non-functional)
- Extract or infer priorities (P0, P1, P2)

**If source_type = "prd"**:

Load structured requirements from `source_document`:

- `source_document.requirements_list.functional` - All FR-XXX items
- `source_document.requirements_list.non_functional` - All NFR-XXX items
- `source_document.requirements_list.user_stories` - All US-XXX items (if present)
- Requirements already have IDs and priorities

---

### Step 2: Categorize Requirements by Domain

Organize requirements into functional domains:

**Domains**:

1. **Frontend**: UI/UX, components, interactions, responsive design
2. **Backend**: APIs, business logic, data processing, integrations
3. **Data**: Models, schemas, migrations, persistence, queries
4. **Infrastructure**: Deployment, scaling, monitoring, security, DevOps
5. **Testing**: Coverage strategies, automation, test types
6. **Documentation**: User guides, API docs, architecture diagrams

**For each requirement**:

- Assign primary domain
- Identify secondary domains if cross-cutting
- Note if requirement spans multiple domains (integration points)

**Example categorization**:

```text
FR-001: "Create and assign tasks"
- Primary domain: Backend (API endpoint, business logic)
- Secondary domains: Frontend (UI form), Data (task model)
```

### Step 3: Generate or Enhance User Stories

**If source_type = "specifications"**:

For each P0 and P1 functional requirement, create user stories from scratch:

**Format**: "As a [user type], I want to [action], so that [benefit]"

**Guidelines**:

- Be specific about user type (from personas)
- Use action verbs (create, view, update, delete, search, etc.)
- Articulate clear benefit (why this matters)
- Keep stories atomic (single feature/capability)
- Ensure stories are independently valuable

**Example**:

```markdown
FR-001: Create and assign tasks

**User Story 1.1**: As a team lead, I want to create new tasks with title, description, and deadline, so that I can organize work for my team.

**User Story 1.2**: As a team lead, I want to assign tasks to specific team members, so that everyone knows their responsibilities.

**User Story 1.3**: As a team member, I want to see tasks assigned to me, so that I know what work I need to complete.
```

**Multiple users**:

- Create separate stories for different user types
- E.g., "As an admin..." vs. "As a standard user..."

**Complex requirements**:

- Break into multiple stories
- Each story should be deliverable in 1-2 sprints

**If source_type = "prd"**:

User stories may already exist in `source_document.requirements_list.user_stories`:

- **If present**: Validate and enhance existing stories (add missing details, improve clarity)
- **If missing or incomplete**: Generate stories for requirements that lack them
- **Focus on P0 requirements first**, then P1

---

### Step 4: Define Acceptance Criteria

For each user story, define clear, testable acceptance criteria:

**Format**: Use Given-When-Then or scenario-based

**Given-When-Then**:

```text
Given [initial context]
When [action occurs]
Then [expected outcome]
```

**Example**:

```markdown
**User Story 1.1 Acceptance Criteria**:

1. Given I am a logged-in team lead
   When I click "New Task" and fill in title, description, deadline
   Then a new task is created and appears in the task list

2. Given I am creating a task
   When I leave the title field empty
   Then I see an error "Title is required"

3. Given I created a task with a deadline
   When the deadline is reached
   Then the task is highlighted as overdue
```

**Checklist format** (alternative):

```markdown
- [ ] User can create task with title, description, deadline
- [ ] Title is required (error shown if empty)
- [ ] Description is optional
- [ ] Deadline must be future date
- [ ] Task appears in list immediately after creation
- [ ] Overdue tasks are highlighted
```

**Coverage**:

- Happy path (normal flow)
- Edge cases (empty fields, invalid data)
- Error scenarios (network failure, validation errors)
- Non-functional aspects (performance, accessibility)

### Step 5: Estimate Complexity

For each requirement, estimate complexity:

**Complexity levels**:

1. **Simple** (1 point):
   - < 1 day
   - Single component
   - No dependencies
   - Well-understood pattern
   - Examples: UI label change, simple form, basic CRUD

2. **Medium** (3 points):
   - 1-3 days
   - Multiple components (2-4)
   - Some dependencies
   - Moderate complexity
   - Examples: Integration with external API, multi-step form, report generation

3. **Complex** (5 points):
   - 3-5 days
   - Many components (5+)
   - Multiple dependencies
   - Cross-cutting concerns
   - Examples: Real-time features, complex algorithm, data migration

4. **Very Complex** (8 points):
   - >5 days
   - System-wide impact
   - Many dependencies
   - High risk/uncertainty
   - Examples: Authentication system, multi-tenant architecture, performance optimization

**Factors affecting complexity**:

- Number of components involved
- Dependencies on other requirements
- Integration complexity
- Data model changes
- Performance/scalability challenges
- Security considerations
- Testing effort
- Documentation needs

**Total complexity**:

```plaintext
Total Story Points = Sum of all requirement complexities
```

**Granularity consideration** (for source_type = "prd"):

If `granularity` parameter is provided:

- **fine**: Bias toward lower complexity scores (more granular breakdown expected)
- **medium**: Balanced complexity assessment (default)
- **coarse**: Bias toward higher complexity scores (epic-level tasks expected)

---

### Step 6: Map Dependencies

Identify dependencies between requirements:

**Dependency types**:

1. **Prerequisite**: A must be done before B
   - Example: "User authentication" before "Task assignment"

2. **Related**: A and B are related but order doesn't matter
   - Example: "Email notifications" and "In-app notifications"

3. **Blocking**: A blocks B (cannot proceed without A)
   - Example: "Database schema" blocks "API endpoints"

4. **External**: Depends on external system/team
   - Example: "Slack integration" depends on Slack API

**Dependency graph**:

Create adjacency list or matrix:

```text
FR-001 (Create tasks) → []  (no dependencies)
FR-002 (Assign tasks) → [FR-001]  (requires task creation)
FR-003 (Task notifications) → [FR-002]  (requires assignments)
FR-004 (Slack integration) → [FR-003]  (requires notifications)
```

**Critical path**:

- Identify longest dependency chain
- Highlight requirements on critical path
- These must be prioritized

**Parallel work**:

- Identify requirements with no dependencies
- These can be worked on simultaneously
- Optimize for parallelization

**Dependency depth**:

**If source_type = "specifications"**:

- Focus on high-level dependencies between major requirements
- Identify external dependencies early

**If source_type = "prd"**:

- Map detailed dependencies for task decomposition
- Include soft dependencies and recommended sequences
- Identify parallel work opportunities

---

### Step 7: Identify Technical Requirements

Extract technical requirements implied by functional requirements:

**API endpoints**:

- List required endpoints
- Define HTTP methods, paths, request/response formats
- Example: `POST /api/tasks`, `GET /api/tasks/:id`

**Database schema changes**:

- New tables/collections
- Schema migrations
- Indexes required
- Data relationships

**Authentication/Authorization**:

- Required permissions
- Role-based access control (RBAC)
- OAuth scopes
- API key requirements

**Integration points**:

- External APIs to call
- Webhooks to implement
- Message queues
- Event streams

**Performance targets**:

- Response time requirements
- Throughput needs
- Concurrent user support
- Data volume expectations

**Security requirements**:

- Encryption (at rest, in transit)
- Input validation
- Rate limiting
- Audit logging

**Technical depth**:

**If source_type = "specifications"**:

- High-level technical requirements sufficient
- Focus on major architectural decisions
- Identify key technology choices

**If source_type = "prd"**:

- Detailed technical requirements for implementation
- Specific API endpoints, schemas, integrations
- Performance targets and security requirements
- Infrastructure and deployment needs

---

### Step 8: Generate Complexity Estimate

Aggregate complexity across all requirements:

**By priority**:

```plaintext
P0 (Must Have): X story points
P1 (Should Have): Y story points
P2 (Nice to Have): Z story points
Total: X + Y + Z story points
```

**By domain**:

```plaintext
Frontend: A points
Backend: B points
Data: C points
Infrastructure: D points
Testing: E points
Documentation: F points
```

**Estimated timeline**:

```plaintext
Assuming team velocity of V points/sprint:
Minimum sprints = P0 points / V
Expected sprints = (P0 + P1) points / V
Maximum sprints = (P0 + P1 + P2) points / V
```

**Risk assessment**:

- High complexity requirements (8 points): [count]
- External dependencies: [count]
- Critical path length: [count] requirements

---

### Step 9: Generate Requirements Traceability Matrix

Create a comprehensive traceability matrix to ensure complete coverage and identify scope gaps.

**Purpose**:

- Verify every source requirement has corresponding user stories
- Ensure all user stories have acceptance criteria
- Map requirements to technical artefacts (APIs, database, integrations)
- Identify orphaned artefacts or missing coverage
- Prevent scope gaps through bi-directional tracing

**Matrix Structure**:

For each requirement, trace:

1. **Forward Traceability** (Source → Implementation):
   - Requirement ID → User Stories → Acceptance Criteria → Technical Artefacts

2. **Backward Traceability** (Implementation → Source):
   - Technical Artefact → User Story → Requirement ID

**Coverage Analysis**:

For each requirement, calculate coverage status:

- **full**: All expected artefacts present (user stories, acceptance criteria, technical requirements)
- **partial**: Some artefacts missing (e.g., user story exists but no acceptance criteria)
- **missing**: No downstream artefacts created

**Gap Detection**:

Identify and report:

1. **Orphaned user stories**: Stories not linked to any requirement
2. **Requirements without stories**: Source requirements lacking user stories
3. **Stories without acceptance criteria**: User stories missing testable criteria
4. **Untraceable technical artefacts**: APIs/schemas not linked to requirements
5. **Cross-cutting gaps**: NFRs without implementation strategy

**Traceability Depth**:

**If source_type = "specifications"**:

- Focus on requirement → user story mapping
- Identify gaps early for PRD refinement
- Flag ambiguous requirements needing clarification

**If source_type = "prd"**:

- Full traceability including technical artefacts
- Validate completeness for task decomposition
- Ensure every requirement has implementation path

**Coverage Metrics**:

```plaintext
Requirements Coverage:
- Total requirements: N
- Fully covered: X (X/N * 100%)
- Partially covered: Y (Y/N * 100%)
- Missing coverage: Z (Z/N * 100%)

User Story Coverage:
- Total user stories: M
- With acceptance criteria: A (A/M * 100%)
- Without acceptance criteria: B (B/M * 100%)

Technical Coverage:
- Requirements with API endpoints: P%
- Requirements with database changes: Q%
- Requirements with integration points: R%
```

---

## Output Format

**CRITICAL: Your response MUST be ONLY valid JSON. No markdown, no explanations, no prose. Just the JSON object below.**

```json
{
  "requirement_analysis": {
    "categorized_requirements": {
      "frontend": [
        {
          "id": "FR-001",
          "description": "Create and assign tasks",
          "priority": "P0",
          "user_stories": [
            {
              "id": "US-001-1",
              "story": "As a team lead, I want to create new tasks...",
              "acceptance_criteria": [
                "Given I am a logged-in team lead...",
                "..."
              ]
            }
          ],
          "complexity": 3,
          "complexity_level": "medium"
        }
      ],
      "backend": [...],
      "data": [...],
      "infrastructure": [...],
      "testing": [...],
      "documentation": [...]
    },
    "technical_requirements": {
      "api_endpoints": [
        {
          "method": "POST",
          "path": "/api/tasks",
          "description": "Create new task",
          "auth": "Bearer token",
          "requires": ["FR-001"]
        }
      ],
      "database_changes": [
        {
          "type": "new_table",
          "name": "tasks",
          "columns": ["id", "title", "description", "assigned_to", "deadline"],
          "indexes": ["assigned_to", "deadline"],
          "requires": ["FR-001", "FR-002"]
        }
      ],
      "integrations": [
        {
          "name": "Slack API",
          "type": "external",
          "purpose": "Send task notifications",
          "requires": ["FR-003"]
        }
      ],
      "performance_targets": {
        "api_response_time": "<200ms (p95)",
        "page_load_time": "<2s",
        "concurrent_users": "10,000"
      },
      "security_requirements": [
        "OAuth2 authentication",
        "RBAC for task assignment",
        "Audit log for all task changes"
      ]
    }
  },
  "complexity_estimate": {
    "by_priority": {
      "p0": {"points": 42, "count": 14},
      "p1": {"points": 21, "count": 7},
      "p2": {"points": 8, "count": 2}
    },
    "by_domain": {
      "frontend": 18,
      "backend": 35,
      "data": 12,
      "infrastructure": 4,
      "testing": 6,
      "documentation": 4
    },
    "total_points": 71,
    "estimated_timeline": {
      "minimum_sprints": 6,
      "expected_sprints": 9,
      "maximum_sprints": 12,
      "assumptions": "Team velocity: 8 points/sprint"
    },
    "risk_factors": {
      "high_complexity_count": 3,
      "external_dependencies_count": 2,
      "critical_path_length": 5
    }
  },
  "user_stories": [
    {
      "id": "US-001-1",
      "requirement_id": "FR-001",
      "story": "As a team lead...",
      "acceptance_criteria": [...],
      "complexity": 3,
      "priority": "P0",
      "domain": "frontend"
    }
  ],
  "dependency_graph": {
    "FR-001": [],
    "FR-002": ["FR-001"],
    "FR-003": ["FR-002"],
    "FR-004": ["FR-003"]
  },
  "critical_path": ["FR-001", "FR-002", "FR-003", "FR-004"],
  "parallel_work_opportunities": ["FR-005", "FR-006", "FR-007"],
  "complexity_map": {
    "FR-001": {"level": "medium", "points": 3, "risk": "low"},
    "FR-002": {"level": "complex", "points": 5, "risk": "medium"},
    "FR-003": {"level": "simple", "points": 1, "risk": "low"},
    "FR-004": {"level": "very_complex", "points": 8, "risk": "high"}
  },
  "traceability_matrix": {
    "requirement_traces": [
      {
        "requirement_id": "FR-001",
        "requirement_description": "Create and assign tasks",
        "user_stories": ["US-001-1", "US-001-2", "US-001-3"],
        "acceptance_criteria_count": 6,
        "technical_artefacts": {
          "api_endpoints": ["POST /api/tasks", "GET /api/tasks/:id"],
          "database_tables": ["tasks"],
          "integrations": []
        },
        "coverage_status": "full",
        "gaps": []
      },
      {
        "requirement_id": "FR-002",
        "requirement_description": "Task notifications",
        "user_stories": ["US-002-1"],
        "acceptance_criteria_count": 2,
        "technical_artefacts": {
          "api_endpoints": [],
          "database_tables": ["notifications"],
          "integrations": ["Slack API"]
        },
        "coverage_status": "partial",
        "gaps": ["Missing acceptance criteria for error scenarios"]
      }
    ],
    "coverage_summary": {
      "total_requirements": 10,
      "fully_covered": 7,
      "partially_covered": 2,
      "missing_coverage": 1,
      "coverage_percentage": 70
    },
    "user_story_coverage": {
      "total_stories": 15,
      "with_acceptance_criteria": 12,
      "without_acceptance_criteria": 3,
      "acceptance_criteria_percentage": 80
    },
    "technical_coverage": {
      "requirements_with_api": 8,
      "requirements_with_database": 6,
      "requirements_with_integrations": 3,
      "api_coverage_percentage": 80,
      "database_coverage_percentage": 60,
      "integration_coverage_percentage": 30
    },
    "identified_gaps": [
      {
        "gap_type": "requirement_without_stories",
        "affected_items": ["NFR-003"],
        "severity": "high",
        "recommendation": "Create user stories for performance requirements"
      },
      {
        "gap_type": "stories_without_criteria",
        "affected_items": ["US-002-1", "US-004-2"],
        "severity": "medium",
        "recommendation": "Define acceptance criteria before task decomposition"
      },
      {
        "gap_type": "orphaned_artefact",
        "affected_items": ["GET /api/health"],
        "severity": "low",
        "recommendation": "Link to infrastructure requirement or document as system endpoint"
      }
    ],
    "cross_cutting_coverage": {
      "security_requirements_mapped": true,
      "performance_requirements_mapped": false,
      "accessibility_requirements_mapped": true,
      "gaps": ["NFR-003 (Performance) lacks implementation strategy"]
    }
  }
}
```

## Success Criteria

- ✅ All P0/P1 requirements categorized by domain
- ✅ User stories generated for each requirement
- ✅ Acceptance criteria defined and testable
- ✅ Complexity estimated for each requirement
- ✅ Dependencies mapped
- ✅ Technical requirements extracted
- ✅ Total complexity calculated
- ✅ Estimated timeline provided
- ✅ Traceability matrix generated with full bi-directional tracing
- ✅ Coverage gaps identified and documented
- ✅ All requirements have minimum 70% coverage or gaps flagged

## Notes

**Context-specific considerations**:

**For source_type = "specifications"**:

- Focus on requirement discovery and categorization
- User stories provide foundation for PRD
- Complexity estimates inform project scoping
- Output feeds directly into PRD generation
- Allow for some ambiguity (will be refined in PRD)

**For source_type = "prd"**:

- Requirements already structured - focus on enrichment
- Dependency mapping critical for task ordering
- Technical requirements guide implementation
- Output feeds directly into task decomposition
- Expect high level of detail and precision

**Universal considerations**:

- User stories should be reviewed with stakeholders
- Complexity estimates are estimates - expect variance
- Granularity parameter (when provided) guides analysis depth

**Traceability matrix considerations**:

- Review identified gaps with stakeholders before proceeding
- High-severity gaps (requirement_without_stories) should block task decomposition
- Medium-severity gaps (stories_without_criteria) can be addressed in parallel
- Low-severity gaps (orphaned_artefact) are informational only
- Coverage percentage below 70% indicates significant scope risk
- Cross-cutting requirements (security, performance, accessibility) require explicit mapping

## REMINDER: Output Requirements

**Output ONLY the JSON object. No markdown, no code blocks, no explanatory text. Start directly with `{` and end with `}`.**
