---
id: onboard.analyze-documentation-requirements
version: 1.0.0
category: onboard
experimental: true
name: Analyse Documentation Requirements
description: Plan documentation structure, identify diagram requirements, and establish cross-references
tags:
  - documentation
  - planning
  - analysis
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - lead
dependencies:
  requires:
    - context.load-documentation-context
inputs:
  - name: prd
    description: Parsed PRD document from context stage
    type: object
    required: true
  - name: functional
    description: Parsed FUNCTIONAL document from context stage
    type: object
    required: true
  - name: backlog
    description: Parsed BACKLOG document from context stage
    type: object
    required: true
  - name: codebase
    description: Codebase context from context stage
    type: object
    required: true
  - name: metadata
    description: Project metadata from context stage
    type: object
    required: true
  - name: domain_filter
    description: Domain filter from --domain argument
    type: string
    required: false
  - name: doc_type_filter
    description: Document type filter from --doc-type argument
    type: string
    required: false
outputs:
  - documentation_plan
  - diagram_requirements
  - cross_references
  - domain_assignments
tokens:
  avg: 8000
  max: 15000
  min: 4000
---

# Analyse Documentation Requirements

## Objective

Analyse loaded context to create a comprehensive documentation plan, identify required diagrams, establish cross-references between documents, and assign domain responsibilities.

## CRITICAL: Output Format Requirement

**You MUST output ONLY valid JSON. Do NOT output markdown, do NOT wrap in code blocks, do NOT add any text before or after the JSON.**

Your response must be a single JSON object matching the schema defined in the "Output Format" section at the end of this prompt.

## Instructions

### Step 1: Determine Documentation Scope

Based on domain filter and codebase analysis:

**If `domain_filter` is "all" or not provided**:

- Plan all 15 documents
- Enable infrastructure, backend, and frontend domains

**If `domain_filter` is specific**:

- Filter to requested domain only
- Infrastructure: 6 documents
- Backend: 5 documents
- Frontend: 4 documents

**If `doc_type_filter` is provided**:

- Generate only the specified document type
- Match against document names (HLD, API, ARCHITECTURE, etc.)

### Step 2: Plan Infrastructure Documentation (6 files)

For each infrastructure document, plan content based on context:

**HLD.md (High-Level Design)**:

- Content: System overview, C4 Context diagram, C4 Container diagram
- Sources: PRD architecture decisions, technology stack, NFRs
- Diagrams: C4 Context, C4 Container
- Key sections: Technology stack, system boundaries, external integrations

**CONTAINER.md (Container Architecture)**:

- Content: Docker configuration, image management, compose setup
- Sources: Dockerfile, docker-compose.yml, container registry config
- Diagrams: Container topology, build pipeline
- Key sections: Image structure, environment configuration, volumes

**DEPLOYMENT.md (Deployment Guide)**:

- Content: Deployment processes, environments, CI/CD pipelines
- Sources: CI config, deployment scripts, environment configs
- Diagrams: Deployment pipeline, environment topology
- Key sections: Release process, rollback procedures, health checks

**LOGGING.md (Observability)**:

- Content: Logging strategy, monitoring, alerting, tracing
- Sources: Logging config, monitoring setup, alert rules
- Diagrams: Observability architecture, log flow
- Key sections: Log levels, metrics, alerts, dashboards

**LZ.md (Landing Zone)**:

- Content: Network architecture, security boundaries, cloud resources
- Sources: Infrastructure code, network config, security policies
- Diagrams: Network topology, security zones
- Key sections: VPC structure, IAM policies, resource groups

**WORKFLOW.md (Development Workflow)**:

- Content: Development processes, branching strategy, release flow
- Sources: Git config, PR templates, CI/CD config
- Diagrams: Git flow, release pipeline
- Key sections: Branch naming, PR process, code review

### Step 3: Plan Backend Documentation (5 files)

**ARCHITECTURE.md (Backend Architecture)**:

