---
name: create-backlog
description: Decompose Product Requirements Document into prioritized, actionable task backlog
experimental: true
argument-hint: '[--prd-file=<path>] [--granularity=<fine|medium|coarse>] [--format=<github|jira|markdown>]'
allowed-tools:
  - read_file
  - write
  - list_dir
  - glob_file_search
  - codebase_search
  - grep
  - run_terminal_cmd # Required for modern CLI tools (jq, yq, rg, fd)
model: gpt-5-thinking-high
agent: product-manager
prompts:
  pipeline:
    - stage: context
      prompt: context.load-prd
      required: true
      cache:
        enabled: true
        ttl_ms: 3600000
        file_dependencies:
          - knowledge-base/PRD.md
      inputs:
        prd_file_arg: $ARG_prd_file
      outputs:
        - prd_document
        - requirements_list
      timeout_ms: 30000
    - stage: onboard
      prompt: onboard.analyze-requirements
      required: true
      inputs:
        source_document: $STAGE_context.prd_document
        source_type: prd
        granularity: $ARG_granularity
      outputs:
        - requirement_analysis
        - dependency_graph
        - complexity_map
      timeout_ms: 60000
    - stage: breakdown
      prompt: plan.decompose-tasks
      required: true
      inputs:
        analysis: $STAGE_onboard.requirement_analysis
        dependencies: $STAGE_onboard.dependency_graph
        complexity: $STAGE_onboard.complexity_map
        granularity: $ARG_granularity
      outputs:
        - task_list
        - task_dependencies
        - priority_order
      timeout_ms: 90000
    - stage: review
      prompt: review.validate-backlog
      required: true
      inputs:
        tasks: $STAGE_breakdown.task_list
        prd_requirements: $STAGE_context.requirements_list
      outputs:
        - validation_results
        - coverage_score
        - gaps_identified
      timeout_ms: 60000
    - stage: generate
      prompt: documentation.generate-backlog-artifacts
      required: true
      inputs:
        task_list: $STAGE_breakdown.task_list
        task_dependencies: $STAGE_breakdown.task_dependencies
        priority_order: $STAGE_breakdown.priority_order
        validation_results: $STAGE_review.validation_results
        prd_metadata: $STAGE_context.prd_document.metadata
        format: $ARG_format
      outputs:
        - backlog_document
        - backlog_file_path
        - backup_file_path
        - generated_artifacts
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

# Backlog Creation Command

## Role

Use the **@product-manager** agent profile

## Goal

Transform a **Product Requirements Document (PRD)** into a **prioritized, actionable task backlog** ready for execution through an automated 5-stage pipeline:

1. **Context**: Load and parse PRD document
2. **Onboard**: Analyze requirements, assess complexity, map dependencies
3. **Breakdown**: Decompose requirements into implementable tasks
4. **Review**: Validate backlog completeness and quality
5. **Generate**: Create backlog artifacts and documentation

The generated backlog includes **stage gates** — mandatory review and test checkpoints between execution phases, ensuring the team validates quality and correctness before advancing to the next phase.

## Input Arguments

**Available arguments** (accessible via `$ARGUMENTS`):

- `--prd-file=<path>`: Path to PRD file (optional, auto-detected if not provided)
- `--granularity=<fine|medium|coarse>`: Task decomposition level (default: medium)
  - **fine**: 1-2 day tasks, high detail
  - **medium**: 2-5 day tasks, balanced (default)
  - **coarse**: 5-10 day tasks, epic-level
- `--format=<github|jira|markdown>`: Output format (default: markdown)
  - **markdown**: Human-readable backlog file (always generated)
  - **github**: + GitHub issues import script
  - **jira**: + Jira-compatible CSV export

## Pipeline Execution

The command executes a **5-stage sequential pipeline**. Each stage is handled by a dedicated prompt (see `data/prompts/` directory):

| Stage            | Prompt                                     | Purpose                                                   | Key Outputs                                                                        |
| ---------------- | ------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **1. Context**   | `context.load-prd`                         | Locate and parse PRD, extract requirements                | `prd_document`, `requirements_list`                                                |
| **2. Onboard**   | `onboard.analyze-requirements`             | Analyze complexity, map dependencies, create user stories | `requirement_analysis`, `dependency_graph`, `complexity_map`                       |
| **3. Breakdown** | `plan.decompose-tasks`                     | Decompose requirements into actionable tasks              | `task_list`, `task_dependencies`, `priority_order`                                 |
| **4. Review**    | `review.validate-backlog`                  | Validate completeness, quality, coverage                  | `validation_results`, `coverage_score`, `gaps_identified`                          |
| **5. Generate**  | `documentation.generate-backlog-artifacts` | Create backlog files and artifacts                        | `backlog_document`, `backlog_file_path`, `backup_file_path`, `generated_artifacts` |

