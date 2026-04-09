---
id: documentation.generate-backend-docs
version: 1.0.0
category: documentation
experimental: true
name: Generate Backend Documentation
description: Generate 5 backend documentation files (ARCHITECTURE, API, DATA, TESTING, CODING-ASSERTIONS)
tags:
  - documentation
  - backend
  - api
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - software-engineer-typescript-backend
dependencies:
  requires:
    - onboard.analyze-documentation-requirements
    - context.use-modern-cli-tools
inputs:
  - name: documentation_plan
    description: Full documentation plan object (extract backend domain)
    type: object
    required: true
  - name: diagram_requirements
    description: Full diagram requirements object (extract backend domain)
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
  - name: target_domain
    description: Domain to generate (always 'backend' for this prompt)
    type: string
    required: true
outputs:
  - architecture_document
  - api_document
  - data_document
  - testing_document
  - coding_assertions_document
tokens:
  avg: 25000
  max: 50000
  min: 15000
---

# Generate Backend Documentation

## Documentation Philosophy — MANDATORY

Every document has two audiences. Confusing them makes documentation useless to both.

1. **Consumers** scan like a menu: find the endpoint, see what it takes, copy the example, move on. They will not read a wall of text.
2. **Maintainers** need the full picture: why there are two calls, why a field is nullable, the historical context. They debug at 2AM.

**Structure rule**: Lead with WHAT it does. Follow with HOW to use it. Bury the WHY behind `<details>` collapsible sections.

**Use this exact HTML syntax for all maintainer-depth sections:**

```markdown
<details>
<summary><strong>Section Title</strong></summary>

Content here — design rationale, historical context, edge cases.

</details>
```

**If a section has no meaningful project-specific content, omit it entirely.** An empty section is worse than no section.

## Objective

Generate 5 comprehensive audience-layered backend documentation files by **writing them directly to disk** using the `write` tool. Apply British English for prose and include Mermaid diagrams as specified.

## CRITICAL: Write Files Directly

**DO NOT return document content in JSON.** Instead:

1. Use the `write` tool to write each document file directly
2. Return only metadata about what was written

This prevents JSON truncation issues with large documents.

## Input Processing

**Extract your domain-specific data from the full input objects:**

- `plan = documentation_plan.backend` (or `documentation_plan[target_domain]`)
- `diagrams = diagram_requirements.backend` (or `diagram_requirements[target_domain]`)

If the backend domain is not present or `plan.enabled` is false, output an empty result with all documents set to `null`.

## Language Standards

- **British English** for all prose content (colour, behaviour, organisation, utilise)
- **American English** for code snippets and technical identifiers
- Consistent spelling throughout each document

## Document Header Template

All documents must begin with this header:

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

