---
id: context.load-prd
version: 1.0.0
category: context
experimental: true
name: Load PRD
description: Load and parse Product Requirements Document for backlog generation
tags:
  - prd
  - requirements
  - context-loading
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.use-modern-cli-tools
inputs:
  - name: prd_file_arg
    description: Optional path to PRD file from --prd-file argument
    type: string
    required: false
outputs:
  - prd_document
  - requirements_list
tokens:
  avg: 3000
  max: 6000
  min: 1500
---

# Load PRD

## Objective

Locate and load the Product Requirements Document (PRD), then extract all requirements into a structured format for backlog generation.

## CRITICAL: Output Format Requirement

**You MUST output ONLY valid JSON. Do NOT output markdown, do NOT wrap in code blocks, do NOT add any text before or after the JSON.**

Your response must be a single JSON object matching the schema defined in the "Output Format" section at the end of this prompt.

## Instructions

### Step 1: Locate PRD Document

Check for PRD in priority order:

1. **User-provided file** (if `prd_file_arg` provided):
   - Read file at specified path
   - Validate it's a PRD
   - Use as primary source

2. **PRD.md** in `knowledge-base/`:
   - Check for `knowledge-base/PRD.md`
   - Use if exists

3. **Timestamped PRD** in `knowledge-base/`:
   - Search for `knowledge-base/PRD-*.md` files
   - Sort by timestamp (most recent first)
   - Read most recent file

4. **FUNCTIONAL.md** as fallback:
   - Check for `knowledge-base/FUNCTIONAL.md`
   - Use as fallback source

5. **Fail if not found**:
   - List available files in knowledge-base/
   - Inform user: "No PRD found. Please run `/create-prd` first or provide --prd-file argument."
   - Exit with error

### Step 2: Parse PRD Structure

Extract all key sections from the PRD:

**Core sections**:

- **Project Overview**: Name, description, goals
- **Target Users & Personas**: User types, characteristics
- **Success Metrics**: Measurable outcomes
- **Functional Requirements**: All FR-XXX items with priority (P0/P1/P2)
- **Non-Functional Requirements**: All NFR-XXX items (performance, security, etc.)
- **User Stories**: All US-XXX items with acceptance criteria
- **Technical Requirements**: Architecture, infrastructure, stack
- **Dependencies**: External systems, services, prerequisites
- **Constraints**: Technical, business, time, budget limitations
- **Risks**: Identified risks and mitigation strategies
- **Out of Scope**: Explicitly excluded items
- **Timeline**: Milestones, deadlines, phases

**Parse format**:

- Extract markdown headings and structure
- Parse requirement IDs (FR-001, NFR-002, US-003, etc.)
- Extract priority markers (P0, P1, P2, Must Have, Should Have, Nice to Have)
- Parse tables (if present)
- Extract metadata (dates, authors, version)

### Step 3: Extract Requirements List

Create structured list of all requirements:

**For each functional requirement (FR-XXX)**:

- ID (e.g., FR-001)
- Title/Description
- Priority (P0/P1/P2)
- Associated user stories (if any)
- Acceptance criteria
- Dependencies (other requirements it depends on)
- Domain hint (Frontend, Backend, Data, Infrastructure, Testing, Documentation)

**For each non-functional requirement (NFR-XXX)**:

- ID (e.g., NFR-001)
- Category (Performance, Security, Scalability, Availability, etc.)
- Description
- Target/Threshold (e.g., "<200ms response time")
- Priority (P0/P1/P2)

**For each user story (US-XXX)**:

- ID (e.g., US-001)
- Story text ("As a [user], I want to [action], so that [benefit]")
- Linked requirement(s)
- Acceptance criteria
- Priority

### Step 4: Extract Metadata

**Project metadata**:

- Project name
- Project type (greenfield, brownfield, enhancement, migration)
- Tech stack (if specified)
- Timeline/milestones
- Team size/velocity (if specified)

**Requirements statistics**:

- Total requirements count
- P0 count, P1 count, P2 count
- Functional vs non-functional split
- User stories count

### Step 5: Validate PRD Completeness

Quick validation for backlog generation:

**Required for backlog generation**:

- [ ] At least 1 P0 requirement exists
- [ ] Requirements have clear descriptions
- [ ] Priorities are assigned
- [ ] Success metrics are defined

**Warnings**:

- [ ] Missing acceptance criteria (warn but proceed)
- [ ] No dependencies documented (warn but proceed)
- [ ] No user stories (warn but proceed)
- [ ] No timeline specified (warn but proceed)

**Completeness decision**:

- **≥ 3 P0 requirements**: Sufficient for backlog
- **1-2 P0 requirements**: Minimal, warn user
- **0 P0 requirements**: Insufficient, suggest refining PRD

## Output Format

