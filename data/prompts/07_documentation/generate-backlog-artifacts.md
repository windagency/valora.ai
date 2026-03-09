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

````markdown
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

| Priority  | Count  | Effort (days) | % of Total |
| --------- | ------ | ------------- | ---------- |
| P0        | XX     | XX            | XX%        |
| P1        | XX     | XX            | XX%        |
| P2        | XX     | XX            | XX%        |
| **Total** | **XX** | **XX**        | **100%**   |

### Domain Breakdown

| Domain         | Tasks | Effort (days) | % of Total |
| -------------- | ----- | ------------- | ---------- |
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

## 🚦 Stage Gates

Stage gates are mandatory checkpoints between phases. Each gate defines the review and test criteria that MUST pass before the next phase begins.

| Gate                 | After Phase   | Review Focus                                        | Automated Tests Required                     | Key Manual Tests                                      |
| -------------------- | ------------- | --------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| **Gate 0 → 1**       | Foundation    | Infra up, CI/CD green, core models merged           | Unit tests, lint, smoke test                 | Fresh env setup, DB schema check, config validation   |
| **Gate 1 → 2**       | Core Backend  | APIs documented, auth working, data layer tested    | Integration tests, API contract validation   | API explorer walkthrough, auth flow, edge-case inputs |
| **Gate 2 → 3**       | Core Frontend | UI components reviewed, mock API removed            | Component tests, visual regression baseline  | Cross-browser walkthrough, accessibility, forms       |
| **Gate 3 → 4**       | Integration   | E2E flows verified, third-party integrations stable | E2E suite green, load test baseline          | Core user journeys, role-based access, rollback drill |
| **Gate 4 → Release** | Quality       | Security audit done, docs complete, SLOs met        | Full regression pass, performance benchmarks | Runbook walkthrough, monitoring alert drill, sec spot |

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

> ### 🔍 Stage Gate 0 → 1: Foundation Review
>
> **Must pass before starting Phase 1.**
>
> **Exit Criteria**:
>
> - [ ] All Phase 0 tasks marked Done
> - [ ] CI/CD pipeline green on main branch
> - [ ] Development environment reproducible from scratch (README verified)
> - [ ] Core data models reviewed and approved
> - [ ] Base infrastructure deployed to staging
>
> **Tests Required**:
>
> - [ ] All unit tests pass (`pnpm test:suite:unit` or equivalent)
> - [ ] Linting and type checks clean
> - [ ] Smoke test: application starts without errors
>
> **🧑 Manual Testing — How to verify as a human**:
>
> 1. **Fresh environment setup**: Clone the repo on a clean machine (or container), follow the README step by step, and confirm the app starts with no extra steps needed. Note any missing instructions.
> 2. **Database / schema check**: Connect to the local database with a GUI tool (e.g. TablePlus, pgAdmin, DBeaver) and verify all core tables/collections exist with the expected columns and constraints.
> 3. **CI/CD pipeline**: Open the CI dashboard (GitHub Actions, GitLab CI, etc.), trigger a build on main, and confirm it completes green end-to-end.
> 4. **Infrastructure smoke test**: Open the staging URL in a browser and confirm the application responds (200 OK on `/health` or equivalent). Check logs for startup errors.
> 5. **Config & secrets**: Verify `.env.example` is up-to-date and that the app refuses to start with a missing required variable (test by removing one value).
>
> **Reviewers**: Tech Lead + Product Owner
>
> ---

### Phase 1: Core Backend

[Tasks grouped by phase — repeat task format from Phase 0]

---

> ### 🔍 Stage Gate 1 → 2: Backend Review
>
> **Must pass before starting Phase 2.**
>
> **Exit Criteria**:
>
> - [ ] All Phase 1 tasks marked Done
> - [ ] All API endpoints documented (OpenAPI/Swagger or equivalent)
> - [ ] Authentication and authorization working end-to-end
> - [ ] Data layer integration tested
>
> **Tests Required**:
>
> - [ ] Integration tests pass for all backend services
> - [ ] API contract validated (schema tests or consumer-driven contracts)
> - [ ] Security review: no critical vulnerabilities in backend
>
> **🧑 Manual Testing — How to verify as a human**:
>
> 1. **API explorer**: Open the Swagger/OpenAPI UI (e.g. `http://localhost:3000/api-docs`) and call each endpoint manually. Verify responses match the documented schema, including error cases (missing fields, wrong types).
> 2. **Authentication flow**: Using a REST client (Postman, Insomnia, or `curl`):
>    - Register a new user → confirm 201 and token returned.
>    - Log in with valid credentials → confirm token.
>    - Call a protected endpoint without a token → confirm 401.
>    - Call with an expired/invalid token → confirm 401.
>    - Call with a token that lacks the required role → confirm 403.
> 3. **Data persistence**: Create a resource via the API, restart the server, then fetch it again and confirm it persists correctly.
> 4. **Edge cases**: Send payloads with missing required fields, extra unknown fields, and boundary values (empty strings, very long strings, negative numbers) — confirm the API returns consistent, descriptive 4xx errors.
> 5. **Logs review**: Tail the server logs during the above steps and confirm no unexpected stack traces or unhandled errors appear.
>
> **Reviewers**: Tech Lead + Security Reviewer
>
> ---

### Phase 2: Core Frontend

[Tasks grouped by phase — repeat task format from Phase 0]

---

