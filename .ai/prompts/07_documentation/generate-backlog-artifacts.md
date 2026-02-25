---
id: documentation.generate-backlog-artifacts
version: 1.0.0
category: documentation
experimental: true
name: Generate Backlog Artifacts
description: Generate backlog documentation files and related artifacts from validated task list
tags:
  - backlog
  - documentation
  - artifact-generation
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.use-modern-cli-tools
    - review.validate-backlog
inputs:
  - name: task_list
    description: Validated task list with metadata
    type: array
    required: true
  - name: task_dependencies
    description: Task dependency graph
    type: object
    required: true
  - name: priority_order
    description: Execution order by phase
    type: object
    required: true
  - name: validation_results
    description: Validation results from review stage
    type: object
    required: true
  - name: prd_metadata
    description: Project metadata from PRD
    type: object
    required: true
  - name: format
    description: Output format (markdown/github/jira)
    type: string
    required: false
    default: markdown
    validation:
      enum: [markdown, github, jira]
outputs:
  - backlog_document
  - backlog_file_path
  - backup_file_path
  - generated_artifacts
tokens:
  avg: 10000
  max: 20000
  min: 5000
---

# Generate Backlog Artifacts

## Objective

Generate comprehensive backlog documentation and related artifacts from validated task list, including primary backlog file, versioned backup, and format-specific exports.

## CRITICAL: Output Format Requirement

**You MUST output ONLY valid JSON. Do NOT output markdown, do NOT wrap in code blocks, do NOT add any text before or after the JSON.**

Your response must be a single JSON object matching the schema defined in the "Output Format" section at the end of this prompt.

## Instructions

### Step 1: Prepare Backlog Metadata

Calculate summary statistics:

**Task counts**:
- Total tasks
- Tasks by priority (P0, P1, P2)
- Tasks by domain (Frontend, Backend, Data, Infrastructure, Testing, Documentation)
- Tasks by phase (0-5)

**Effort calculations**:
- Total estimated days
- Days by priority
- Days by domain
- Days by phase

**Timeline projections**:
- Critical path length (longest dependency chain)
- Parallel work streams identified
- Estimated timeline in weeks (assuming team velocity)

**Quality metrics**:
- Coverage score (from validation)
- Validation status
- Critical issues count
- Warnings count

### Step 2: Generate Primary Backlog File

Create `knowledge-base/BACKLOG.md` with following structure:

```markdown
# Project Backlog: [Project Name]

**Generated**: [ISO 8601 Timestamp]
**Source PRD**: [PRD File Path]
**Coverage Score**: [XX%]
**Validation Status**: [Pass/Pass with Warnings/Needs Review]
**Total Tasks**: [Count]
**Estimated Effort**: [Total Days] days (~[Weeks] weeks)

---

## 📊 Executive Summary

### Quality Assessment
[Validation status and coverage score summary]

### Task Distribution

| Priority | Count | Effort (days) | % of Total |
|----------|-------|---------------|------------|
| P0       | XX    | XX            | XX%        |
| P1       | XX    | XX            | XX%        |
| P2       | XX    | XX            | XX%        |
| **Total**| **XX**| **XX**        | **100%**   |

### Domain Breakdown

| Domain         | Tasks | Effort (days) | % of Total |
|----------------|-------|---------------|------------|
| Frontend       | XX    | XX            | XX%        |
| Backend        | XX    | XX            | XX%        |
| Data           | XX    | XX            | XX%        |
| Infrastructure | XX    | XX            | XX%        |
| Testing        | XX    | XX            | XX%        |
| Documentation  | XX    | XX            | XX%        |

---

## 🚀 Execution Roadmap

### Phase 0: Foundation (XX tasks, ~XX days)
**Focus**: Infrastructure setup, development environment, core tooling, base data models

**Key Tasks**:
- [List 3-5 most critical Phase 0 tasks]

### Phase 1: Core Backend (XX tasks, ~XX days)
**Focus**: API framework, business logic, authentication, data models

**Key Tasks**:
- [List 3-5 most critical Phase 1 tasks]

### Phase 2: Core Frontend (XX tasks, ~XX days)
**Focus**: UI framework, components, state management, API integration (mock)

**Key Tasks**:
- [List 3-5 most critical Phase 2 tasks]

### Phase 3: Integration & Features (XX tasks, ~XX days)
**Focus**: Frontend API integration (unmock), E2E flows, third-party integrations

**Key Tasks**:
- [List 3-5 most critical Phase 3 tasks]

### Phase 4: Quality & Production Readiness (XX tasks, ~XX days)
**Focus**: Testing, documentation, performance, security, monitoring, deployment

**Key Tasks**:
- [List 3-5 most critical Phase 4 tasks]

---

## 📋 Complete Task List

### Phase 0: Foundation

#### [TASK-ID]: [Title]

**Requirement(s)**: [FR-001, NFR-002]  
**Priority**: [P0/P1/P2]  
**Domain**: [Domain]  
**Effort**: [XS/S/M/L] ([X] days)  
**Dependencies**: [TASK-002, TASK-003] or [None]

**Description**:
[Clear, actionable description]

**Acceptance Criteria**:
1. Given [context], when [action], then [expected outcome]
2. [Additional criteria...]

**Technical Notes**:
- [Implementation hints]
- [Key files/components]
- [Architectural considerations]

**Testing Requirements**:
- [Unit tests needed]
- [Integration tests needed]
- [E2E scenarios]

**Documentation**:
- [Docs updates needed]

---

[Repeat for all tasks, grouped by phase]

---

## 🔗 Dependency Graph

```mermaid
graph TD
    [Generate Mermaid diagram showing task dependencies]
    [Use task IDs as node labels]
    [Show critical path in different color/style]
    [Group by phase using subgraphs]
