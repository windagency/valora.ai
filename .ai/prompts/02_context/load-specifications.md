---
id: context.load-specifications
version: 1.0.0
category: context
experimental: true
name: Load Specifications
description: Load and parse refined specifications from various sources
tags:
  - specifications
  - requirements
  - context-loading
model_requirements:
  min_context: 128000
  recommended:
    - gpt-5-thinking-high
    - gpt-o1-high
agents:
  - product-manager
dependencies:
  requires:
    - context.use-modern-cli-tools
inputs:
  - name: specs_file_arg
    description: Optional path to specifications file
    type: string
    required: false
outputs:
  - specifications
  - project_type
  - existing_context
tokens:
  avg: 3000
  max: 6000
  min: 1500
---

# Load Specifications

## Objective

Load refined specifications from available sources and extract structured requirements data for PRD generation.

## Instructions

### Step 1: Locate Specifications

Check for specifications in priority order:

1. **User-provided file** (if file content is provided below):
   - The file content is provided in the user message between `--- File: ... ---` markers
   - Parse the provided content directly (do NOT attempt to read files yourself)
   - Validate it contains specifications
   - Use as primary source

2. **Recent SPECS file** in `knowledge-base/`:
   - Search for `SPECS-*.md` files
   - Sort by timestamp (most recent first)
   - Read most recent file

3. **FUNCTIONAL.md** in `knowledge-base/`:
   - Check for `knowledge-base/FUNCTIONAL.md`
   - Use as fallback specifications source

4. **Existing PRD.md** (for updates):
   - Check for `knowledge-base/PRD.md`
   - Extract requirements for update scenario

5. **User-provided inline** (last resort):
   - Ask user to provide specifications
   - Guide them on required format

### Step 2: Parse Specifications

**Extract key sections**:

- **Problem Statement**: What problem are we solving?
- **Target Users**: Who will use this?
- **Success Criteria**: How do we measure success?
- **Functional Requirements**: What features are needed?
  - Must Have (P0)
  - Should Have (P1)
  - Nice to Have (P2)
- **Non-Functional Requirements**: Performance, security, scalability
- **Constraints**: Technical, business, time, budget
- **Out of Scope**: What we're NOT doing
- **Assumptions**: What we're assuming to be true
- **Open Questions**: Unresolved items
- **Dependencies**: External systems, services, teams
- **Risks**: Potential issues and mitigations

**Parse format**:

- Support markdown heading structure
- Extract bullet points and checklists
- Parse tables if present
- Identify requirement IDs (FR-001, NFR-002, etc.)
- Extract priority markers (P0, P1, P2)

### Step 3: Determine Project Type

Analyze specifications to identify project type:

**Types**:

1. **Greenfield**: New project from scratch
   - Indicators: No existing codebase mentioned, "build new", "start fresh"
   - Implications: Need full architecture, all components new

2. **Brownfield**: Extending existing system
   - Indicators: References to existing code, "add to", "extend"
   - Implications: Integration with existing architecture, backward compatibility

3. **Migration**: Replacing/modernizing legacy
   - Indicators: "migrate from", "replace", "modernize"
   - Implications: Data migration, parallel run, cutover strategy

4. **Integration**: Connecting multiple systems
   - Indicators: "integrate with", "connect", "sync between"
   - Implications: API contracts, data mapping, error handling

5. **Enhancement**: Adding features to stable product
   - Indicators: "add feature", "improve", specific feature name
   - Implications: Minimal disruption, feature flags, incremental rollout

**Decision logic**:

- Greenfield if: No codebase references + "new" keywords
- Brownfield if: Existing code references + "add/extend" keywords
- Migration if: "migrate/replace" keywords + old/new system mentions
- Integration if: Multiple system names + "integrate/connect" keywords
- Enhancement if: Specific feature additions + stable product context

### Step 4: Load Existing Project Context

Check for existing documentation in `knowledge-base/`:

**Architecture documentation**:

- `knowledge-base/infrastructure/HLD.md` (High-Level Design)
- `knowledge-base/backend/ARCHITECTURE.md`
- `knowledge-base/frontend/ARCHITECTURE.md`

**Technical specifications**:

- `knowledge-base/backend/API.md` (API contracts)
- `knowledge-base/backend/DATA.md` (Data models)
- `knowledge-base/frontend/COMPONENTS.md`

**Testing & deployment**:

- `knowledge-base/*/TESTING.md`
- `infrastructure/` (deployment configs)

**Parse existing context**:

- Current tech stack
- Architectural patterns (microservices, monolith, etc.)
- Integration points
- Deployment environment (cloud provider, k8s, etc.)
- Testing strategies

### Step 5: Extract Tech Stack & Constraints

**From specifications**:

- Explicit technology mentions (React, Node.js, PostgreSQL, etc.)
- Platform constraints (mobile, web, desktop)
- Infrastructure requirements (AWS, Azure, on-prem)

**From existing context**:

- Current languages and frameworks
- Database systems in use
- CI/CD pipelines
- Monitoring and logging tools

**From constraints section**:

- Technical debt limitations
- Performance requirements
- Security standards
- Compliance requirements (GDPR, HIPAA, SOC2)