> ### 🔍 Stage Gate 2 → 3: Frontend Review
>
> **Must pass before starting Phase 3.**
>
> **Exit Criteria**:
>
> - [ ] All Phase 2 tasks marked Done
> - [ ] All UI components reviewed (UX sign-off)
> - [ ] Mock API removed or feature-flagged off
> - [ ] Accessibility baseline met (WCAG AA minimum)
>
> **Tests Required**:
>
> - [ ] Component/unit tests pass for all UI components
> - [ ] Visual regression baseline captured
> - [ ] Cross-browser smoke test (latest Chrome, Firefox, Safari)
>
> **🧑 Manual Testing — How to verify as a human**:
>
> 1. **Visual walkthrough**: Open the app in Chrome, Firefox, and Safari. Navigate through every screen implemented so far. Compare against design mockups (Figma/Zeplin) and flag visual discrepancies.
> 2. **Responsive layout**: Resize the browser window (or use DevTools device emulation) across mobile (375px), tablet (768px), and desktop (1280px+). Confirm no layout breaks or overflow.
> 3. **Mock API removed**: Open DevTools → Network tab. Perform key user actions and confirm all requests hit a real backend URL, not localhost mock handlers or hardcoded JSON fixtures.
> 4. **Accessibility check**: Using the browser's built-in accessibility tree (Chrome DevTools → Accessibility) or the axe DevTools extension, run a scan on each main page and confirm no critical violations.
> 5. **Keyboard navigation**: Tab through every interactive element on each screen. Confirm focus is always visible and logical order is maintained. Test Enter/Space to activate buttons and links.
> 6. **Form validation**: Submit every form with empty fields, invalid formats (bad email, short password), and boundary values. Confirm inline error messages appear and are screen-reader-friendly (aria-describedby).
>
> **Reviewers**: Tech Lead + UX Designer + Product Owner
>
> ---

### Phase 3: Integration & Features

[Tasks grouped by phase — repeat task format from Phase 0]

---

> ### 🔍 Stage Gate 3 → 4: Integration Review
>
> **Must pass before starting Phase 4.**
>
> **Exit Criteria**:
>
> - [ ] All Phase 3 tasks marked Done
> - [ ] All major E2E user flows verified in staging
> - [ ] Third-party integrations stable (no critical failures in 48h)
> - [ ] Feature completeness sign-off from Product Owner
>
> **Tests Required**:
>
> - [ ] Full E2E test suite green in staging environment
> - [ ] Load test baseline established (define SLOs)
> - [ ] Rollback procedure verified
>
> **🧑 Manual Testing — How to verify as a human**:
>
> 1. **Core user journeys** (walk through each as a real user on staging):
>    - Happy path: complete the primary workflow from start to finish (e.g. sign up → configure → use main feature → sign out).
>    - Error recovery: simulate failures mid-flow (e.g. disconnect network, submit invalid data) and confirm the app recovers gracefully without data loss.
>    - Re-entry: leave mid-flow, return later, and confirm state is preserved where expected.
> 2. **Third-party integrations**: Trigger each external integration manually (e.g. send a payment, fire a webhook, receive an email). Confirm the expected side-effect occurs and the UI reflects the outcome.
> 3. **Cross-feature interactions**: Test features that share data or state — confirm changes in one area are correctly reflected elsewhere (e.g. update a profile → verify the header avatar updates).
> 4. **Role-based access**: Log in as each user role (admin, regular user, read-only, etc.) and confirm each role sees only the features and data it should.
> 5. **Rollback drill**: Follow the documented rollback procedure in a staging environment. Confirm the previous version is restored and data integrity is maintained. Record the time taken.
>
> **Reviewers**: Tech Lead + Product Owner + QA Lead
>
> ---

### Phase 4: Quality & Production Readiness

[Tasks grouped by phase — repeat task format from Phase 0]

---

> ### 🔍 Stage Gate 4 → Release: Production Readiness Review
>
> **Must pass before production release.**
>
> **Exit Criteria**:
>
> - [ ] All Phase 4 tasks marked Done
> - [ ] Security audit completed (no critical/high findings open)
> - [ ] User documentation complete and reviewed
> - [ ] SLOs defined and monitoring dashboards live
> - [ ] On-call runbook written
>
> **Tests Required**:
>
> - [ ] Full regression suite passes on production-like environment
> - [ ] Performance benchmarks meet SLOs (latency, throughput, error rate)
> - [ ] Disaster recovery / backup restore tested
>
> **🧑 Manual Testing — How to verify as a human**:
>
> 1. **Full regression walkthrough**: Using the production-like environment, walk through every major user flow end-to-end as a first-time user. Use the user documentation as your only guide — if the docs are unclear or incomplete, flag them.
> 2. **Performance feel**: Navigate through the app and note any screen that feels slow to load or interact with. Open DevTools → Network and Performance tabs. Flag any page load > 3s or interaction > 300ms for investigation.
> 3. **Monitoring & alerting**: Trigger a known error (e.g. call a bad endpoint, simulate a slow query) and confirm:
>    - The error appears in the monitoring dashboard within 1–2 minutes.
>    - The configured alert fires (Slack, PagerDuty, email, etc.).
> 4. **Security spot check**: As a logged-in user, manually attempt to access another user's data by modifying IDs in URLs or request bodies. Confirm the API returns 403/404 and does not leak data.
> 5. **Backup restore drill**: Restore the latest backup to an isolated environment. Confirm the app starts, data is intact, and the most recent known records are present.
> 6. **Runbook walkthrough**: A team member who did NOT write the runbook follows it cold to simulate an on-call incident. Note any steps that are unclear, missing, or outdated.
>
> **Reviewers**: Tech Lead + Security + Product Owner + Ops/DevOps
>
> ---

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
````

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

````

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
````

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
| -------------- | ----- | ------- | ---------- |
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
