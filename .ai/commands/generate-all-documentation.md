---
name: generate-all-documentation
description: Orchestrate parallel documentation generation across all domains, saving 5-7 minutes per workflow through aggressive parallelisation
experimental: true
argument-hint: '[--output-dir=<path>] [--skip-review] [--security-context=<path>] [--cache-context]'
allowed-tools:
  - read_file
  - write
  - list_dir
  - glob_file_search
  - codebase_search
  - grep
  - run_terminal_cmd
model: claude-sonnet-4.5
agent: lead
prompts:
  pipeline:
    - stage: contextAndAnalyze
      prompt: context.load-and-analyze-parallel
      required: true
      cache:
        enabled: true
        ttl_ms: 7200000
        file_dependencies:
          - knowledge-base/PRD.md
          - knowledge-base/FUNCTIONAL.md
          - knowledge-base/BACKLOG.md
      inputs:
        output_dir_arg: $ARG_output_dir
        cache_context: $ARG_cache_context
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
      timeout_ms: 90000
    - stage: generateAll
      prompt: documentation.generate-all-domains-parallel
      required: true
      parallel: true
      inputs:
        documentation_plan: $STAGE_contextAndAnalyze.documentation_plan
        diagram_requirements: $STAGE_contextAndAnalyze.diagram_requirements
        cross_refs: $STAGE_contextAndAnalyze.cross_references
        prd: $STAGE_contextAndAnalyze.prd_document
        codebase: $STAGE_contextAndAnalyze.codebase_context
        security_context: $STAGE_contextAndAnalyze.security_context
        domain_assignments: $STAGE_contextAndAnalyze.domain_assignments
      outputs:
        - infrastructure_docs
        - backend_docs
        - frontend_docs
        - generation_metrics
      timeout_ms: 240000
    - stage: reviewAndPersist
      prompt: documentation.review-and-persist-parallel
      required: true
      conditional: $ARG_skip_review != true
      inputs:
        infrastructure_docs: $STAGE_generateAll.infrastructure_docs
        backend_docs: $STAGE_generateAll.backend_docs
        frontend_docs: $STAGE_generateAll.frontend_docs
        documentation_plan: $STAGE_contextAndAnalyze.documentation_plan
        cross_references: $STAGE_contextAndAnalyze.cross_references
        domain_assignments: $STAGE_contextAndAnalyze.domain_assignments
        output_dir: $ARG_output_dir
        project_metadata: $STAGE_contextAndAnalyze.project_metadata
        generation_metrics: $STAGE_generateAll.generation_metrics
      outputs:
        - validation_results
        - completeness_score
        - written_files
        - handoff_summary
        - time_saved
      timeout_ms: 150000
  merge_strategy: sequential
  rollback_on_failure: contextAndAnalyze
  cache_strategy: aggressive
  retry_policy:
    max_attempts: 2
    backoff_ms: 500
    retry_on:
      - validation_failed
      - timeout
---

# Generate All Documentation (Parallel Orchestration)

## Role

Use the **@lead** agent profile for orchestration, spawning parallel subprocesses for each domain:
- **@platform-engineer** subprocess for infrastructure documentation
- **@software-engineer-typescript-backend** subprocess for backend documentation
- **@software-engineer-typescript-frontend** subprocess for frontend documentation

## Goal

Generate **comprehensive technical documentation** (15 files) across all domains through an **optimised 3-stage parallel pipeline** that saves **5-7 minutes per workflow** compared to sequential execution.

### Time Savings Breakdown

| Stage              | Sequential         | Parallel          | Saved             |
| ------------------ | ------------------ | ----------------- | ----------------- |
| Context + Analyze  | 105s (45+60)       | 90s (merged)      | 15s               |
| Generate 3 Domains | 540s (180×3)       | 240s (parallel)   | 300s              |
| Review + Persist   | 210s (90+120)      | 150s (merged)     | 60s               |
| **Total**          | **855s (~14 min)** | **480s (~8 min)** | **375s (~6 min)** |

## Input Arguments

**Available arguments** (accessible via `$ARGUMENTS`):

