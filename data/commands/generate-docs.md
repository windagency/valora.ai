---
name: generate-docs
description: Generate comprehensive technical documentation across infrastructure, backend, and frontend domains using a 7-stage pipeline
experimental: true
argument-hint: '[--domain=<infrastructure|backend|frontend|all>] [--doc-type=<specific>] [--output-dir=<path>] [--quick] [--extract-only]'
allowed-tools:
  - read_file
  - write
  - list_dir
  - glob_file_search
  - codebase_search
  - grep
  - run_terminal_cmd # Required for modern CLI tools (jq, yq, rg, fd)
model: claude-opus-4.5
agent: lead
prompts:
  pipeline:
    - stage: context
      prompt: context.load-documentation-context
      required: true
      cache:
        enabled: true
        ttl_ms: 3600000
        file_dependencies:
          - knowledge-base/PRD.md
          - knowledge-base/FUNCTIONAL.md
          - knowledge-base/BACKLOG.md
      inputs:
        output_dir_arg: $ARG_output_dir
      outputs:
        - prd_document
        - functional_document
        - backlog_document
        - codebase_context
        - project_metadata
      timeout_ms: 45000
    - stage: analyze
      prompt: onboard.analyze-documentation-requirements
      required: true
      inputs:
        prd: $STAGE_context.prd_document
        functional: $STAGE_context.functional_document
        backlog: $STAGE_context.backlog_document
        codebase: $STAGE_context.codebase_context
        metadata: $STAGE_context.project_metadata
        domain_filter: $ARG_domain
        doc_type_filter: $ARG_doc_type
      outputs:
        - documentation_plan
        - diagram_requirements
        - cross_references
        - domain_assignments
      timeout_ms: 60000
    - stage: generateInfra
      prompt: documentation.generate-infrastructure-docs
      batch: true
      required: false
      conditional: $STAGE_analyze.domain_assignments.infrastructure
      parallel: true
      inputs:
        documentation_plan: $STAGE_analyze.documentation_plan
        diagram_requirements: $STAGE_analyze.diagram_requirements
        cross_refs: $STAGE_analyze.cross_references
        prd: $STAGE_context.prd_document
        codebase: $STAGE_context.codebase_context
        target_domain: infrastructure
      outputs:
        - hld_document
        - container_document
        - deployment_document
        - logging_document
        - lz_document
        - workflow_document
      timeout_ms: 180000
    - stage: generateBackend
      prompt: documentation.generate-backend-docs
      batch: true
      required: false
      conditional: $STAGE_analyze.domain_assignments.backend
      parallel: true
      inputs:
        documentation_plan: $STAGE_analyze.documentation_plan
        diagram_requirements: $STAGE_analyze.diagram_requirements
        cross_refs: $STAGE_analyze.cross_references
        prd: $STAGE_context.prd_document
        codebase: $STAGE_context.codebase_context
        target_domain: backend
      outputs:
        - architecture_document
        - api_document
        - data_document
        - testing_document
        - coding_assertions_document
      timeout_ms: 180000
    - stage: generateFrontend
      prompt: documentation.generate-frontend-docs
      batch: true
      required: false
      conditional: $STAGE_analyze.domain_assignments.frontend
      parallel: true
      inputs:
        documentation_plan: $STAGE_analyze.documentation_plan
        diagram_requirements: $STAGE_analyze.diagram_requirements
        cross_refs: $STAGE_analyze.cross_references
        prd: $STAGE_context.prd_document
        codebase: $STAGE_context.codebase_context
        target_domain: frontend
      outputs:
        - architecture_document
        - design_document
        - testing_document
        - coding_assertions_document
      timeout_ms: 180000
    - stage: review
      prompt: review.validate-documentation
      batch: true
      required: true
      inputs:
        infrastructure_docs: $STAGE_generateInfra
        backend_docs: $STAGE_generateBackend
        frontend_docs: $STAGE_generateFrontend
        documentation_plan: $STAGE_analyze.documentation_plan
        cross_references: $STAGE_analyze.cross_references
        domain_assignments: $STAGE_analyze.domain_assignments
      outputs:
        - validation_results
        - completeness_score
        - quality_issues
        - cross_reference_status
      timeout_ms: 90000
    - stage: persist
      prompt: documentation.persist-documentation
      required: true
      inputs:
        infrastructure_docs: $STAGE_generateInfra
        backend_docs: $STAGE_generateBackend
        frontend_docs: $STAGE_generateFrontend
        validation_results: $STAGE_review.validation_results
        completeness_score: $STAGE_review.completeness_score
        output_dir: $ARG_output_dir
        project_metadata: $STAGE_context.project_metadata
        domain_assignments: $STAGE_analyze.domain_assignments
      outputs:
        - written_files
        - backup_files
        - handoff_summary
      timeout_ms: 120000
  merge_strategy: sequential
  rollback_on_failure: context
  cache_strategy: stage
  retry_policy:
    max_attempts: 2
    backoff_ms: 1000
    retry_on:
      - validation_failed
      - error