---
```

## Instructions

### Step 1: Create Output Directory

Use `list_dir` to check if `knowledge-base/backend/` exists.

### Step 2: Generate and Write ARCHITECTURE.md

Use the `write` tool to create `knowledge-base/backend/ARCHITECTURE.md` with:

**Consumer Surface (always present — leads the document)**:

1. **Purpose** — one sentence
2. **Architecture Overview** — 2-3 sentences + Component Diagram (Mermaid flowchart)
3. **Service Boundaries** — table of services and their single responsibilities
4. **Key Patterns** — table of patterns used and where (`Pattern | Where Applied | Why`)

**Maintainer Depth (use `<details>` tags)**:

5. `<details>` **Layer Architecture Rationale** — why this layering was chosen, alternatives rejected
6. `<details>` **Dependency Graph Analysis** — why certain dependencies exist, what to avoid
7. `<details>` **Error Handling Strategy** — how errors propagate and why
8. `<details>` **Middleware Chain** — ordering rationale and edge cases

**Conditional (only if project-specific content exists)**:

9. **Related Documentation** — cross-references

### Step 3: Generate and Write API.md

Use the `write` tool to create `knowledge-base/backend/API.md` with:

**Consumer Surface (always present — leads the document)**:

1. **Quick Reference Table** — all endpoints: `Method | Path | Description | Auth Required`
2. **Authentication** — how to authenticate with copy-paste ready examples
3. **Base URL and Versioning** — base URL and version scheme
4. **Endpoints by Resource** — for each endpoint: method, path, request params, request body (example), response (example), error codes. Example-first.
5. **Error Codes** — standard error table: `HTTP Status | Code | Description`

**Maintainer Depth (use `<details>` tags)**:

6. `<details>` **Rate Limiting** — limits, burst rules, headers, and why these limits were chosen
7. `<details>` **Sequence Diagrams** (Mermaid sequenceDiagram) — internal flows, only when non-obvious
8. `<details>` **Authentication Architecture** — why this auth mechanism, token lifecycle, edge cases

**Conditional (only if project-specific content exists)**:

9. **Related Documentation** — cross-references

### Step 4: Generate and Write DATA.md

Use the `write` tool to create `knowledge-base/backend/DATA.md` with:

**Consumer Surface (always present — leads the document)**:

1. **Purpose** — one sentence
2. **Data Model Overview** — high-level description + Entity Relationship Diagram (Mermaid erDiagram)
3. **Entity Definitions** — one table per entity with fields, types, constraints, and nullable rationale
4. **Relationships** — table of entity relationships: `Entity A | Relationship | Entity B | Notes`

**Maintainer Depth (use `<details>` tags)**:

5. `<details>` **Indexing Strategy** — which indexes exist and why, query patterns they serve
6. `<details>` **Migration History and Workflow** — how migrations work, notable past migrations, pitfalls
7. `<details>` **Validation Rules Rationale** — why specific constraints exist (especially non-obvious ones)
8. `<details>` **Caching Strategy** — what is cached, TTL, invalidation logic, and why

**Conditional (only if project-specific content exists)**:

9. **Related Documentation** — cross-references

### Step 5: Generate and Write TESTING.md

Use the `write` tool to create `knowledge-base/backend/TESTING.md` with:

**Consumer Surface (always present — leads the document)**:

1. **Testing Approach** — philosophy in 2-3 sentences + Test Pyramid diagram (Mermaid)
2. **How to Run Tests** — copy-paste commands for unit, integration, and E2E tests
3. **Coverage Requirements** — table of thresholds by layer: `Layer | Minimum Coverage | Tool`

**Maintainer Depth (use `<details>` tags)**:

4. `<details>` **Unit Testing Patterns** — what to unit test, what to mock, and why
5. `<details>` **Integration Testing Architecture** — test database setup, fixtures, why integration tests are structured this way
6. `<details>` **E2E Testing Infrastructure** — environment setup, data seeding, known flakiness and mitigations
7. `<details>` **Test Data Management** — fixture strategy, factory patterns, why this approach
8. `<details>` **CI Integration** — pipeline configuration, parallelisation, test splitting

**Conditional (only if project-specific content exists)**:

9. **Related Documentation** — cross-references

### Step 6: Generate and Write CODING-ASSERTIONS.md

Use the `write` tool to create `knowledge-base/backend/CODING-ASSERTIONS.md` with:

**Consumer Surface (always present — leads the document)**:

1. **Quick Reference** — scannable rules table: `Category | Rule | Enforcement`
2. **Naming Conventions** — table of naming rules by construct (classes, files, variables, etc.)
3. **File Organisation** — directory tree with brief descriptions
4. **Type Safety** — key TypeScript rules as a table

**Maintainer Depth (use `<details>` tags)**:

5. `<details>` **Service Patterns Rationale** — why services are structured this way, what to avoid
6. `<details>` **Error Handling Rationale** — error hierarchy, propagation strategy, and why
7. `<details>` **Validation Patterns** — where validation occurs, why at these boundaries
8. `<details>` **Security Assertions** — security requirements table with threat context
9. `<details>` **Performance Standards** — thresholds with benchmark rationale
10. `<details>` **Logging Standards** — what to log, log levels, PII rules, and why
11. `<details>` **Linting Configuration** — ESLint rules with justifications for non-obvious choices

**Conditional (only if project-specific content exists)**:

12. **Related Documentation** — cross-references

### Step 7: Return Metadata

After writing all files, output JSON with metadata only (no content).

## Output Format

**After writing all files with the `write` tool**, return this JSON:

```json
{
	"architecture_document": {
		"id": "BE-ARCH",
		"filename": "ARCHITECTURE.md",
		"target_path": "knowledge-base/backend/ARCHITECTURE.md",
		"written": true,
		"consumer_sections": 4,
		"maintainer_sections": 4,
		"diagrams_included": ["Component Diagram"],
		"details_tags_present": true,
		"completeness_score": 0.95
	},
	"api_document": {
		"id": "BE-API",
		"filename": "API.md",
		"target_path": "knowledge-base/backend/API.md",
		"written": true,
		"consumer_sections": 5,
		"maintainer_sections": 3,
		"diagrams_included": ["Sequence Diagram"],
		"details_tags_present": true,
		"completeness_score": 0.93
	},
	"data_document": {
		"id": "BE-DATA",
		"filename": "DATA.md",
		"target_path": "knowledge-base/backend/DATA.md",
		"written": true,
		"consumer_sections": 4,
		"maintainer_sections": 4,
		"diagrams_included": ["ERD"],
		"details_tags_present": true,
		"completeness_score": 0.92
	},
	"testing_document": {
		"id": "BE-TESTING",
		"filename": "TESTING.md",
		"target_path": "knowledge-base/backend/TESTING.md",
		"written": true,
		"consumer_sections": 3,
		"maintainer_sections": 5,
		"diagrams_included": ["Test Pyramid"],
		"details_tags_present": true,
		"completeness_score": 0.9
	},
	"coding_assertions_document": {
		"id": "BE-CODING",
		"filename": "CODING-ASSERTIONS.md",
		"target_path": "knowledge-base/backend/CODING-ASSERTIONS.md",
		"written": true,
		"consumer_sections": 4,
		"maintainer_sections": 7,
		"diagrams_included": [],
		"details_tags_present": true,
		"completeness_score": 0.94
	},
	"generation_summary": {
		"documents_generated": 5,
		"total_diagrams": 5,
		"files_written": [
			"knowledge-base/backend/ARCHITECTURE.md",
			"knowledge-base/backend/API.md",
			"knowledge-base/backend/DATA.md",
			"knowledge-base/backend/TESTING.md",
			"knowledge-base/backend/CODING-ASSERTIONS.md"
		],
		"average_completeness": 0.928,
		"issues": []
	}
}
```

## Success Criteria

- ✅ All 5 files written using `write` tool
- ✅ Each document includes standardised header with Audience field
- ✅ Consumer surface leads each document and is scannable without expanding anything
- ✅ Maintainer depth sections use `<details><summary>` tags
- ✅ No empty or generic boilerplate sections — omit rather than pad
- ✅ Mermaid diagrams render correctly
- ✅ British English used consistently
- ✅ Cross-references use correct relative paths

## Error Handling

### Write Tool Failure

**Issue**: Cannot write file to disk

**Action**:

1. Report error in output JSON
2. Set `written: false` for affected document
3. Continue with remaining documents

### Missing Context

**Issue**: Insufficient context for section

**Action**:

1. Generate placeholder with TODO marker
2. Note in issues array
3. Reduce completeness score

## REMINDER: Write Files First

**Use the `write` tool to create each file, then return metadata JSON. DO NOT include file content in the JSON response.**