- `--output-dir=<path>`: Output directory (default: `knowledge-base/`)
- `--skip-review`: Skip validation stage for fastest generation
- `--security-context=<path>`: Path to security requirements file for compliance documentation
- `--cache-context`: Use cached context from previous run (saves ~30s if available)

## Optimisation Strategies

### 1. Merged Context + Analyze Stage

Instead of separate context loading and analysis stages, merge into a single stage:

```plaintext
BEFORE: context (45s) → analyze (60s) = 105s
AFTER:  contextAndAnalyze (90s) = 90s
SAVED: 15s
```

### 2. True Parallel Domain Generation

All three domains generate simultaneously using subprocess isolation:

```plaintext
BEFORE: infra (180s) → backend (180s) → frontend (180s) = 540s
AFTER:  infra + backend + frontend (parallel) = 240s
SAVED: 300s (5 minutes)
```

### 3. Merged Review + Persist Stage

Combine validation and file writing into streaming operation:

```plaintext
BEFORE: review (90s) → persist (120s) = 210s
AFTER:  reviewAndPersist (150s) = 150s
SAVED: 60s
```

### 4. Aggressive Caching

- Context cached for 2 hours (vs 1 hour in standard)
- Cache includes analysis results, not just raw documents
- Subsequent runs skip context entirely if cache valid

```plaintext
CACHED RUN: 240s + 150s = 390s (~6.5 min)
SAVED vs FIRST RUN: 90s additional
```

---

## Pipeline Execution

### Stage 1: Context and Analyze (Merged)

**Duration**: ~90s (parallelised internally)

**Actions**:
1. Load PRD, FUNCTIONAL, BACKLOG documents in parallel
2. Scan codebase structure concurrently
3. Begin analysis while loading completes
4. Cache all outputs for reuse

**Outputs**:
- `prd_document`, `functional_document`, `backlog_document`
- `codebase_context`, `project_metadata`
- `documentation_plan`, `diagram_requirements`
- `cross_references`, `domain_assignments`
- `security_context` (from input or inferred)

### Stage 2: Generate All Domains (Parallel Subprocesses)

**Duration**: ~240s (limited by slowest domain)

**Actions**:
1. Spawn 3 parallel subprocesses
2. Each subprocess uses domain-specific agent
3. Write files directly to disk (no JSON serialisation)
4. Collect generation metrics

**Subprocess Allocation**:

| Subprocess   | Agent                                 | Documents | Est. Time |
| ------------ | ------------------------------------- | --------- | --------- |
| infra-gen    | platform-engineer                     | 6 files   | ~180s     |
| backend-gen  | software-engineer-typescript-backend  | 5 files   | ~200s     |
| frontend-gen | software-engineer-typescript-frontend | 4 files   | ~160s     |

**Outputs**:
- `infrastructure_docs`: Metadata for 6 files
- `backend_docs`: Metadata for 5 files
- `frontend_docs`: Metadata for 4 files
- `generation_metrics`: Timing and completeness data

### Stage 3: Review and Persist (Merged)

**Duration**: ~150s

**Actions**:
1. Validate completeness (>= 85% threshold)
2. Verify cross-references
3. Check Mermaid diagram syntax
4. Create timestamped backups
5. Generate handoff summary

**Outputs**:
- `validation_results`, `completeness_score`
- `written_files`, `handoff_summary`
- `time_saved`: Actual time saved vs sequential

---

## Parallel Subprocess Implementation

### Subprocess Isolation

Each domain runs in an isolated subprocess to enable true parallelism:

```bash
# Conceptual execution (handled by orchestrator)
(
  ai-subprocess --agent=platform-engineer \
    --prompt=documentation.generate-infrastructure-docs \
    --inputs="$STAGE1_OUTPUTS" \
    --output-dir=knowledge-base/infrastructure/
) &

(
  ai-subprocess --agent=software-engineer-typescript-backend \
    --prompt=documentation.generate-backend-docs \
    --inputs="$STAGE1_OUTPUTS" \
    --output-dir=knowledge-base/backend/
) &

(
  ai-subprocess --agent=software-engineer-typescript-frontend \
    --prompt=documentation.generate-frontend-docs \
    --inputs="$STAGE1_OUTPUTS" \
    --output-dir=knowledge-base/frontend/
) &

wait  # All complete in ~240s instead of ~540s
```