```json
{
  "prd_document": {
    "source_file": "knowledge-base/PRD.md",
    "metadata": {
      "project_name": "Task Management Platform",
      "project_type": "brownfield",
      "version": "1.0",
      "last_updated": "2025-11-13",
      "tech_stack": {
        "frontend": ["React", "TypeScript"],
        "backend": ["Node.js", "Express"],
        "database": ["PostgreSQL"],
        "infrastructure": ["AWS", "Docker", "Kubernetes"]
      },
      "timeline": {
        "target_launch": "Q2 2026",
        "milestones": [
          {"name": "MVP", "date": "2026-03-31"},
          {"name": "Beta", "date": "2026-05-15"}
        ]
      }
    },
    "overview": {
      "description": "Real-time task management platform for remote teams",
      "goals": [
        "Improve task visibility",
        "Reduce status meeting overhead",
        "Enable async collaboration"
      ]
    },
    "target_users": {
      "primary": "Remote team leads (10-50 person teams)",
      "secondary": "Individual contributors",
      "personas": ["Team Lead", "Developer", "QA"]
    },
    "success_metrics": [
      {"metric": "User adoption", "target": "80% within 3 months"},
      {"metric": "Status meetings reduction", "target": "30%"}
    ],
    "constraints": {
      "technical": ["Must use existing PostgreSQL database"],
      "business": ["Budget: $50k"],
      "time": ["Launch by Q2 2026"],
      "regulatory": ["GDPR compliant"]
    },
    "risks": [
      {
        "id": "RISK-001",
        "description": "Slack API rate limits",
        "impact": "high",
        "likelihood": "medium",
        "mitigation": "Implement caching and batching"
      }
    ],
    "out_of_scope": [
      "Mobile app (Phase 2)",
      "Advanced analytics dashboard"
    ]
  },
  "requirements_list": {
    "functional": [
      {
        "id": "FR-001",
        "title": "Create and assign tasks",
        "description": "Users can create tasks with title, description, deadline and assign to team members",
        "priority": "P0",
        "domain_hints": ["Backend", "Frontend", "Data"],
        "user_stories": ["US-001", "US-002"],
        "acceptance_criteria": [
          "Task can be created with required fields",
          "Task can be assigned to one or more users",
          "Assignees receive notifications"
        ],
        "dependencies": [],
        "technical_notes": "Requires tasks table, assignment logic, notification system"
      },
      {
        "id": "FR-002",
        "title": "Real-time status updates",
        "description": "Task status changes are reflected in real-time across all connected clients",
        "priority": "P0",
        "domain_hints": ["Backend", "Frontend", "Infrastructure"],
        "user_stories": ["US-003"],
        "acceptance_criteria": [
          "Status changes appear within 1 second",
          "No page refresh required",
          "Works for up to 100 concurrent users per team"
        ],
        "dependencies": ["FR-001"],
        "technical_notes": "Requires WebSocket or Server-Sent Events, pub/sub architecture"
      }
    ],
    "non_functional": [
      {
        "id": "NFR-001",
        "category": "Performance",
        "description": "Page load time under 2 seconds (p95)",
        "priority": "P0",
        "target": "<2s",
        "measurement": "p95 response time"
      },
      {
        "id": "NFR-002",
        "category": "Security",
        "description": "OAuth2 authentication with role-based access control",
        "priority": "P0",
        "target": "OAuth2 + RBAC",
        "compliance": ["GDPR", "SOC2"]
      },
      {
        "id": "NFR-003",
        "category": "Scalability",
        "description": "Support 10,000 concurrent users",
        "priority": "P1",
        "target": "10k concurrent users",
        "measurement": "Concurrent active sessions"
      }
    ],
    "user_stories": [
      {
        "id": "US-001",
        "requirement_id": "FR-001",
        "story": "As a team lead, I want to create new tasks with title, description, and deadline, so that I can organize work for my team",
        "acceptance_criteria": [
          "Given I am a logged-in team lead, when I click 'New Task' and fill in title, description, deadline, then a new task is created",
          "Given I am creating a task, when I leave the title field empty, then I see an error 'Title is required'"
        ],
        "priority": "P0"
      }
    ]
  },
  "statistics": {
    "total_requirements": 23,
    "functional_requirements": 18,
    "non_functional_requirements": 5,
    "by_priority": {
      "p0": 14,
      "p1": 7,
      "p2": 2
    },
    "by_domain": {
      "frontend": 6,
      "backend": 8,
      "data": 3,
      "infrastructure": 4,
      "testing": 0,
      "documentation": 2
    },
    "user_stories_count": 23
  },
  "validation": {
    "is_valid": true,
    "completeness_score": 0.95,
    "has_p0_requirements": true,
    "has_acceptance_criteria": true,
    "has_priorities": true,
    "has_success_metrics": true,
    "warnings": [
      "Some requirements lack explicit dependencies",
      "Testing requirements not explicitly documented"
    ],
    "ready_for_backlog": true
  }
}
```

## Success Criteria

- ✅ PRD document located and loaded
- ✅ All requirements extracted with IDs and priorities
- ✅ Requirements list structured and complete
- ✅ Metadata parsed
- ✅ Basic validation passed
- ✅ Ready for requirements analysis stage

## Error Handling

### PRD Not Found

**Issue**: Cannot locate PRD document

**Action**:

1. List files in knowledge-base/
2. Inform user: "No PRD found. Please run `/create-prd` first or specify `--prd-file` argument."
3. Exit with error (do not proceed)

### Malformed PRD

**Issue**: PRD exists but doesn't parse correctly

**Action**:

1. Attempt partial parsing
2. Extract what's available
3. Warn user about missing sections
4. Proceed if at least 1 P0 requirement found

### Insufficient Requirements

**Issue**: PRD has no P0 requirements

**Action**:

1. Warn user: "PRD has no P0 (critical) requirements"
2. Ask: "Should I proceed anyway or refine PRD first?"
3. Wait for user decision

## Notes

- This prompt is focused on LOADING and PARSING only
- No analysis or decomposition happens here (that's in next stage)
- Structure output for easy consumption by `analyze-requirements` prompt
- Validation is lightweight (just check if backlog generation is possible)
- Deep requirements analysis happens in `onboard.analyze-requirements`

## REMINDER: Output Requirements

**Output ONLY the JSON object. No markdown, no code blocks, no explanatory text. Start directly with `{` and end with `}`.**

