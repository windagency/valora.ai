---
id: context.load-documentation-context
version: 1.0.0
category: context
experimental: true
name: Load Documentation Context
description: Load PRD, FUNCTIONAL, BACKLOG, and codebase context for documentation generation
tags:
  - documentation
  - context-loading
  - prerequisites
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - lead
dependencies:
  requires:
    - context.use-modern-cli-tools
inputs:
  - name: output_dir_arg
    description: Optional output directory from --output-dir argument
    type: string
    required: false
outputs:
  - prd_document
  - functional_document
  - backlog_document
  - codebase_context
  - project_metadata
tokens:
  avg: 5000
  max: 10000
  min: 2500
---

# Load Documentation Context

## Objective

Load and parse all prerequisite documents (PRD, FUNCTIONAL, BACKLOG) and analyse the codebase to establish comprehensive context for technical documentation generation.

## CRITICAL: Output Format Requirement

**You MUST output ONLY valid JSON. Do NOT output markdown, do NOT wrap in code blocks, do NOT add any text before or after the JSON.**

Your response must be a single JSON object matching the schema defined in the "Output Format" section at the end of this prompt.

## Instructions

### Step 1: Locate and Load PRD Document

Check for PRD in priority order:

1. **Primary location**: `knowledge-base/PRD.md`
2. **Timestamped version**: `knowledge-base/PRD-*.md` (most recent)
3. **Alternative location**: `docs/PRD.md`

**Extract from PRD**:

- Project name and description
- Technology stack
- Functional requirements (FR-XXX)
- Non-functional requirements (NFR-XXX)
- User stories (US-XXX)
- Architecture decisions
- Constraints and assumptions

**If not found**: Set `prd_found: false` and continue with warnings.

### Step 2: Locate and Load FUNCTIONAL Document

Check for FUNCTIONAL specification:

1. **Primary location**: `knowledge-base/FUNCTIONAL.md`
2. **Timestamped version**: `knowledge-base/FUNCTIONAL-*.md` (most recent)
3. **Alternative location**: `docs/FUNCTIONAL.md`

**Extract from FUNCTIONAL**:

- Feature specifications
- User flows
- Business rules
- Acceptance criteria
- Integration requirements
- Data requirements

**If not found**: Set `functional_found: false` and continue with warnings.

### Step 3: Locate and Load BACKLOG Document

Check for BACKLOG:

1. **Primary location**: `knowledge-base/BACKLOG.md`
2. **Timestamped version**: `knowledge-base/BACKLOG-*.md` (most recent)
3. **Alternative location**: `docs/BACKLOG.md`

**Extract from BACKLOG**:

- Task list overview
- Implementation phases
- Domain distribution (frontend, backend, infrastructure)
- Effort estimates
- Dependencies between tasks
- Priority distribution

**If not found**: Set `backlog_found: false` and continue with warnings.

### Step 4: Analyse Codebase Structure

Scan the codebase to understand:

**Project structure**:

- Root directory layout
- Source code organisation (src/, lib/, app/, etc.)
- Configuration files (package.json, tsconfig.json, Dockerfile, etc.)
- Test directory structure

**Technology detection**:

- Frontend framework (React, Vue, Angular, Next.js, etc.)
- Backend framework (Express, Fastify, NestJS, etc.)
- Database (PostgreSQL, MongoDB, MySQL, etc.)
- Infrastructure (Docker, Kubernetes, AWS, GCP, Azure)
- Build tools (Webpack, Vite, esbuild, etc.)

**Key files to examine**:

- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `Dockerfile` / `docker-compose.yml` - Container configuration
- `.github/workflows/` - CI/CD configuration
- `src/` structure - Application architecture

### Step 5: Build Project Metadata

Compile project metadata from all sources:

**Core metadata**:

- Project name
- Project type (monorepo, frontend-only, full-stack, API-only)
- Primary language (TypeScript, JavaScript, etc.)
- Framework versions

**Domain presence**:

- Has infrastructure code (Dockerfile, k8s, terraform)
- Has backend code (API routes, services, models)
- Has frontend code (components, pages, styles)

**Documentation status**:

- Existing documentation files
- Coverage gaps
- Last update timestamps

### Step 6: Validate Prerequisites

Check minimum requirements for documentation generation:

**Required for proceed**:

- [ ] At least 1 of (PRD, FUNCTIONAL, BACKLOG) exists
- [ ] Codebase has identifiable structure
- [ ] Technology stack can be determined

**Warnings**:

- [ ] Missing PRD (limited high-level context)
- [ ] Missing FUNCTIONAL (limited feature detail)
- [ ] Missing BACKLOG (limited implementation context)
- [ ] Sparse codebase (limited technical detail)

**Decision logic**:

- **All 3 documents present**: Full documentation generation
- **2 documents present**: Partial generation with warnings
- **1 document present**: Minimal generation with significant warnings
- **0 documents present**: Cannot proceed, exit with error

## Output Format