### Subprocess Communication

- **Input**: Serialised stage 1 outputs passed via temp file
- **Output**: Each subprocess writes directly to target directory
- **Metrics**: Written to shared metrics file for aggregation
- **Errors**: Captured and reported in final summary

---

## Security Context Integration

When `--security-context` is provided, security requirements are injected into all domain generation:

```bash
valora generate-all-documentation --security-context=security-requirements.json
```

**Security context includes**:
- Compliance frameworks (SOC 2, ISO 27001, etc.)
- Threat model references
- Security policies
- Encryption standards

**Impact on generation**:
- HLD.md includes full security architecture section
- DEPLOYMENT.md includes security gates
- LOGGING.md includes audit trail requirements
- LZ.md includes compliance implementation details

---

## Target Documentation (15 files)

| Domain                 | Files                                                               | Subprocess   |
| ---------------------- | ------------------------------------------------------------------- | ------------ |
| **Infrastructure** (6) | HLD.md, CONTAINER.md, DEPLOYMENT.md, LOGGING.md, LZ.md, WORKFLOW.md | infra-gen    |
| **Backend** (5)        | ARCHITECTURE.md, API.md, DATA.md, TESTING.md, CODING-ASSERTIONS.md  | backend-gen  |
| **Frontend** (4)       | ARCHITECTURE.md, DESIGN.md, TESTING.md, CODING-ASSERTIONS.md        | frontend-gen |

---

## Command Output

### Successful Generation

```markdown
## ✅ Parallel Documentation Generation Complete

**Mode**: Full Parallel (3 subprocesses)
**Duration**: 7.8 min
**Time Saved**: 6.2 min vs sequential

---

### Generation Summary

| Domain         | Files  | Duration | Completeness |
| -------------- | ------ | -------- | ------------ |
| Infrastructure | 6      | 178s     | 94%          |
| Backend        | 5      | 203s     | 92%          |
| Frontend       | 4      | 156s     | 96%          |
| **Total**      | **15** | **203s** | **94%**      |

### Pipeline Metrics

| Stage                   | Duration | Saved    |
| ----------------------- | -------- | -------- |
| Context + Analyze       | 87s      | 18s      |
| Generate All (parallel) | 203s     | 337s     |
| Review + Persist        | 142s     | 68s      |
| **Total**               | **432s** | **423s** |

---

### Files Generated

**Infrastructure** (knowledge-base/infrastructure/)
→ HLD.md, CONTAINER.md, DEPLOYMENT.md, LOGGING.md, LZ.md, WORKFLOW.md

**Backend** (knowledge-base/backend/)
→ ARCHITECTURE.md, API.md, DATA.md, TESTING.md, CODING-ASSERTIONS.md

**Frontend** (knowledge-base/frontend/)
→ ARCHITECTURE.md, DESIGN.md, TESTING.md, CODING-ASSERTIONS.md

---

### Quality Summary

- ✅ Completeness: 94% (threshold: 85%)
- ✅ Cross-references: 47/47 verified
- ✅ Diagrams: 12 Mermaid diagrams valid
- ✅ Security sections: Included in all domains

### Next Step
→ `/fetch-task` to begin implementation
```

### With Skip Review

```markdown
## ⚡ Fast Documentation Generation Complete

**Mode**: Skip Review (fastest)
**Duration**: 5.5 min
**Time Saved**: 8.5 min vs sequential with review

---

### Files Generated

- Infrastructure: 6 files
- Backend: 5 files
- Frontend: 4 files

**Note**: Review skipped. Run `/validate-parallel` before proceeding.

### Next Step
→ `/validate-parallel` to validate
→ `/fetch-task` to begin implementation (if confident)
```

---

## Usage Examples

### Standard Parallel Generation

```bash
valora generate-all-documentation
```