- Content: Service design, patterns, dependencies, layering
- Sources: Backend code structure, service files, dependency graph
- Diagrams: Component diagram, dependency graph, layer diagram
- Key sections: Service boundaries, patterns used, error handling

**API.md (API Documentation)**:

- Content: Endpoint documentation, request/response schemas, auth
- Sources: Route files, controller code, API schemas
- Diagrams: Sequence diagrams for key flows
- Key sections: Endpoints by resource, authentication, error codes

**DATA.md (Data Architecture)**:

- Content: Data models, database design, migrations, relationships
- Sources: Schema files, model definitions, migration scripts
- Diagrams: ERD, data flow diagram
- Key sections: Entity definitions, relationships, indexing strategy

**TESTING.md (Backend Testing)**:

- Content: Testing strategy, coverage, patterns, fixtures
- Sources: Test files, test configuration, coverage reports
- Diagrams: Test pyramid, coverage map
- Key sections: Unit tests, integration tests, test data management

**CODING-ASSERTIONS.md (Backend Standards)**:

- Content: Coding standards, validation rules, assertions
- Sources: Lint config, code style guides, validation utilities
- Key sections: Naming conventions, error handling, validation patterns

### Step 4: Plan Frontend Documentation (4 files)

**ARCHITECTURE.md (Frontend Architecture)**:

- Content: Component hierarchy, state management, routing
- Sources: Component files, store configuration, route definitions
- Diagrams: Component tree, state flow, route hierarchy
- Key sections: Component patterns, state management, data fetching

**DESIGN.md (Design System)**:

- Content: UI components, styling patterns, design tokens
- Sources: Component library, style files, theme configuration
- Diagrams: Component catalogue, colour palette, typography
- Key sections: Design tokens, component variants, accessibility

**TESTING.md (Frontend Testing)**:

- Content: Component testing, E2E testing, visual regression
- Sources: Test files, E2E configuration, snapshot tests
- Diagrams: Test coverage map
- Key sections: Component tests, E2E scenarios, mocking strategy

**CODING-ASSERTIONS.md (Frontend Standards)**:

- Content: Frontend coding standards, accessibility rules
- Sources: Lint config, accessibility config, style guides
- Key sections: Component patterns, accessibility checklist, performance

### Step 5: Identify Diagram Requirements

For each document, specify required diagrams:

**Diagram types**:

- **C4 Context**: System context and external actors
- **C4 Container**: Container-level architecture
- **C4 Component**: Internal component structure
- **Sequence**: Request/response flows
- **ERD**: Entity relationships
- **Flowchart**: Process flows
- **State**: State transitions
- **Network**: Network topology

**For each diagram specify**:

- Diagram ID (unique identifier)
- Diagram type (from above list)
- Target document
- Description of what to illustrate
- Key elements to include
- Mermaid syntax guidance

### Step 6: Establish Cross-References

Map relationships between documents:

**Cross-reference types**:

- **Depends on**: Document A requires understanding of Document B
- **Related to**: Documents cover overlapping topics
- **See also**: Optional additional context
- **Implements**: Technical doc implements concept from another

**Required cross-references**:

- HLD → CONTAINER, DEPLOYMENT (infrastructure relationships)
- API → DATA (endpoint to data model mapping)
- Backend ARCHITECTURE → API (service to endpoint mapping)
- Frontend ARCHITECTURE → Backend API (integration points)
- All TESTING docs → respective ARCHITECTURE docs

### Step 7: Assign Domain Responsibilities

Determine which domains to generate based on:

**Criteria for domain enablement**:

- `domain_filter` argument value
- Codebase structure (has_frontend, has_backend, has_infrastructure)
- Prerequisites available

**Assignment logic**:

```
infrastructure_enabled = (domain_filter in ["all", "infrastructure"]) AND has_infrastructure_code
backend_enabled = (domain_filter in ["all", "backend"]) AND has_backend_code
frontend_enabled = (domain_filter in ["all", "frontend"]) AND has_frontend_code
```

## Output Format