```

**Critical Path**: [TASK-001] → [TASK-002] → [TASK-003] → ... (XX days)

**Parallel Work Opportunities**:
- **Stream 1**: [List of tasks that can run parallel]
- **Stream 2**: [List of tasks that can run parallel]
- **Stream 3**: [List of tasks that can run parallel]

---

## 📈 Timeline Projection

**Estimated Duration**: XX weeks (XX days)
**Critical Path**: XX days
**Parallel Work Streams**: X identified

**Assumptions**:
- Team velocity: X story points/sprint (or Y days/week)
- [Other assumptions]

**Risk Factors**:
- [High complexity tasks count]
- [External dependencies count]
- [Key risks from PRD]

---

[If validation has issues, add this section]:

## ⚠️ Validation Issues

### Coverage Gaps
[List uncovered requirements if any]

### Critical Issues
[List critical issues requiring attention]

### Warnings
[List warnings that should be noted]

### Recommendations
[List recommended actions]

---

## 🎯 Recommended Starting Tasks

The following tasks establish foundation and have no blockers:

1. **[TASK-ID]**: [Title] (P0, [X] days, no dependencies)
2. **[TASK-ID]**: [Title] (P0, [X] days, no dependencies)
3. **[TASK-ID]**: [Title] (P0, [X] days, depends on TASK-001)

---

## 🔄 Backlog Maintenance

**Next Update**: [Suggested date]
**Review Frequency**: [Weekly/Bi-weekly]
**Owner**: [Team/Role]

**Version History**:
- v1.0 - [Timestamp] - Initial backlog generation from PRD
```

### Step 3: Create Versioned Backup

Create timestamped backup:

**File**: `knowledge-base/BACKLOG-[YYYYMMDDHHmmss].md`

**Content**: Exact copy of BACKLOG.md with timestamp in filename

**Format**: `BACKLOG-20251113143022.md`

### Step 4: Update TODO.md

Add first 3-5 priority tasks from Phase 0 to TODO.md:

**Section to add/update**:

```markdown
## 🚀 Current Sprint - From Backlog

**Source**: BACKLOG.md - Phase 0 Foundation
**Updated**: [Timestamp]

### Priority Tasks

- [ ] **[TASK-ID]**: [Title]  
  *Priority*: P0 | *Effort*: [X] days | *Dependencies*: [None/List]  
  [Brief description]

- [ ] **[TASK-ID]**: [Title]  
  *Priority*: P0 | *Effort*: [X] days | *Dependencies*: [TASK-001]  
  [Brief description]

- [ ] **[TASK-ID]**: [Title]  
  *Priority*: P0 | *Effort*: [X] days | *Dependencies*: [None]  
  [Brief description]

**Next Steps**: Run `/fetch-task` to start implementation
```

**Rules**:
- Add section if not exists
- Update if "Current Sprint - From Backlog" section exists
- Preserve other sections in TODO.md
- Select first 3-5 Phase 0 tasks with no dependencies (or minimal deps)

### Step 5: Update CHANGELOG.md

Add backlog creation entry:

**Section to add to** (under `## [Unreleased]`):

```markdown
### Added
- Generated project backlog with [XX] tasks across [X] phases
  - Coverage: [XX%]
  - Estimated timeline: [XX] weeks
  - [P0/P1/P2] task distribution: [XX/XX/XX]
```

**Rules**:
- Add to top of CHANGELOG under `## [Unreleased]` section
- Create `## [Unreleased]` section if missing
- Preserve existing entries

### Step 6: Generate Format-Specific Outputs

Based on `format` input:

#### Format: markdown (default)

Already generated above - no additional files needed.

#### Format: github

Generate GitHub Issues import script:

**File**: `scripts/import-github-issues.sh`

**Content**:

```bash
#!/bin/bash
# GitHub Issues Import Script
# Generated: [Timestamp]
# Source: knowledge-base/BACKLOG.md
#
# Prerequisites:
# - GitHub CLI (gh) installed: https://cli.github.com/
# - Authenticated: gh auth login
# - Repository configured: gh repo set-default
#
# Usage: ./import-github-issues.sh

set -e

echo "Importing [XX] tasks to GitHub Issues..."
echo ""

# Phase 0: Foundation
echo "Creating Phase 0 tasks..."

gh issue create \
  --title "[TASK-ID]: [Title]" \
  --body "[Full description + Acceptance Criteria + Technical Notes]" \
  --label "priority:p0,domain:[domain],effort:[effort],phase:0" \
  --milestone "Phase 0: Foundation" \
  --assignee "" \
  || echo "Failed to create [TASK-ID]"

[Repeat for each task...]

echo ""
echo "Import complete! [XX] issues created."
echo "View issues: gh issue list"
```

**Notes**:
- Make script executable (chmod +x)
- Include error handling
- Group by phase
- Use GitHub labels for priority, domain, effort, phase
- Create milestones for phases

#### Format: jira

Generate Jira CSV import file:

**File**: `knowledge-base/BACKLOG-jira-import.csv`

**Content**:

```csv
Issue Type,Summary,Description,Priority,Story Points,Labels,Epic Link,Assignee,Sprint
Task,[TASK-ID]: [Title],[Description + Acceptance Criteria],High,3,frontend;p0;phase-0,EPIC-001,,Phase 0
Task,[TASK-ID]: [Title],[Description + Acceptance Criteria],High,5,backend;p0;phase-0,EPIC-001,,Phase 0
[Additional rows...]
```

**Mapping rules**:
- Issue Type: Always "Task"
- Summary: "[TASK-ID]: [Title]"
- Description: Full description + acceptance criteria (escaped for CSV)
- Priority: P0→Highest, P1→High, P2→Medium
- Story Points: XS=1, S=2, M=3, L=5, XL=8
- Labels: Semicolon-separated (domain;priority;phase)
- Epic Link: Use phase as epic (EPIC-0, EPIC-1, etc.)
- Sprint: Map to phase name

**Notes**:
- Escape commas in description
- Use double quotes for fields with line breaks
- Test import with small batch first

### Step 7: Generate Handoff Summary

Create summary for command output (not a file):

**Structure**:

```markdown
# ✅ Project Backlog Generated

**Backlog Location**: `knowledge-base/BACKLOG.md`
**Coverage Score**: [XX%]
**Validation Status**: [Pass/Pass with Warnings/Needs Review]

---

## 📊 Backlog Statistics

- **Total Tasks**: XX
  - Critical (P0): XX tasks (XX days)
  - High (P1): XX tasks (XX days)
  - Medium (P2): XX tasks (XX days)
- **Estimated Timeline**: XX weeks (XX days)
- **Execution Phases**: X phases
- **Critical Path**: XX days
- **Parallel Streams**: X work streams identified

---

## 🎯 Task Distribution

| Domain         | Tasks | Effort  | % of Total |
|----------------|-------|---------|------------|
| Frontend       | XX    | XX days | XX%        |
| Backend        | XX    | XX days | XX%        |
| Infrastructure | XX    | XX days | XX%        |
| Data           | XX    | XX days | XX%        |
| Testing        | XX    | XX days | XX%        |
| Documentation  | XX    | XX days | XX%        |

---

## 🚦 Execution Roadmap

**Phase 0: Foundation** (XX tasks, ~XX days)
- [Brief summary]

**Phase 1: Core Backend** (XX tasks, ~XX days)
- [Brief summary]

**Phase 2: Core Frontend** (XX tasks, ~XX days)
- [Brief summary]

**Phase 3: Integration & Features** (XX tasks, ~XX days)
- [Brief summary]

**Phase 4: Quality & Production Readiness** (XX tasks, ~XX days)
- [Brief summary]

---

[If coverage < 95% OR validation has warnings/errors]:

## ⚠️ Attention Required

**Validation Status**: [Pass with Warnings / Needs Review]

### Gaps Identified:
- [Gap 1: Description]
- [Gap 2: Description]

### High-Risk Tasks:
- [TASK-ID]: [Title] - [Risk description]

### Critical Issues:
- [Issue 1: Description and recommendation]

**Recommendation**: [Address issues before proceeding / Proceed with noted warnings]

---

## 🎬 Recommended Starting Tasks

The following tasks establish foundation and have no blockers:

1. **[TASK-ID]**: [Title] (P0, [X] days, no dependencies)
2. **[TASK-ID]**: [Title] (P0, [X] days, no dependencies)
3. **[TASK-ID]**: [Title] (P0, [X] days, depends on TASK-001)

---

## 📁 Generated Files

- ✅ `knowledge-base/BACKLOG.md` (primary backlog)
- ✅ `knowledge-base/BACKLOG-[timestamp].md` (versioned backup)
- ✅ `TODO.md` (updated with first tasks)
- ✅ `CHANGELOG.md` (backlog creation logged)
[If --format=github]:
- ✅ `scripts/import-github-issues.sh` (GitHub issues import script)
[If --format=jira]:
- ✅ `knowledge-base/BACKLOG-jira-import.csv` (Jira import file)

---

## 🚀 Next Steps

[If coverage ≥ 95% AND no critical issues]:
✅ **Backlog is comprehensive and ready for execution.**

**Proceed to**: `/fetch-task` to start implementation of the first task.

[If coverage 85-94% OR has warnings]:
⚠️ **Backlog is mostly complete with minor gaps.**

**Options**:
1. Address identified gaps (recommended)
2. Proceed to `/fetch-task` with noted limitations

[If coverage < 85% OR has critical issues]:
❌ **Backlog has significant gaps that should be addressed.**

**Action Required**:
1. Review identified issues
2. Consider re-running `/create-prd` with additional details
3. Or manually refine backlog before proceeding
```