---

# Documentation Generation Command

## Role

Use the **@lead** agent profile for orchestration, with domain-specific agents for generation:

- **@platform-engineer** for infrastructure documentation
- **@software-engineer-typescript-backend** for backend documentation
- **@software-engineer-typescript-frontend** for frontend documentation

## Goal

Generate **comprehensive technical documentation** (15 files) across infrastructure, backend, and frontend domains through an automated 7-stage pipeline:

1. **Context**: Load PRD, FUNCTIONAL, BACKLOG, and codebase context
2. **Analyze**: Plan documentation structure, identify diagram needs
3. **Generate Infrastructure**: Create 6 infrastructure documents (parallel)
4. **Generate Backend**: Create 5 backend documents (parallel)
5. **Generate Frontend**: Create 4 frontend documents (parallel)
6. **Review**: Validate completeness (>= 85% threshold)
7. **Persist**: Write files to knowledge-base with backups

## Input Arguments

**Available arguments** (accessible via `$ARGUMENTS`):

- `--domain=<infrastructure|backend|frontend|all>`: Filter documentation domain (default: all)
  - **all**: Generate all 15 documents (default)
  - **infrastructure**: Generate only 6 infrastructure documents
  - **backend**: Generate only 5 backend documents
  - **frontend**: Generate only 4 frontend documents
- `--doc-type=<specific>`: Generate only a specific document type
  - Examples: `HLD`, `API`, `ARCHITECTURE`, `DESIGN`
- `--output-dir=<path>`: Output directory (default: `knowledge-base/`)
- `--quick`: Use quick templates for faster generation (~50% time reduction)
- `--extract-only`: Run extraction phase only (DOC_EXTRACTION_CHECKLIST.md)

## Target Documentation (15 files)

| Domain                 | Files                                                               | Agent                                 |
| ---------------------- | ------------------------------------------------------------------- | ------------------------------------- |
| **Infrastructure** (6) | HLD.md, CONTAINER.md, DEPLOYMENT.md, LOGGING.md, LZ.md, WORKFLOW.md | platform-engineer                     |
| **Backend** (5)        | ARCHITECTURE.md, API.md, DATA.md, TESTING.md, CODING-ASSERTIONS.md  | software-engineer-typescript-backend  |
| **Frontend** (4)       | ARCHITECTURE.md, DESIGN.md, TESTING.md, CODING-ASSERTIONS.md        | software-engineer-typescript-frontend |

## Pipeline Execution

The command executes a **7-stage pipeline** with parallel generation phases. Each stage is handled by a dedicated prompt (see `data/prompts/` directory):

| Stage                    | Prompt                                       | Agent                                 | Purpose                                 | Key Outputs                                                                                                         |
| ------------------------ | -------------------------------------------- | ------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **1. Context**           | `context.load-documentation-context`         | lead                                  | Load PRD, FUNCTIONAL, BACKLOG, codebase | `prd_document`, `functional_document`, `backlog_document`, `codebase_context`                                       |
| **2. Analyze**           | `onboard.analyze-documentation-requirements` | lead                                  | Plan doc structure, diagram needs       | `documentation_plan`, `diagram_requirements`, `cross_references`                                                    |
| **3. Generate Infra**    | `documentation.generate-infrastructure-docs` | platform-engineer                     | Generate 6 infrastructure docs          | `hld_document`, `container_document`, `deployment_document`, `logging_document`, `lz_document`, `workflow_document` |
| **4. Generate Backend**  | `documentation.generate-backend-docs`        | software-engineer-typescript-backend  | Generate 5 backend docs                 | `architecture_document`, `api_document`, `data_document`, `testing_document`, `coding_assertions_document`          |
| **5. Generate Frontend** | `documentation.generate-frontend-docs`       | software-engineer-typescript-frontend | Generate 4 frontend docs                | `architecture_document`, `design_document`, `testing_document`, `coding_assertions_document`                        |
| **6. Review**            | `review.validate-documentation`              | lead                                  | Validate completeness (>= 85%)          | `validation_results`, `completeness_score`, `quality_issues`                                                        |
| **7. Persist**           | `documentation.persist-documentation`        | lead                                  | Write files, create backups             | `written_files`, `backup_files`, `handoff_summary`                                                                  |