Generates all 15 documents in ~8 minutes.

### With Cached Context

```bash
valora generate-all-documentation --cache-context
```

Uses cached context if available (~6.5 minutes).

### Fast Generation (Skip Review)

```bash
valora generate-all-documentation --skip-review
```

Fastest generation (~5.5 minutes), no validation.

### With Security Context

```bash
valora generate-all-documentation --security-context=.ai/security-requirements.json
```

Includes comprehensive security documentation.

### Custom Output Directory

```bash
valora generate-all-documentation --output-dir=docs/technical/
```

Writes to custom directory.

---

## Comparison: generate-docs vs generate-all-documentation

| Aspect               | generate-docs      | generate-all-documentation |
| -------------------- | ------------------ | -------------------------- |
| **Pipeline stages**  | 7                  | 3                          |
| **Parallelisation**  | Partial (3 stages) | Full (subprocesses)        |
| **Est. duration**    | ~14 min            | ~8 min                     |
| **Time saved**       | Baseline           | 5-7 min                    |
| **Caching**          | 1 hour TTL         | 2 hour TTL + aggressive    |
| **Model**            | claude-haiku-4.5   | claude-sonnet-4.5          |
| **Skip review**      | No                 | Yes (--skip-review)        |
| **Security context** | No                 | Yes (--security-context)   |

### When to Use Each

**Use `generate-docs`**:
- Single domain generation needed
- Quick mode templates
- Extraction-only mode
- Lower cost priority

**Use `generate-all-documentation`**:
- Full documentation suite needed
- Time is critical
- Subsequent runs (cached context)
- Security documentation required

---

## Success Indicators

**Pipeline succeeds when**:

1. ✅ All 3 subprocesses complete without error
2. ✅ 15 files written to target directories
3. ✅ Completeness score >= 85% (if review not skipped)
4. ✅ Total duration < 10 minutes
5. ✅ Time saved >= 5 minutes vs sequential baseline

---

## Error Handling

| Error                  | Action                                                           |
| ---------------------- | ---------------------------------------------------------------- |
| **Subprocess timeout** | Kill subprocess, report partial results, continue others         |
| **Subprocess failure** | Capture error, mark domain as failed, continue others            |
| **Cache miss**         | Fall back to full context loading                                |
| **Low completeness**   | Warn but complete, suggest `/generate-docs --domain=X` for retry |
| **File write error**   | Report error, provide content for manual creation                |

**Recovery strategies**:
- Partial completion: Other domains still generate if one fails
- Retry policy: 2 attempts with 500ms backoff
- Rollback: On critical failure, rollback to contextAndAnalyze stage

---

## Integration with Workflow

**Entry Point**: After `/create-backlog` (Initialisation Phase)

```
/refine-specs → /create-prd → /create-backlog → /generate-all-documentation → /fetch-task
                                                          ↑
                                                (Optimised: 5-7 min faster)
```

**Prerequisites**:
- ✅ PRD document exists (knowledge-base/PRD.md)
- ✅ FUNCTIONAL document exists (knowledge-base/FUNCTIONAL.md)
- ✅ BACKLOG document exists (knowledge-base/BACKLOG.md)

**Exit Points**:
- ✅ **Success** (completeness >= 85%): → `/fetch-task`
- ⚡ **Fast** (review skipped): → `/validate-parallel` → `/fetch-task`
- ❌ **Partial failure**: → `/generate-docs --domain=X` for failed domain

---

## Notes

**Subprocess architecture**:
- Each domain runs in isolated environment
- No shared state between subprocesses
- Outputs written directly to disk
- Metrics aggregated post-completion

**Caching strategy**:
- 2-hour TTL for context + analysis
- Cache invalidated on source document changes
- `--cache-context` flag forces cache usage

**Model selection**:
- Uses claude-sonnet-4.5 for orchestration (faster reasoning)
- Subprocesses inherit model or use domain-optimal

**Resource usage**:
- 3 concurrent API calls during generate stage
- Higher peak token usage, lower total duration
- Suitable for environments with parallel API access