### Step 6: Validate Completeness

Check if specifications are sufficient for PRD generation:

**Required elements** (must have):

- [ ] Problem statement is clear
- [ ] Target users are identified
- [ ] At least 3 P0 requirements defined
- [ ] Success criteria are measurable
- [ ] Constraints are documented

**Warning elements** (should have):

- [ ] Non-functional requirements specified
- [ ] Dependencies identified
- [ ] Risks documented
- [ ] Out-of-scope items listed

**Completeness score**:

```plaintext
Completeness = (Required elements / 5 + Warning elements / 4) / 2 * 100%
```

**Decision**:

- **≥ 80%**: Sufficient for PRD generation
- **60-79%**: Proceed with warnings
- **< 60%**: Insufficient, request more details

## Output Format

**CRITICAL: Your response MUST be ONLY valid JSON. No markdown, no explanations, no prose. Just the JSON object below.**

```json
{
  "specifications": {
    "source": "knowledge-base/SPECS-20251113-143022.md",
    "problem_statement": "Teams struggle with task visibility...",
    "target_users": {
      "primary": "Remote team leads (10-50 person teams)",
      "secondary": "Individual contributors",
      "personas": ["Team Lead", "Developer", "QA"]
    },
    "success_criteria": {
      "quantitative": [
        {"metric": "User adoption", "target": "80% within 3 months"},
        {"metric": "Status meetings reduction", "target": "30%"}
      ],
      "qualitative": [
        "Improved task visibility",
        "Better accountability"
      ]
    },
    "functional_requirements": {
      "p0": [
        {"id": "FR-001", "description": "Create and assign tasks"},
        {"id": "FR-002", "description": "Real-time status updates"}
      ],
      "p1": [
        {"id": "FR-003", "description": "Slack/Teams integration"}
      ],
      "p2": [
        {"id": "FR-004", "description": "Gantt chart view"}
      ]
    },
    "non_functional_requirements": [
      {"id": "NFR-001", "category": "Performance", "description": "<2s page load"},
      {"id": "NFR-002", "category": "Security", "description": "OAuth2 + RBAC"},
      {"id": "NFR-003", "category": "Scalability", "description": "Support 10k users"}
    ],
    "constraints": {
      "technical": ["Must use existing PostgreSQL database"],
      "business": ["Budget: $50k"],
      "time": ["Launch by Q2 2026"],
      "regulatory": ["GDPR compliant"]
    },
    "out_of_scope": [
      "Mobile app (Phase 2)",
      "Advanced analytics dashboard"
    ],
    "assumptions": [
      "Users have modern browsers (Chrome, Firefox, Safari)",
      "Team sizes are 10-50 people"
    ],
    "open_questions": [
      {"question": "Support offline mode?", "priority": "medium"},
      {"question": "Integration with Jira?", "priority": "low"}
    ],
    "dependencies": [
      {"name": "Slack API", "type": "external", "criticality": "high"},
      {"name": "Auth service", "type": "internal", "criticality": "high"}
    ],
    "risks": [
      {
        "description": "Slack API rate limits",
        "impact": "high",
        "likelihood": "medium",
        "mitigation": "Implement caching and batching"
      }
    ]
  },
  "project_type": "brownfield",
  "project_type_reasoning": "Extending existing task management system with real-time features",
  "existing_context": {
    "has_architecture_docs": true,
    "tech_stack": {
      "frontend": ["React", "TypeScript"],
      "backend": ["Node.js", "Express"],
      "database": ["PostgreSQL"],
      "infrastructure": ["AWS", "Docker", "Kubernetes"]
    },
    "deployment_environment": "AWS EKS",
    "testing_strategy": "Jest + Cypress"
  },
  "completeness_score": 0.92,
  "completeness_status": "sufficient",
  "missing_elements": [
    "Performance benchmarks not specified"
  ],
  "ready_for_prd": true
}
```

## Success Criteria

- ✅ Specifications loaded from appropriate source
- ✅ All key sections extracted
- ✅ Project type identified
- ✅ Existing context analyzed
- ✅ Completeness validated (≥80%)
- ✅ Structured data ready for PRD generation

## Error Handling

### No Specifications Found

**Issue**: Cannot locate specifications file

**Action**:

1. List available files in knowledge-base/
2. Ask user to provide specifications
3. Suggest running `/refine-specs` first
4. Provide specifications template

### Malformed Specifications

**Issue**: Specifications file doesn't parse correctly

**Action**:

1. Attempt partial parsing
2. Extract what's available
3. Warn user about missing sections
4. Suggest manual review

### Insufficient Specifications

**Issue**: Completeness score < 60%

**Action**:

1. List missing required elements
2. Request specific information
3. Suggest re-running `/refine-specs`
4. Don't proceed to PRD generation

### Conflicting Information

**Issue**: Specifications contradict existing context

**Action**:

1. Highlight conflicts
2. Ask user to clarify intent
3. Document resolution
4. Update specifications if needed

## Notes

- This prompt focuses on LOADING and PARSING, not generating
- Validation is lightweight (completeness check only)
- Deep analysis happens in next stage (analyze-requirements)
- Structure output for easy consumption by subsequent prompts