**Pipeline behaviour**:

- **Sequential execution** for context, analyze, review, persist stages
- **Parallel execution** for generate-infra, generate-backend, generate-frontend stages
- **Conditional execution** based on `--domain` filter
- **Stage caching**: Outputs cached for retry scenarios
- **Rollback on failure**: Failures trigger rollback to context stage
- **Retry policy**: Max 2 attempts per stage with 1s backoff

---

## Generated Artifacts

After successful pipeline execution, the following files are created:

### Infrastructure Documentation (6 files)

| File                                          | Description                                                       |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `knowledge-base/infrastructure/HLD.md`        | High-Level Design with C4 diagrams, technology stack, NFR mapping |
| `knowledge-base/infrastructure/CONTAINER.md`  | Container architecture, Docker configuration, image management    |
| `knowledge-base/infrastructure/DEPLOYMENT.md` | Deployment processes, environments, CI/CD pipelines               |
| `knowledge-base/infrastructure/LOGGING.md`    | Logging strategy, monitoring, alerting, observability             |
| `knowledge-base/infrastructure/LZ.md`         | Landing zone architecture, network topology, security boundaries  |
| `knowledge-base/infrastructure/WORKFLOW.md`   | Development workflows, branching strategy, release process        |

### Backend Documentation (5 files)

| File                                          | Description                                                   |
| --------------------------------------------- | ------------------------------------------------------------- |
| `knowledge-base/backend/ARCHITECTURE.md`      | Backend architecture, service design, patterns, dependencies  |
| `knowledge-base/backend/API.md`               | API documentation, OpenAPI-style endpoints, sequence diagrams |
| `knowledge-base/backend/DATA.md`              | Data models, ERD diagrams, database design, migrations        |
| `knowledge-base/backend/TESTING.md`           | Testing strategy, coverage requirements, test patterns        |
| `knowledge-base/backend/CODING-ASSERTIONS.md` | Coding standards, assertions, validation rules                |

### Frontend Documentation (4 files)

| File                                           | Description                                     |
| ---------------------------------------------- | ----------------------------------------------- |
| `knowledge-base/frontend/ARCHITECTURE.md`      | Component hierarchy, state management, routing  |
| `knowledge-base/frontend/DESIGN.md`            | Design system, UI components, styling patterns  |
| `knowledge-base/frontend/TESTING.md`           | Frontend testing strategy, component tests, E2E |
| `knowledge-base/frontend/CODING-ASSERTIONS.md` | Frontend coding standards, accessibility rules  |

### Versioned Backups

For each generated file, a timestamped backup is created:

- Format: `[FILENAME]-[YYYYMMDDHHmmss].md`
- Example: `HLD-20251113143022.md`

---

## Document Standards

All generated documents follow these standards:

### Header Format

```markdown
# [Document Title]

| Attribute        | Value                       |
| ---------------- | --------------------------- |
| **Purpose**      | [Brief purpose description] |
| **Version**      | 1.0.0                       |
| **Author**       | AI Documentation Generator  |
| **Created**      | [YYYY-MM-DD]                |
| **Last Updated** | [YYYY-MM-DD]                |
| **Status**       | Draft                       |
```

### Language Standards

- **British English** for documentation prose
- **American English** for code snippets and technical terms
- Consistent spelling throughout (colour, behaviour, organisation)

### Diagram Requirements

All architecture documents include Mermaid diagrams:

- **C4 Context Diagram**: System context and external interactions
- **C4 Container Diagram**: Container architecture and relationships
- **Component Diagrams**: Internal structure of containers
- **Sequence Diagrams**: Key flows and interactions
- **ERD Diagrams**: Data model relationships
- **Flowcharts**: Process and decision flows

### Standard Sections

All documents include:

- **Purpose** section at the top
- **Overview** with key concepts
- **Detailed content** with diagrams
- **Troubleshooting** section
- **Best Practices** section
- **Changelog** table at the bottom

### Cross-References

Documents include cross-references to related documentation:

```markdown
## Related Documentation

- [API Documentation](../backend/API.md) - API endpoint details
- [Data Models](../backend/DATA.md) - Database schema
- [Deployment Guide](../infrastructure/DEPLOYMENT.md) - Deployment process
```

---

## Command Output

After successful execution, display handoff summary:

```markdown
# ✅ Technical Documentation Generated

**Output Directory**: `knowledge-base/`
**Completeness Score**: [XX%]
**Validation Status**: [Pass/Pass with Warnings/Needs Review]

---

## 📊 Generation Summary

- **Total Documents**: 15
  - Infrastructure: 6 documents
  - Backend: 5 documents
  - Frontend: 4 documents
- **Diagrams Generated**: [XX]
- **Cross-References**: [XX] links verified

---

## 📁 Generated Files

### Infrastructure

- ✅ `knowledge-base/infrastructure/HLD.md`
- ✅ `knowledge-base/infrastructure/CONTAINER.md`
- ✅ `knowledge-base/infrastructure/DEPLOYMENT.md`
- ✅ `knowledge-base/infrastructure/LOGGING.md`
- ✅ `knowledge-base/infrastructure/LZ.md`
- ✅ `knowledge-base/infrastructure/WORKFLOW.md`

### Backend

- ✅ `knowledge-base/backend/ARCHITECTURE.md`
- ✅ `knowledge-base/backend/API.md`
- ✅ `knowledge-base/backend/DATA.md`
- ✅ `knowledge-base/backend/TESTING.md`
- ✅ `knowledge-base/backend/CODING-ASSERTIONS.md`

### Frontend

- ✅ `knowledge-base/frontend/ARCHITECTURE.md`
- ✅ `knowledge-base/frontend/DESIGN.md`
- ✅ `knowledge-base/frontend/TESTING.md`
- ✅ `knowledge-base/frontend/CODING-ASSERTIONS.md`

---

## 🚀 Next Steps

✅ **Documentation is ready for review.**

**Recommended actions**:

1. Review generated diagrams in VS Code preview
2. Verify cross-references are working
3. Update any project-specific details
4. Proceed to `/fetch-task` for implementation
```

---

## Success Indicators

**Pipeline succeeds when**:

1. ✅ All requested stages complete successfully
2. ✅ Completeness score >= 85% (ideally >= 95%)
3. ✅ All required sections present in each document
4. ✅ Mermaid diagrams render correctly
5. ✅ Cross-references resolve to valid paths
6. ✅ British English spelling in prose sections
7. ✅ Standardised headers on all documents
8. ✅ Troubleshooting and best practices sections included
9. ✅ Changelog tables at document end
10. ✅ User receives clear handoff summary

---

## Integration with Workflow

**Entry Point**: After `/create-backlog` (Initialisation Phase)

```
/refine-specs → /create-prd → /create-backlog → /generate-docs → /fetch-task
                                                      ↑
                                            (Initialisation Phase)
```

**Prerequisites**:

- ✅ PRD document exists (knowledge-base/PRD.md)
- ✅ FUNCTIONAL document exists (knowledge-base/FUNCTIONAL.md)
- ✅ BACKLOG document exists (knowledge-base/BACKLOG.md)

**Exit Points**:

- ✅ **Success** (completeness >= 95%): → `/fetch-task`
- ⚠️ **Warning** (85-94% completeness): → `/fetch-task` (with noted gaps)
- 🔄 **Iteration** (completeness < 85%): → Address gaps, re-run
- ❌ **Blocked** (critical issues): → Human review

**See**: `WORKFLOW.md` for complete development lifecycle

---

## Command Principles

**DO**:

- ✅ Execute pipeline with parallel generation stages
- ✅ Use domain-specific agents for technical accuracy
- ✅ Include comprehensive Mermaid diagrams
- ✅ Validate cross-references between documents
- ✅ Create versioned backups before overwriting
- ✅ Provide clear handoff with next steps
- ✅ Use British English in prose, American in code

**DON'T**:

- ❌ Skip validation stage (always validate)
- ❌ Proceed if completeness < 70% (insufficient)
- ❌ Generate without prerequisites (PRD, FUNCTIONAL, BACKLOG)
- ❌ Create broken cross-references
- ❌ Mix British/American English within documents
- ❌ Omit troubleshooting or best practices sections

---

## Error Handling

| Error                            | Action                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------- |
| **Prerequisites Missing**        | List missing files, inform user to run prerequisite commands, exit with error |
| **Insufficient Context** (< 85%) | Show gaps, recommend refining prerequisites or proceeding with limitations    |
| **Diagram Rendering Errors**     | Validate Mermaid syntax, simplify if too complex, warn user                   |
| **Cross-Reference Failures**     | Report broken links, suggest fixes, generate without broken links             |
| **File Write Errors**            | Report specific error, suggest manual creation with provided content          |
| **Existing Documentation**       | Create backup first, ask to overwrite or create new version                   |

**Error recovery**: Pipeline uses retry policy (max 2 attempts per stage) and rollback on failure. Stage outputs are cached for retry scenarios.

---

## Notes

**Pipeline Configuration**:

- Sequential merge strategy with stage caching for context/analyze/review/persist
- Parallel execution for generate-infra/generate-backend/generate-frontend
- Rollback to context stage on failure
- Max 2 retry attempts per stage with 1s backoff

**Domain Selection**:

- **all**: Generates complete documentation suite (15 files)
- **infrastructure**: Only infrastructure documentation (6 files)
- **backend**: Only backend documentation (5 files)
- **frontend**: Only frontend documentation (4 files)

**Token Optimisation**:

- Uses **claude-haiku-4.5** for cost efficiency
- Domain-specific agents for accurate technical content
- Stage caching reduces re-computation on retries

**Existing Documentation**: If documents exist, creates timestamped backup before overwrite

---

## Quick Generation Mode

When `--quick` flag is used, generation is accelerated using pre-built templates:

### Quick Templates Available

| Template                      | Purpose                           | Use Case              |
| ----------------------------- | --------------------------------- | --------------------- |
| `DOC_EXTRACTION_CHECKLIST.md` | Systematic extraction from code   | Initial documentation |
| `DOC_API_QUICK.md`            | API documentation skeleton        | Backend APIs          |
| `DOC_COMPONENT_QUICK.md`      | Component documentation           | Frontend components   |
| `BACKEND_DOC.md`              | Backend document structure        | Backend services      |
| `FRONTEND_DOC.md`             | Frontend document structure       | Frontend architecture |
| `INFRASTRUCTURE_DOC.md`       | Infrastructure document structure | DevOps/Platform       |

### Quick Mode Benefits

- **~50% time reduction** - Pre-filled sections, standard structure
- **Consistent format** - All docs follow same patterns
- **Automated extraction** - Commands to extract from code included
- **Fill-in-the-blank** - Clear placeholders for project-specific content

### Usage

```bash
# Quick generation for all domains
valora generate-docs --quick

# Quick generation for specific domain
valora generate-docs --domain=backend --quick

# Extraction only (generates checklist)
valora generate-docs --extract-only
```

---

## Extraction Mode

When `--extract-only` flag is used, generates DOC_EXTRACTION_CHECKLIST.md with:

### Automated Extraction Commands

The checklist includes bash commands to extract:

1. **API Endpoints** - From routes/controllers
2. **Data Models** - From schemas/types/entities
3. **Services** - From service layer classes
4. **Configuration** - From env vars and config files
5. **Error Handling** - From custom error classes
6. **Middleware** - From middleware functions
7. **Tests** - Coverage and test structure
8. **Dependencies** - From package.json
9. **Infrastructure** - From Docker/K8s files
10. **Scripts** - From package.json scripts

### Extraction Workflow

```
valora generate-docs --extract-only
    |
    v
knowledge-base/DOC-EXTRACTION-[timestamp].md
    |
    v (fill in checklist)
valora generate-docs --quick
    |
    v
Full documentation generated from extraction
```

### Example Extraction Commands

```bash
# Find all route definitions
rg -n "router\.|app\.(get|post|put|patch|delete)" src/ -t ts

# Find all interfaces/types
rg -n "^export (interface|type) " src/ -t ts

# Find all service classes
rg -n "^export class.*Service" src/ -t ts

# Find environment variables
rg -n "process\.env\." src/ -t ts
```

---

## Quick Mode vs Full Mode