## Output Format

**CRITICAL**: The `backlog_document` field MUST contain the COMPLETE markdown document with ALL tasks from the task_list input. This is the primary content that will be written to the file. Do NOT omit any tasks.

```json
{
  "backlog_document": "[The COMPLETE backlog markdown document from Step 2 - include ALL tasks, ALL sections, ALL mermaid diagrams. Escape newlines as \\n, escape quotes as \\\"]",
  "backlog_file_path": "knowledge-base/BACKLOG.md",
  "backup_file_path": "knowledge-base/BACKLOG-20251113143022.md",
  "generated_artifacts": {
    "primary_backlog": {
      "path": "knowledge-base/BACKLOG.md",
      "size_bytes": 45320,
      "task_count": 42,
      "created_at": "2025-11-13T14:30:22Z"
    },
    "backup": {
      "path": "knowledge-base/BACKLOG-20251113143022.md",
      "size_bytes": 45320,
      "created_at": "2025-11-13T14:30:22Z"
    },
    "todo_update": {
      "path": "TODO.md",
      "tasks_added": 5,
      "updated_at": "2025-11-13T14:30:23Z"
    },
    "changelog_update": {
      "path": "CHANGELOG.md",
      "updated_at": "2025-11-13T14:30:23Z"
    },
    "format_specific": {
      "format": "github",
      "path": "scripts/import-github-issues.sh",
      "issue_count": 42,
      "created_at": "2025-11-13T14:30:24Z"
    }
  },
  "handoff_summary": "[Markdown summary from Step 7 - this is a brief summary for display, NOT the full document]",
  "statistics": {
    "total_tasks": 42,
    "total_effort_days": 87,
    "estimated_weeks": 12,
    "coverage_score": 92,
    "phases": 5
  }
}
```

## Success Criteria

- ✅ Primary backlog file created at `knowledge-base/BACKLOG.md`
- ✅ Versioned backup created with timestamp
- ✅ TODO.md updated with first priority tasks
- ✅ CHANGELOG.md updated with backlog entry
- ✅ Format-specific outputs generated (if requested)
- ✅ Handoff summary prepared
- ✅ All files are well-formatted and valid markdown/CSV/bash
- ✅ Dependency graph Mermaid diagram is syntactically correct
- ✅ Task counts and effort calculations are accurate

## Error Handling

### File Write Failures

**Issue**: Cannot write to file (permissions, disk space)

**Action**:
1. Report specific file and error
2. Attempt alternative location if primary fails
3. Suggest manual creation with provided content

### Invalid Mermaid Syntax

**Issue**: Dependency graph generates invalid Mermaid

**Action**:
1. Simplify graph (reduce nodes if too complex)
2. Validate syntax before writing
3. Fall back to simple adjacency list if Mermaid fails

### Existing Backlog Conflicts

**Issue**: BACKLOG.md already exists

**Action**:
1. Create backup of existing file first
2. Prompt user: "Overwrite existing backlog?"
3. If yes, proceed; if no, create BACKLOG-new.md

## Notes

- This prompt focuses on FILE GENERATION only
- Analysis and validation happen in earlier stages
- Use data from previous pipeline stages (don't re-analyze)
- Ensure all generated files are properly formatted
- Mermaid diagrams should be readable and not overly complex
- Handoff summary is for command output, not a file
- Format-specific outputs are optional based on `format` input
- Maintain consistent formatting across all generated files

## REMINDER: Output Requirements

**Output ONLY the JSON object. No markdown, no code blocks, no explanatory text. Start directly with `{` and end with `}`.**

