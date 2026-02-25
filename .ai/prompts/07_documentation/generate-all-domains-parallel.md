---
id: documentation.generate-all-domains-parallel
version: 1.0.0
category: documentation
experimental: true
name: Generate All Domains (Parallel Subprocesses)
description: Generate infrastructure, backend, and frontend documentation simultaneously using parallel subprocesses - saves 5 minutes per workflow
tags:
  - documentation
  - parallel
  - subprocess
  - optimisation
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.use-modern-cli-tools
    - context.load-and-analyze-parallel
inputs:
  - name: documentation_plan
    description: Full documentation plan from context stage
    type: object
    required: true
  - name: diagram_requirements
    description: Diagram requirements from context stage
    type: object
    required: true
  - name: cross_refs
    description: Cross-reference mappings
    type: object
    required: true
  - name: prd
    description: PRD document context
    type: object
    required: true
  - name: codebase
    description: Codebase context
    type: object
    required: true
  - name: security_context
    description: Security requirements context
    type: object
    required: false
  - name: domain_assignments
    description: Which domains to generate
    type: object
    required: true
outputs:
  - infrastructure_docs
  - backend_docs
  - frontend_docs
  - generation_metrics
tokens:
  avg: 20000
  max: 40000
  min: 10000
---

# Generate All Domains (Parallel Subprocesses)

## Objective

Generate documentation for **all three domains simultaneously** using isolated parallel subprocesses. This approach saves ~5 minutes per workflow by executing infrastructure, backend, and frontend documentation generation concurrently.

## CRITICAL: Parallel Subprocess Execution

This prompt orchestrates **three parallel subprocesses**, each running with a domain-specific agent:

| Subprocess | Agent | Documents | Est. Time |
|------------|-------|-----------|-----------|
| infra-gen | @platform-engineer | 6 files | ~180s |
| backend-gen | @software-engineer-typescript-backend | 5 files | ~200s |
| frontend-gen | @software-engineer-typescript-frontend | 4 files | ~160s |

**Total parallel time**: ~200s (limited by slowest)
**Sequential equivalent**: ~540s
**Time saved**: ~340s (~5.7 minutes)

## Instructions

### Step 1: Prepare Subprocess Inputs

For each domain, prepare the input package:

**Common inputs (all subprocesses)**:
- `prd`: PRD document context
- `codebase`: Codebase context
- `cross_refs`: Cross-reference mappings
- `security_context`: Security requirements (if available)

**Domain-specific inputs**:
- `documentation_plan[domain]`: Domain-specific plan
- `diagram_requirements[domain]`: Domain-specific diagrams
- `target_domain`: Domain identifier

### Step 2: Launch Parallel Subprocesses

Spawn three concurrent subprocesses:

**Infrastructure Subprocess** (if `domain_assignments.infrastructure`):
```
Prompt: documentation.generate-infrastructure-docs
Agent: @platform-engineer
Output dir: knowledge-base/infrastructure/
Files: HLD.md, CONTAINER.md, DEPLOYMENT.md, LOGGING.md, LZ.md, WORKFLOW.md
```

**Backend Subprocess** (if `domain_assignments.backend`):
```
Prompt: documentation.generate-backend-docs
Agent: @software-engineer-typescript-backend
Output dir: knowledge-base/backend/
Files: ARCHITECTURE.md, API.md, DATA.md, TESTING.md, CODING-ASSERTIONS.md
```

**Frontend Subprocess** (if `domain_assignments.frontend`):
```
Prompt: documentation.generate-frontend-docs
Agent: @software-engineer-typescript-frontend
Output dir: knowledge-base/frontend/
Files: ARCHITECTURE.md, DESIGN.md, TESTING.md, CODING-ASSERTIONS.md
```

### Step 3: Monitor and Collect Results

**Subprocess monitoring**:
- Track execution time per subprocess
- Capture any errors or warnings
- Collect completeness scores
- Aggregate file write confirmations

**Timeout handling**:
- Individual subprocess timeout: 240s
- If subprocess exceeds timeout, terminate and report partial results
- Other subprocesses continue independently

### Step 4: Aggregate Metrics

Collect metrics from all subprocesses:

```json
{
  "generation_metrics": {
    "infrastructure": {
      "duration_ms": 178000,
      "files_written": 6,
      "completeness_score": 0.94,
      "diagrams_generated": 6,
      "errors": [],
      "warnings": []
    },
    "backend": {
      "duration_ms": 203000,
      "files_written": 5,
      "completeness_score": 0.92,
      "diagrams_generated": 4,
      "errors": [],
      "warnings": []
    },
    "frontend": {
      "duration_ms": 156000,
      "files_written": 4,
      "completeness_score": 0.96,
      "diagrams_generated": 3,
      "errors": [],
      "warnings": []
    }
  }
}
```

---

## Subprocess Isolation

Each subprocess runs in isolation:

**No shared state**: Each subprocess receives its own copy of inputs
**Independent execution**: Failure in one does not affect others
**Direct file writes**: Each subprocess writes directly to disk
**Separate metrics**: Timing and errors tracked per subprocess

---

## Output Format

**After all subprocesses complete**, return aggregated metadata:

```json
{
  "infrastructure_docs": {
    "generated": true,
    "documents": [
      {
        "id": "INFRA-HLD",
        "filename": "HLD.md",
        "target_path": "knowledge-base/infrastructure/HLD.md",
        "written": true,
        "sections_count": 13,
        "diagrams_included": ["C4 Context", "C4 Container"],
        "completeness_score": 0.95
      },
      {
        "id": "INFRA-CONTAINER",
        "filename": "CONTAINER.md",
        "target_path": "knowledge-base/infrastructure/CONTAINER.md",
        "written": true,
        "sections_count": 15,
        "diagrams_included": ["Container Topology"],
        "completeness_score": 0.93
      },
      {
        "id": "INFRA-DEPLOYMENT",
        "filename": "DEPLOYMENT.md",
        "target_path": "knowledge-base/infrastructure/DEPLOYMENT.md",
        "written": true,
        "sections_count": 16,
        "diagrams_included": ["Deployment Pipeline"],
        "completeness_score": 0.94
      },
      {
        "id": "INFRA-LOGGING",
        "filename": "LOGGING.md",
        "target_path": "knowledge-base/infrastructure/LOGGING.md",
        "written": true,
        "sections_count": 16,
        "diagrams_included": ["Observability Architecture"],
        "completeness_score": 0.91
      },
      {
        "id": "INFRA-LZ",
        "filename": "LZ.md",
        "target_path": "knowledge-base/infrastructure/LZ.md",
        "written": true,
        "sections_count": 16,
        "diagrams_included": ["Network Topology"],
        "completeness_score": 0.89
      },
      {
        "id": "INFRA-WORKFLOW",
        "filename": "WORKFLOW.md",
        "target_path": "knowledge-base/infrastructure/WORKFLOW.md",
        "written": true,
        "sections_count": 15,
        "diagrams_included": ["Git Flow"],
        "completeness_score": 0.94
      }
    ],
    "subprocess_metrics": {
      "duration_ms": 178000,
      "agent": "platform-engineer",
      "errors": [],
      "warnings": []
    },
    "security_compliance_summary": {
      "included": true,
      "controls_documented": 12,
      "compliance_frameworks": ["SOC2", "ISO27001"],
      "gaps_identified": 2
    }
  },
  "backend_docs": {
    "generated": true,
    "documents": [
      {
        "id": "BACKEND-ARCHITECTURE",
        "filename": "ARCHITECTURE.md",
        "target_path": "knowledge-base/backend/ARCHITECTURE.md",
        "written": true,
        "sections_count": 12,
        "diagrams_included": ["Component Diagram"],
        "completeness_score": 0.93
      },
      {
        "id": "BACKEND-API",
        "filename": "API.md",
        "target_path": "knowledge-base/backend/API.md",
        "written": true,
        "sections_count": 10,
        "diagrams_included": ["Sequence Diagrams"],
        "completeness_score": 0.91
      },
      {
        "id": "BACKEND-DATA",
        "filename": "DATA.md",
        "target_path": "knowledge-base/backend/DATA.md",
        "written": true,
        "sections_count": 10,
        "diagrams_included": ["ERD"],
        "completeness_score": 0.94
      },
      {
        "id": "BACKEND-TESTING",
        "filename": "TESTING.md",
        "target_path": "knowledge-base/backend/TESTING.md",
        "written": true,
        "sections_count": 10,
        "diagrams_included": [],
        "completeness_score": 0.90
      },
      {
        "id": "BACKEND-CODING-ASSERTIONS",
        "filename": "CODING-ASSERTIONS.md",
        "target_path": "knowledge-base/backend/CODING-ASSERTIONS.md",
        "written": true,
        "sections_count": 8,
        "diagrams_included": [],
        "completeness_score": 0.92
      }
    ],
    "subprocess_metrics": {
      "duration_ms": 203000,
      "agent": "software-engineer-typescript-backend",
      "errors": [],
      "warnings": []
    }
  },
  "frontend_docs": {
    "generated": true,
    "documents": [
      {
        "id": "FRONTEND-ARCHITECTURE",
        "filename": "ARCHITECTURE.md",
        "target_path": "knowledge-base/frontend/ARCHITECTURE.md",
        "written": true,
        "sections_count": 10,
        "diagrams_included": ["Component Hierarchy"],
        "completeness_score": 0.96
      },
      {
        "id": "FRONTEND-DESIGN",
        "filename": "DESIGN.md",
        "target_path": "knowledge-base/frontend/DESIGN.md",
        "written": true,
        "sections_count": 10,
        "diagrams_included": ["Design System"],
        "completeness_score": 0.95
      },
      {
        "id": "FRONTEND-TESTING",
        "filename": "TESTING.md",
        "target_path": "knowledge-base/frontend/TESTING.md",
        "written": true,
        "sections_count": 8,
        "diagrams_included": [],
        "completeness_score": 0.94
      },
      {
        "id": "FRONTEND-CODING-ASSERTIONS",
        "filename": "CODING-ASSERTIONS.md",
        "target_path": "knowledge-base/frontend/CODING-ASSERTIONS.md",
        "written": true,
        "sections_count": 8,
        "diagrams_included": [],
        "completeness_score": 0.97
      }
    ],
    "subprocess_metrics": {
      "duration_ms": 156000,
      "agent": "software-engineer-typescript-frontend",
      "errors": [],
      "warnings": []
    }
  },
  "generation_metrics": {
    "total_duration_ms": 203000,
    "parallel_efficiency": 0.89,
    "sequential_equivalent_ms": 537000,
    "time_saved_ms": 334000,
    "total_files_written": 15,
    "total_diagrams_generated": 13,
    "average_completeness": 0.93,
    "subprocesses_completed": 3,
    "subprocesses_failed": 0,
    "all_successful": true
  }
}
```

