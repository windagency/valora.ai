---
id: context.load-and-analyze-parallel
version: 1.0.0
category: context
experimental: true
name: Load and Analyze Context (Parallel)
description: Merged context loading and analysis stage for parallel documentation generation - saves 15s per workflow
tags:
  - documentation
  - context-loading
  - analysis
  - parallel
  - optimisation
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires: []
inputs:
  - name: output_dir_arg
    description: Optional output directory from --output-dir argument
    type: string
    required: false
  - name: cache_context
    description: Force use of cached context if available
    type: boolean
    required: false
  - name: security_context_path
    description: Path to security requirements file
    type: string
    required: false
outputs:
  - prd_document
  - functional_document
  - backlog_document
  - codebase_context
  - project_metadata
  - documentation_plan
  - diagram_requirements
  - cross_references
  - domain_assignments
  - security_context
tokens:
  avg: 8000
  max: 15000
  min: 5000
---

# Load and Analyze Context (Parallel)

## Objective

Perform **merged context loading and documentation analysis** in a single stage, reducing pipeline overhead by ~15 seconds. This prompt combines the functionality of `context.load-documentation-context` and `onboard.analyze-documentation-requirements` with internal parallelisation.

## CRITICAL: Output Format Requirement

**You MUST output ONLY valid JSON. Do NOT output markdown, do NOT wrap in code blocks, do NOT add any text before or after the JSON.**

## Optimisation Strategy

### Internal Parallelisation

Instead of sequential execution:
```
load-context (45s) → analyze-requirements (60s) = 105s
```

This prompt executes operations in parallel:
```
[load PRD + load FUNCTIONAL + load BACKLOG + scan codebase] → [analyze] = 90s
```

**Time saved**: ~15 seconds per workflow

---

## Instructions

### Phase 1: Parallel Document Loading (Concurrent)

Execute these operations concurrently:

**1.1 Load PRD Document**

Check locations in order:
1. `knowledge-base/PRD.md`
2. `knowledge-base/PRD-*.md` (most recent timestamped)
3. `docs/PRD.md`

Extract:
- Project name, description
- Technology stack
- Functional requirements (FR-XXX)
- Non-functional requirements (NFR-XXX)
- User stories (US-XXX)
- Architecture decisions

**1.2 Load FUNCTIONAL Document**

Check locations in order:
1. `knowledge-base/FUNCTIONAL.md`
2. `knowledge-base/FUNCTIONAL-*.md` (most recent)
3. `docs/FUNCTIONAL.md`

Extract:
- Feature specifications
- User flows
- Business rules
- Acceptance criteria
- Integration requirements

**1.3 Load BACKLOG Document**

Check locations in order:
1. `knowledge-base/BACKLOG.md`
2. `knowledge-base/BACKLOG-*.md` (most recent)
3. `docs/BACKLOG.md`

Extract:
- Task list and phases
- Domain distribution
- Priority distribution
- Effort estimates

**1.4 Scan Codebase Structure**

Analyse in parallel:
- Root directory layout
- `package.json` dependencies
- `tsconfig.json` configuration
- Dockerfile/docker-compose presence
- CI/CD configuration
- Source directory structure

**1.5 Load Security Context (if provided)**

If `security_context_path` is provided:
- Load security requirements file
- Parse compliance frameworks
- Extract security policies

### Phase 2: Unified Analysis (After Phase 1)

With all documents loaded, perform documentation planning:

**2.1 Plan Documentation Structure**

For each domain (infrastructure, backend, frontend):

**Infrastructure documentation plan**:
- HLD.md: High-level design with C4 diagrams
- CONTAINER.md: Container architecture
- DEPLOYMENT.md: Deployment processes
- LOGGING.md: Observability strategy
- LZ.md: Landing zone architecture
- WORKFLOW.md: Development workflows

**Backend documentation plan**:
- ARCHITECTURE.md: Backend architecture
- API.md: API documentation
- DATA.md: Data models and schemas
- TESTING.md: Testing strategy
- CODING-ASSERTIONS.md: Coding standards

**Frontend documentation plan**:
- ARCHITECTURE.md: Component architecture
- DESIGN.md: Design system
- TESTING.md: Frontend testing
- CODING-ASSERTIONS.md: Frontend standards

**2.2 Identify Diagram Requirements**

For each document, determine required diagrams:

| Document | Diagram Types |
|----------|---------------|
| HLD.md | C4 Context, C4 Container |
| CONTAINER.md | Container Topology |
| DEPLOYMENT.md | Deployment Pipeline |
| LOGGING.md | Observability Architecture |
| LZ.md | Network Topology |
| WORKFLOW.md | Git Flow |
| ARCHITECTURE.md | Component Diagram, Sequence Diagrams |
| API.md | Sequence Diagrams |
| DATA.md | ERD Diagram |
| DESIGN.md | Component Hierarchy |

**2.3 Map Cross-References**

Identify links between documents:

```text
HLD.md → CONTAINER.md (container details)
HLD.md → LZ.md (infrastructure details)
API.md → DATA.md (data models)
ARCHITECTURE.md → API.md (endpoint implementation)
```

**2.4 Assign Domain Generation**

Based on codebase analysis:

```json
{
  "infrastructure": true,  // if Dockerfile/k8s/terraform present
  "backend": true,         // if API routes/services present
  "frontend": true         // if React/Vue/Angular present
}
```

---

## Output Format

```json
{
  "prd_document": {
    "found": true,
    "source_file": "knowledge-base/PRD.md",
    "project_name": "Project Name",
    "project_description": "Project description",
    "technology_stack": {
      "frontend": ["React", "TypeScript"],
      "backend": ["Node.js", "Express"],
      "database": ["PostgreSQL"],
      "infrastructure": ["Docker", "AWS"]
    },
    "functional_requirements": [
      {"id": "FR-001", "title": "Feature", "priority": "P0", "domain": "Backend"}
    ],
    "non_functional_requirements": [
      {"id": "NFR-001", "category": "Performance", "description": "...", "priority": "P0"}
    ],
    "user_stories_count": 23,
    "constraints": [],
    "architecture_decisions": []
  },
  "functional_document": {
    "found": true,
    "source_file": "knowledge-base/FUNCTIONAL.md",
    "features": [
      {"id": "FEAT-001", "name": "Feature", "description": "...", "user_flows": 3}
    ],
    "business_rules_count": 15,
    "integration_points": [],
    "data_entities": []
  },
  "backlog_document": {
    "found": true,
    "source_file": "knowledge-base/BACKLOG.md",
    "total_tasks": 42,
    "phases": 5,
    "domain_distribution": {
      "frontend": 12,
      "backend": 18,
      "infrastructure": 8
    },
    "priority_distribution": {
      "p0": 14,
      "p1": 18,
      "p2": 10
    }
  },
  "codebase_context": {
    "project_type": "full-stack",
    "primary_language": "TypeScript",
    "structure": {
      "has_frontend": true,
      "has_backend": true,
      "has_infrastructure": true
    },
    "directories": {
      "frontend": "src/client",
      "backend": "src/server",
      "infrastructure": "infrastructure/"
    },
    "detected_technologies": {
      "frontend_framework": "React 18",
      "backend_framework": "Express 4",
      "build_tool": "Vite"
    }
  },
  "project_metadata": {
    "name": "Project Name",
    "type": "full-stack",
    "language": "TypeScript",
    "documentation_target_dir": "knowledge-base/",
    "domains_to_document": {
      "infrastructure": true,
      "backend": true,
      "frontend": true
    }
  },
  "documentation_plan": {
    "infrastructure": {
      "enabled": true,
      "documents": [
        {"id": "HLD", "filename": "HLD.md", "sections": 13},
        {"id": "CONTAINER", "filename": "CONTAINER.md", "sections": 15},
        {"id": "DEPLOYMENT", "filename": "DEPLOYMENT.md", "sections": 16},
        {"id": "LOGGING", "filename": "LOGGING.md", "sections": 16},
        {"id": "LZ", "filename": "LZ.md", "sections": 16},
        {"id": "WORKFLOW", "filename": "WORKFLOW.md", "sections": 15}
      ]
    },
    "backend": {
      "enabled": true,
      "documents": [
        {"id": "ARCHITECTURE", "filename": "ARCHITECTURE.md", "sections": 12},
        {"id": "API", "filename": "API.md", "sections": 10},
        {"id": "DATA", "filename": "DATA.md", "sections": 10},
        {"id": "TESTING", "filename": "TESTING.md", "sections": 10},
        {"id": "CODING-ASSERTIONS", "filename": "CODING-ASSERTIONS.md", "sections": 8}
      ]
    },
    "frontend": {
      "enabled": true,
      "documents": [
        {"id": "ARCHITECTURE", "filename": "ARCHITECTURE.md", "sections": 10},
        {"id": "DESIGN", "filename": "DESIGN.md", "sections": 10},
        {"id": "TESTING", "filename": "TESTING.md", "sections": 8},
        {"id": "CODING-ASSERTIONS", "filename": "CODING-ASSERTIONS.md", "sections": 8}
      ]
    }
  },
  "diagram_requirements": {
    "infrastructure": [
      {"document": "HLD.md", "diagrams": ["C4 Context", "C4 Container"]},
      {"document": "CONTAINER.md", "diagrams": ["Container Topology"]},
      {"document": "DEPLOYMENT.md", "diagrams": ["Deployment Pipeline"]},
      {"document": "LOGGING.md", "diagrams": ["Observability Architecture"]},
      {"document": "LZ.md", "diagrams": ["Network Topology"]},
      {"document": "WORKFLOW.md", "diagrams": ["Git Flow"]}
    ],
    "backend": [
      {"document": "ARCHITECTURE.md", "diagrams": ["Component Diagram"]},
      {"document": "API.md", "diagrams": ["Sequence Diagrams"]},
      {"document": "DATA.md", "diagrams": ["ERD"]}
    ],
    "frontend": [
      {"document": "ARCHITECTURE.md", "diagrams": ["Component Hierarchy"]},
      {"document": "DESIGN.md", "diagrams": ["Design System"]}
    ]
  },
  "cross_references": {
    "infrastructure": {
      "HLD.md": ["CONTAINER.md", "LZ.md", "DEPLOYMENT.md"],
      "CONTAINER.md": ["DEPLOYMENT.md", "HLD.md"],
      "DEPLOYMENT.md": ["CONTAINER.md", "LOGGING.md", "WORKFLOW.md"],
      "LOGGING.md": ["DEPLOYMENT.md", "LZ.md"],
      "LZ.md": ["HLD.md", "DEPLOYMENT.md"],
      "WORKFLOW.md": ["DEPLOYMENT.md"]
    },
    "backend": {
      "ARCHITECTURE.md": ["API.md", "DATA.md"],
      "API.md": ["DATA.md", "ARCHITECTURE.md"],
      "DATA.md": ["API.md"],
      "TESTING.md": ["API.md", "ARCHITECTURE.md"],
      "CODING-ASSERTIONS.md": ["ARCHITECTURE.md"]
    },
    "frontend": {
      "ARCHITECTURE.md": ["DESIGN.md"],
      "DESIGN.md": ["ARCHITECTURE.md"],
      "TESTING.md": ["ARCHITECTURE.md", "DESIGN.md"],
      "CODING-ASSERTIONS.md": ["ARCHITECTURE.md"]
    },
    "cross_domain": {
      "backend/API.md": ["frontend/ARCHITECTURE.md"],
      "infrastructure/DEPLOYMENT.md": ["backend/ARCHITECTURE.md", "frontend/ARCHITECTURE.md"]
    }
  },
  "domain_assignments": {
    "infrastructure": true,
    "backend": true,
    "frontend": true
  },
  "security_context": {
    "loaded": false,
    "source_file": null,
    "compliance_frameworks": [],
    "security_policies": [],
    "threat_model_reference": null
  },
  "validation": {
    "prerequisites_met": true,
    "documents_found": 3,
    "codebase_analysed": true,
    "ready_for_generation": true,
    "coverage_estimate": 0.92,
    "warnings": []
  },
  "timing": {
    "phase1_parallel_ms": 45000,
    "phase2_analysis_ms": 45000,
    "total_ms": 90000,
    "estimated_savings_ms": 15000
  }
}
```

## Success Criteria

- ✅ All available prerequisite documents loaded in parallel
- ✅ Codebase structure analysed concurrently
- ✅ Documentation plan generated for all domains
- ✅ Diagram requirements identified
- ✅ Cross-references mapped
- ✅ Domain assignments determined
- ✅ Security context loaded (if provided)
- ✅ Total execution < 90 seconds

## Error Handling

### No Prerequisites Found

**Action**: Exit with error, inform user to run prerequisite commands.

### Partial Prerequisites

**Action**: Continue with available context, set warnings, reduce coverage estimate.

### Security Context Not Found

**Action**: Set `security_context.loaded: false`, continue without security context.

## REMINDER: Output Requirements

**Output ONLY the JSON object. No markdown, no code blocks, no explanatory text. Start directly with `{` and end with `}`.**