**Pipeline behavior**:

- **Sequential execution**: Each stage waits for previous stage completion
- **Stage caching**: Outputs cached for retry scenarios
- **Rollback on failure**: Failures trigger rollback to context stage
- **Retry policy**: Max 2 attempts per stage with 1s backoff

**Detailed prompt documentation**: See individual prompt files in `data/prompts/` for complete instructions.

---

## Generated Artifacts

After successful pipeline execution, the following files are created:

### 1. Primary Backlog File

**File**: `knowledge-base/BACKLOG.md`

**Contains**:

- Executive summary with coverage score and statistics
- Task distribution (by priority, domain, phase)
- Stage gates summary table (one gate per phase transition)
- Complete task list with all metadata (ID, title, description, acceptance criteria, dependencies, etc.)
- Stage gate blocks between phases (exit criteria, required tests, reviewers)
- Dependency graph (Mermaid diagram)
- Timeline projection and critical path
- Recommended starting tasks

**Format**: Detailed markdown with comprehensive task metadata. See `documentation.generate-backlog-artifacts` prompt for complete structure.

### 2. Versioned Backup

**File**: `knowledge-base/BACKLOG-[timestamp].md`

**Purpose**: Timestamped backup for version history (e.g., `BACKLOG-20251113-143022.md`)

### 3. Updated Project Files

**`TODO.md`**: Updated with first 3-5 priority tasks from Phase 0

**`CHANGELOG.md`**: Logged backlog creation with statistics

### 4. Format-Specific Outputs (Optional)

**GitHub** (`--format=github`): `scripts/import-github-issues.sh` - Executable bash script to create GitHub issues

**Jira** (`--format=jira`): `knowledge-base/BACKLOG-jira-import.csv` - CSV file for Jira import

---

## Command Output

After successful execution, display handoff summary to user:

**Format**: Comprehensive summary with statistics, task distribution, execution roadmap, validation status, and next steps.

**Content generated by**: `documentation.generate-backlog-artifacts` prompt (see prompt file for complete template)

**Key sections**:

- ✅ Backlog statistics (tasks, effort, timeline)
- 🎯 Task distribution (by priority, domain, phase)
- 🚦 Execution roadmap (phase summaries)
- ⚠️ Attention required (if issues found)
- 🎬 Recommended starting tasks
- 📁 Generated files list
- 🚀 Next steps (proceed to `/fetch-task` or address gaps)

---

## Success Indicators

**Pipeline succeeds when**:

1. ✅ All 5 stages complete successfully
2. ✅ Coverage score ≥ 85% (ideally ≥ 95%)
3. ✅ All P0 requirements have corresponding tasks
4. ✅ All tasks have complete metadata (description, acceptance criteria, effort, dependencies)
5. ✅ Dependency graph is acyclic (no circular dependencies)
6. ✅ No task exceeds 5-day effort threshold
7. ✅ Stage gates generated between each phase (exit criteria, required tests, reviewers)
8. ✅ Primary backlog file created at `knowledge-base/BACKLOG.md`
9. ✅ Supporting files updated (TODO.md, CHANGELOG.md, backup)
10. ✅ User receives clear handoff summary with next steps

---

## Integration with Workflow

**Entry Point**: After `/create-prd` (Initialization Phase)

**Prerequisites**:

- ✅ PRD document exists (knowledge-base/PRD.md)
- ✅ PRD completeness score ≥ 95%
- ✅ All P0 requirements clearly defined

**Exit Points**:

- ✅ **Success** (coverage ≥ 95%): → `/fetch-task`
- ⚠️ **Warning** (85-94% coverage): → `/fetch-task` (with noted limitations)
- 🔄 **Iteration** (coverage < 85%): → `/create-prd` (refine PRD)
- ❌ **Blocked** (critical issues): → Human review

**See**: `WORKFLOW.md` for complete development lifecycle

---

## Command Principles

**DO**:

- ✅ Execute pipeline sequentially (each stage depends on previous)
- ✅ Validate thoroughly (catch issues early)
- ✅ Maintain traceability (tasks → requirements → PRD)
- ✅ Generate comprehensive artifacts (backlog + graphs + timeline)
- ✅ Provide clear handoff (user knows next steps)
- ✅ Flag issues proactively (don't hide problems)

**DON'T**:

- ❌ Skip validation stage (always validate)
- ❌ Proceed if coverage < 70% (insufficient)
- ❌ Create circular dependencies (validate and break)
- ❌ Allow tasks > 5 days (force decomposition)
- ❌ Lose requirements (every P0/P1 → ≥1 task)
- ❌ Generate without PRD (must have valid input)

---

## Error Handling

| Error                             | Action                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **No PRD Found**                  | List files in knowledge-base/, inform user to run `/create-prd` or specify `--prd-file`, exit with error |
| **Insufficient Coverage** (< 85%) | Show coverage score and gaps, recommend refining PRD or proceeding with limitations, ask for decision    |
| **Circular Dependencies**         | Identify cycle path, suggest breaking one dependency, regenerate dependencies                            |
| **Validation Failures**           | Report issues, retry decomposition (max 2 attempts), present partial backlog with flags if still failing |
| **File Write Errors**             | Report specific error, suggest manual creation with provided content                                     |
| **Existing Backlog**              | Create backup first, ask to overwrite or create new file                                                 |

**Error recovery**: Pipeline uses retry policy (max 2 attempts per stage) and rollback on failure. Stage outputs are cached for retry scenarios.

---

## Notes

**Pipeline Configuration**:

- Sequential merge strategy with stage caching
- Rollback to context stage on failure
- Max 2 retry attempts per stage with 1s backoff

**Granularity Selection**:

- **Fine**: More tasks, lower uncertainty (complex/risky projects)
- **Medium**: Balanced (most projects) - **Default**
- **Coarse**: Fewer tasks, higher autonomy (experienced teams)

**Format Outputs**:

- **Markdown**: Always generated as primary artifact
- **GitHub/Jira**: Additional import tools generated if specified

**Token Optimization**:

- Uses **claude-haiku-4.5** for cost efficiency
- Detailed instructions delegated to prompts (not command body)
- Stage caching reduces re-computation on retries

**Existing Backlog**: If BACKLOG.md exists, creates timestamped backup before overwrite

## Document Generation

**Files**:

- `knowledge-base/BACKLOG.md` (primary)
- `knowledge-base/BACKLOG-[timestamp].md` (backup)
- `TODO.md` (updated with first tasks)
- `scripts/import-github-issues.sh` (if `--format=github`)
- `knowledge-base/BACKLOG-jira-import.csv` (if `--format=jira`)

**Ask user**: "Would you like me to create the backlog documents?"

## Command Output Summary

Print the following summary at command completion:

**For successful creation:**

```markdown
## ✅ Backlog Created

**Coverage Score**: [XX]%
**Total Tasks**: [N] tasks across [N] phases

### Task Distribution

| Priority      | Count | Effort |
| ------------- | ----- | ------ |
| P0 (Critical) | [N]   | [X] SP |
| P1 (High)     | [N]   | [X] SP |
| P2 (Medium)   | [N]   | [X] SP |

### Phases & Stage Gates

1. **Phase 0 – Foundation**: [N] tasks
   → 🔍 Gate 0→1: CI green, infra up, core models approved
2. **Phase 1 – Core Backend**: [N] tasks
   → 🔍 Gate 1→2: APIs documented, integration tests pass
3. **Phase 2 – Core Frontend**: [N] tasks
   → 🔍 Gate 2→3: UX sign-off, component tests pass
4. **Phase 3 – Integration & Features**: [N] tasks
   → 🔍 Gate 3→4: E2E suite green, feature sign-off
5. **Phase 4 – Quality & Production Readiness**: [N] tasks
   → 🔍 Gate 4→Release: Security audit, regression pass, SLOs met

### Documents Generated

→ `knowledge-base/BACKLOG.md` (primary)
→ `knowledge-base/BACKLOG-[timestamp].md` (backup)
→ `TODO.md` (updated with first tasks)

### Next Step

→ `/fetch-task` to retrieve first task for implementation
```

**For warning (coverage 85-94%):**

```markdown
## ⚠️ Backlog Created with Gaps

**Coverage Score**: [XX]%
**Status**: Proceed with noted limitations

### Coverage Gaps

- [Gap 1]: [Description]
- [Gap 2]: [Description]

### Documents Generated

→ `knowledge-base/BACKLOG.md`
→ `knowledge-base/BACKLOG-[timestamp].md` (backup)

### Next Step

→ `/fetch-task` (proceed with gaps)
→ `/create-prd` (to improve PRD coverage first)
```

**For insufficient coverage (<85%):**

```markdown
## ❌ Backlog Incomplete

**Coverage Score**: [XX]%
**Status**: Insufficient coverage

### Major Gaps

- [Gap 1]: [Missing requirements]
- [Gap 2]: [Missing requirements]

### Recommendation

PRD lacks sufficient detail for complete backlog generation.

### Next Step

→ `/create-prd` to improve PRD coverage
→ `/refine-specs` if requirements are unclear
```