```json
{
  "documentation_plan": {
    "infrastructure": {
      "enabled": true,
      "documents": [
        {
          "id": "INFRA-HLD",
          "filename": "HLD.md",
          "title": "High-Level Design",
          "target_path": "knowledge-base/infrastructure/HLD.md",
          "priority": 1,
          "content_outline": [
            "Purpose and scope",
            "System context",
            "Technology stack overview",
            "C4 Context diagram",
            "C4 Container diagram",
            "Non-functional requirements mapping",
            "External integrations",
            "Troubleshooting",
            "Best practices",
            "Changelog"
          ],
          "source_references": {
            "prd_sections": ["Technology Stack", "NFRs", "Architecture Decisions"],
            "codebase_files": ["package.json", "docker-compose.yml"]
          },
          "estimated_sections": 10,
          "estimated_diagrams": 2
        }
      ]
    },
    "backend": {
      "enabled": true,
      "documents": [
        {
          "id": "BE-ARCH",
          "filename": "ARCHITECTURE.md",
          "title": "Backend Architecture",
          "target_path": "knowledge-base/backend/ARCHITECTURE.md",
          "priority": 1,
          "content_outline": [
            "Purpose and scope",
            "Architecture overview",
            "Component diagram",
            "Service design patterns",
            "Dependency management",
            "Error handling strategy",
            "Troubleshooting",
            "Best practices",
            "Changelog"
          ],
          "source_references": {
            "prd_sections": ["Technical Requirements", "Architecture Decisions"],
            "codebase_files": ["src/server/", "src/services/"]
          },
          "estimated_sections": 9,
          "estimated_diagrams": 3
        }
      ]
    },
    "frontend": {
      "enabled": true,
      "documents": [
        {
          "id": "FE-ARCH",
          "filename": "ARCHITECTURE.md",
          "title": "Frontend Architecture",
          "target_path": "knowledge-base/frontend/ARCHITECTURE.md",
          "priority": 1,
          "content_outline": [
            "Purpose and scope",
            "Component hierarchy",
            "State management",
            "Routing structure",
            "Data fetching patterns",
            "Troubleshooting",
            "Best practices",
            "Changelog"
          ],
          "source_references": {
            "prd_sections": ["User Stories", "Functional Requirements"],
            "codebase_files": ["src/client/", "src/components/"]
          },
          "estimated_sections": 8,
          "estimated_diagrams": 3
        }
      ]
    }
  },
  "diagram_requirements": {
    "infrastructure": [
      {
        "id": "DIAG-C4-CONTEXT",
        "type": "c4_context",
        "target_document": "INFRA-HLD",
        "title": "System Context Diagram",
        "description": "High-level view of system and external actors",
        "elements": ["System", "Users", "External Services", "Databases"],
        "mermaid_type": "C4Context"
      },
      {
        "id": "DIAG-C4-CONTAINER",
        "type": "c4_container",
        "target_document": "INFRA-HLD",
        "title": "Container Diagram",
        "description": "Container-level architecture showing API, Web App, Database",
        "elements": ["API Container", "Web App Container", "Database", "Cache"],
        "mermaid_type": "C4Container"
      }
    ],
    "backend": [
      {
        "id": "DIAG-BE-COMPONENT",
        "type": "component",
        "target_document": "BE-ARCH",
        "title": "Backend Component Diagram",
        "description": "Internal structure of backend services",
        "elements": ["Controllers", "Services", "Repositories", "Middleware"],
        "mermaid_type": "flowchart"
      },
      {
        "id": "DIAG-ERD",
        "type": "erd",
        "target_document": "BE-DATA",
        "title": "Entity Relationship Diagram",
        "description": "Data model relationships",
        "elements": ["User", "Task", "Project", "Comment"],
        "mermaid_type": "erDiagram"
      },
      {
        "id": "DIAG-API-SEQ",
        "type": "sequence",
        "target_document": "BE-API",
        "title": "API Request Flow",
        "description": "Typical API request/response sequence",
        "elements": ["Client", "API Gateway", "Service", "Database"],
        "mermaid_type": "sequenceDiagram"
      }
    ],
    "frontend": [
      {
        "id": "DIAG-FE-COMPONENT",
        "type": "component",
        "target_document": "FE-ARCH",
        "title": "Component Hierarchy",
        "description": "Frontend component tree structure",
        "elements": ["App", "Layout", "Pages", "Components"],
        "mermaid_type": "flowchart"
      },
      {
        "id": "DIAG-FE-STATE",
        "type": "state",
        "target_document": "FE-ARCH",
        "title": "State Management Flow",
        "description": "State flow through the application",
        "elements": ["Actions", "Store", "Selectors", "Components"],
        "mermaid_type": "flowchart"
      }
    ]
  },
  "cross_references": {
    "INFRA-HLD": {
      "depends_on": [],
      "related_to": ["INFRA-CONTAINER", "INFRA-DEPLOYMENT"],
      "see_also": ["BE-ARCH", "FE-ARCH"]
    },
    "BE-API": {
      "depends_on": ["BE-ARCH"],
      "related_to": ["BE-DATA"],
      "see_also": ["FE-ARCH"]
    },
    "FE-ARCH": {
      "depends_on": [],
      "related_to": ["FE-DESIGN"],
      "see_also": ["BE-API"]
    }
  },
  "domain_assignments": {
    "infrastructure": true,
    "backend": true,
    "frontend": true
  },
  "generation_order": [
    {"domain": "infrastructure", "parallel_group": 1},
    {"domain": "backend", "parallel_group": 1},
    {"domain": "frontend", "parallel_group": 1}
  ],
  "statistics": {
    "total_documents": 15,
    "total_diagrams": 12,
    "total_cross_references": 24,
    "estimated_generation_time_minutes": 15
  }
}
```