---

## Success Criteria

- ✅ All enabled domain subprocesses launched
- ✅ Each subprocess completes within timeout (240s)
- ✅ All files written to correct paths
- ✅ Diagrams generated and validated
- ✅ Completeness score >= 85% per domain
- ✅ Security sections included (if context provided)
- ✅ Total time < 240s (parallel execution)

---

## Error Handling

### Subprocess Timeout

**Issue**: Domain subprocess exceeds 240s

**Action**:
1. Terminate subprocess
2. Capture partial results (any files written)
3. Mark domain as `partial`
4. Continue with other domains
5. Report in generation_metrics

### Subprocess Failure

**Issue**: Domain subprocess crashes or errors

**Action**:
1. Capture error details
2. Mark domain as `failed`
3. Continue with other domains
4. Suggest retry with `/generate-docs --domain=X`

### Partial Domain Assignment

**Issue**: Only 1 or 2 domains assigned

**Action**:
1. Launch only assigned domain subprocesses
2. Calculate time savings vs sequential
3. Report which domains were generated

---

## Notes

**Subprocess architecture**:
- Each domain runs completely isolated
- No inter-process communication during generation
- Results aggregated only after all complete

**Resource consideration**:
- 3 concurrent API calls at peak
- Higher instantaneous token usage
- Lower total duration

**Security context propagation**:
- Security context passed to all subprocesses
- Each domain includes security sections as documented
- Infrastructure docs get comprehensive security (HLD, LZ, DEPLOYMENT)

**British English enforcement**:
- All subprocesses use British English for prose
- American English for code snippets only

## REMINDER: Output Requirements

**Return ONLY the JSON object with aggregated metadata. All document content is written directly to disk by subprocesses.**