```json
{
  "prd_document": {
    "found": true,
    "source_file": "knowledge-base/PRD.md",
    "project_name": "Task Management Platform",
    "project_description": "Real-time task management for remote teams",
    "technology_stack": {
      "frontend": ["React", "TypeScript", "TailwindCSS"],
      "backend": ["Node.js", "Express", "TypeScript"],
      "database": ["PostgreSQL"],
      "infrastructure": ["Docker", "AWS ECS", "GitHub Actions"]
    },
    "functional_requirements": [
      {
        "id": "FR-001",
        "title": "Create and assign tasks",
        "priority": "P0",
        "domain": "Backend"
      }
    ],
    "non_functional_requirements": [
      {
        "id": "NFR-001",
        "category": "Performance",
        "description": "Page load under 2 seconds (p95)",
        "priority": "P0"
      }
    ],
    "user_stories_count": 23,
    "constraints": ["Must use existing PostgreSQL database", "GDPR compliant"],
    "architecture_decisions": ["Event-driven architecture", "REST API"]
  },
  "functional_document": {
    "found": true,
    "source_file": "knowledge-base/FUNCTIONAL.md",
    "features": [
      {
        "id": "FEAT-001",
        "name": "Task Management",
        "description": "CRUD operations for tasks",
        "user_flows": 3
      }
    ],
    "business_rules_count": 15,
    "integration_points": ["Slack API", "Email Service"],
    "data_entities": ["User", "Task", "Project", "Comment"]
  },
  "backlog_document": {
    "found": true,
    "source_file": "knowledge-base/BACKLOG.md",
    "total_tasks": 42,
    "phases": 5,
    "domain_distribution": {
      "frontend": 12,
      "backend": 18,
      "infrastructure": 8,
      "data": 2,
      "testing": 1,
      "documentation": 1
    },
    "priority_distribution": {
      "p0": 14,
      "p1": 18,
      "p2": 10
    },
    "estimated_effort_days": 87
  },
  "codebase_context": {
    "project_type": "full-stack",
    "primary_language": "TypeScript",
    "structure": {
      "has_frontend": true,
      "has_backend": true,
      "has_infrastructure": true,
      "is_monorepo": false
    },
    "directories": {
      "frontend": "src/client",
      "backend": "src/server",
      "infrastructure": "infrastructure/",
      "tests": "tests/"
    },
    "key_files": {
      "package_json": "package.json",
      "tsconfig": "tsconfig.json",
      "dockerfile": "Dockerfile",
      "docker_compose": "docker-compose.yml",
      "ci_config": ".github/workflows/ci.yml"
    },
    "detected_technologies": {
      "frontend_framework": "React 18",
      "backend_framework": "Express 4",
      "build_tool": "Vite",
      "test_framework": "Vitest",
      "orm": "Prisma",
      "container_runtime": "Docker"
    },
    "existing_documentation": [
      "README.md",
      "CONTRIBUTING.md"
    ]
  },
  "project_metadata": {
    "name": "Task Management Platform",
    "type": "full-stack",
    "language": "TypeScript",
    "created_date": "2025-01-01",
    "documentation_target_dir": "knowledge-base/",
    "domains_to_document": {
      "infrastructure": true,
      "backend": true,
      "frontend": true
    }
  },
  "validation": {
    "prerequisites_met": true,
    "prd_found": true,
    "functional_found": true,
    "backlog_found": true,
    "codebase_analysed": true,
    "warnings": [
      "Some infrastructure files not detected"
    ],
    "ready_for_documentation": true,
    "coverage_estimate": 0.92
  }
}
```

## Success Criteria

- ✅ PRD document located and parsed (if exists)
- ✅ FUNCTIONAL document located and parsed (if exists)
- ✅ BACKLOG document located and parsed (if exists)
- ✅ Codebase structure analysed
- ✅ Technology stack detected
- ✅ Project metadata compiled
- ✅ Prerequisites validated
- ✅ Ready for documentation planning stage

## Error Handling

### No Prerequisites Found

**Issue**: Cannot locate any prerequisite documents

**Action**:

1. List files in knowledge-base/ and docs/
2. Inform user: "No prerequisite documents found. Please run `/create-prd`, `/refine-specs`, or `/create-backlog` first."
3. Exit with error (do not proceed)

### Partial Prerequisites

**Issue**: Some documents missing

**Action**:

1. Document which prerequisites are present/missing
2. Warn user about limited documentation scope
3. Proceed with available context

### Empty Codebase

**Issue**: Cannot detect codebase structure

**Action**:

1. Warn user about limited technical context
2. Rely more heavily on PRD/FUNCTIONAL for documentation
3. Generate placeholder sections for codebase-specific content

## Notes

- This prompt focuses on LOADING and CONTEXT BUILDING only
- No documentation generation happens here
- Output is structured for consumption by `analyze-documentation-requirements`
- Preserve original document content for reference in later stages
- Flag any ambiguities or gaps for the analysis stage

## CRITICAL: Complete Output Structure Required

**You MUST include ALL THREE domains in `domains_to_document`, even if some are false:**

```json
{
  "project_metadata": {
    "domains_to_document": {
      "infrastructure": false,
      "backend": false,
      "frontend": true
    }
  }
}
```

**DO NOT omit any domain keys. The pipeline requires all three domains to be present.**

## REMINDER: Output Requirements

**Output ONLY the JSON object. No markdown, no code blocks, no explanatory text. Start directly with `{` and end with `}`.**