## Success Criteria

- ✅ Documentation plan covers all enabled domains
- ✅ Each document has clear content outline
- ✅ Diagram requirements specified with Mermaid types
- ✅ Cross-references established between related documents
- ✅ Domain assignments reflect filter and codebase
- ✅ Generation order enables parallel execution
- ✅ Source references map to available context

## Error Handling

### Insufficient Context for Domain

**Issue**: Cannot plan documentation for a domain due to missing context

**Action**:

1. Disable that domain in assignments
2. Warn user about limited scope
3. Proceed with available domains

### Conflicting Requirements

**Issue**: Filter requests domain but codebase lacks relevant code

**Action**:

1. Warn user about mismatch
2. Generate documentation from prerequisites only
3. Flag sections that need manual completion

## Notes

- This prompt focuses on PLANNING and ANALYSIS only
- No documentation content is generated here
- Output structures work for the three parallel generation prompts
- Diagram requirements include Mermaid syntax guidance
- Cross-references enable link validation in review stage

## CRITICAL: Complete Output Structure Required

**You MUST include ALL THREE domains in your output, even if some are disabled:**

- `documentation_plan` MUST contain keys: `infrastructure`, `backend`, `frontend`
- `diagram_requirements` MUST contain keys: `infrastructure`, `backend`, `frontend`
- `domain_assignments` MUST contain keys: `infrastructure`, `backend`, `frontend`

**For disabled domains**, use this structure:

```json
{
  "documentation_plan": {
    "infrastructure": { "enabled": false, "documents": [] },
    "backend": { "enabled": false, "documents": [] },
    "frontend": { "enabled": true, "documents": [...] }
  },
  "diagram_requirements": {
    "infrastructure": [],
    "backend": [],
    "frontend": [...]
  },
  "domain_assignments": {
    "infrastructure": false,
    "backend": false,
    "frontend": true
  }
}
```

**DO NOT omit any domain keys. The pipeline requires all three domains to be present.**

## REMINDER: Output Requirements

**Output ONLY the JSON object. No markdown, no code blocks, no explanatory text. Start directly with `{` and end with `}`.**