| Aspect        | Quick Mode            | Full Mode                |
| ------------- | --------------------- | ------------------------ |
| Duration      | ~50% of full          | Full pipeline            |
| Depth         | Template-based        | Deep analysis            |
| Output        | Standard structure    | Custom per project       |
| Use case      | Initial docs, updates | Comprehensive docs       |
| Prerequisites | Extraction checklist  | PRD, FUNCTIONAL, BACKLOG |

### When to Use Quick Mode

- **Initial documentation** for new project
- **Updating existing docs** with new endpoints
- **Component documentation** for frontend
- **API documentation** for backend services
- **Time-constrained** documentation needs

### When to Use Full Mode

- **Comprehensive documentation** for production
- **Cross-referenced documentation** suite
- **Mermaid diagrams** with C4 architecture
- **Validation and review** requirements

## Document Generation

**Files** (15 total):

**Infrastructure (6)**:

- `knowledge-base/infrastructure/HLD.md`
- `knowledge-base/infrastructure/CONTAINER.md`
- `knowledge-base/infrastructure/DEPLOYMENT.md`
- `knowledge-base/infrastructure/LOGGING.md`
- `knowledge-base/infrastructure/LZ.md`
- `knowledge-base/infrastructure/WORKFLOW.md`

**Backend (5)**:

- `knowledge-base/backend/ARCHITECTURE.md`
- `knowledge-base/backend/API.md`
- `knowledge-base/backend/DATA.md`
- `knowledge-base/backend/TESTING.md`
- `knowledge-base/backend/CODING-ASSERTIONS.md`

**Frontend (4)**:

- `knowledge-base/frontend/ARCHITECTURE.md`
- `knowledge-base/frontend/DESIGN.md`
- `knowledge-base/frontend/TESTING.md`
- `knowledge-base/frontend/CODING-ASSERTIONS.md`

**Ask user**: "Would you like me to generate all [N] documentation files?" (based on domain filter)

## Command Output Summary

Print the following summary at command completion:

**For successful generation:**

```markdown
## ✅ Technical Documentation Generated

**Completeness Score**: [XX]%
**Total Documents**: [N]
**Diagrams Generated**: [N]

### Documents Generated

**Infrastructure ([N])**
→ `knowledge-base/infrastructure/HLD.md`
→ `knowledge-base/infrastructure/CONTAINER.md`
→ `knowledge-base/infrastructure/DEPLOYMENT.md`
→ `knowledge-base/infrastructure/LOGGING.md`
→ `knowledge-base/infrastructure/LZ.md`
→ `knowledge-base/infrastructure/WORKFLOW.md`

**Backend ([N])**
→ `knowledge-base/backend/ARCHITECTURE.md`
→ `knowledge-base/backend/API.md`
→ `knowledge-base/backend/DATA.md`
→ `knowledge-base/backend/TESTING.md`
→ `knowledge-base/backend/CODING-ASSERTIONS.md`

**Frontend ([N])**
→ `knowledge-base/frontend/ARCHITECTURE.md`
→ `knowledge-base/frontend/DESIGN.md`
→ `knowledge-base/frontend/TESTING.md`
→ `knowledge-base/frontend/CODING-ASSERTIONS.md`

### Quality Summary

- ✅ All sections complete
- ✅ Cross-references verified
- ✅ Diagrams render correctly

### Next Step

→ `/fetch-task` to begin implementation
```

**For warning (85-94% completeness):**

```markdown
## ⚠️ Documentation Generated with Gaps

**Completeness Score**: [XX]%
**Status**: Proceed with noted limitations

### Quality Issues

- ⚠️ [Issue 1]
- ⚠️ [Issue 2]

### Documents Generated

→ [List of generated docs]

### Next Step

→ `/fetch-task` (proceed with gaps)
→ Address gaps manually if needed
```

**For insufficient completeness (<85%):**

```markdown
## ❌ Documentation Incomplete

**Completeness Score**: [XX]%
**Status**: Insufficient - re-run recommended

### Major Gaps

- [Gap 1]: [What's missing]
- [Gap 2]: [What's missing]

### Recommendation

Improve source documents (PRD, FUNCTIONAL, BACKLOG) for better generation.

### Next Step

→ Re-run `/generate-docs` after improving source documents
→ Or proceed to `/fetch-task` with manual documentation
```
