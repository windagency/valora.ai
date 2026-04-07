---
id: documentation.generate-frontend-docs
version: 1.0.0
category: documentation
experimental: true
name: Generate Frontend Documentation
description: Generate 4 frontend documentation files (ARCHITECTURE, DESIGN, TESTING, CODING-ASSERTIONS)
tags:
  - documentation
  - frontend
  - react
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - software-engineer-typescript-frontend
dependencies:
  requires:
    - onboard.analyze-documentation-requirements
    - context.use-modern-cli-tools
inputs:
  - name: documentation_plan
    description: Full documentation plan object (extract frontend domain)
    type: object
    required: true
  - name: diagram_requirements
    description: Full diagram requirements object (extract frontend domain)
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
    description: Domain to generate (always 'frontend' for this prompt)
    type: string
    required: true
outputs:
  - architecture_document
  - design_document
  - testing_document
  - coding_assertions_document
tokens:
  avg: 20000
  max: 40000
  min: 12000
---

# Generate Frontend Documentation

## Documentation Philosophy — MANDATORY

Every document has two audiences. Confusing them makes documentation useless to both.

1. **Consumers** scan like a menu: find the component, see its props, copy the example, move on. They will not read a wall of text.
2. **Maintainers** need the full picture: why state is structured this way, why this design pattern, the trade-offs. They refactor at risk.

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

Generate 4 comprehensive audience-layered frontend documentation files by **writing them directly to disk** using the `write` tool. Apply British English for prose and include Mermaid diagrams as specified.

## CRITICAL: Write Files Directly

**DO NOT return document content in JSON.** Instead:

1. Use the `write` tool to write each document file directly
2. Return only metadata about what was written

This prevents JSON truncation issues with large documents.

## Input Processing

**Extract your domain-specific data from the full input objects:**

- `plan = documentation_plan.frontend` (or `documentation_plan[target_domain]`)
- `diagrams = diagram_requirements.frontend` (or `diagram_requirements[target_domain]`)

If the frontend domain is not present or `plan.enabled` is false, output an empty result with all documents set to `null`.

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

Use `list_dir` to check if `knowledge-base/frontend/` exists. If not, it will be created when writing files.

### Step 2: Generate and Write ARCHITECTURE.md

Use the `write` tool to create `knowledge-base/frontend/ARCHITECTURE.md` with:

**Consumer Surface (always present — leads the document)**:

1. **Purpose** — one sentence
2. **Architecture Overview** — 2-3 sentences + Component Hierarchy Diagram (Mermaid flowchart)
3. **Application Structure** — directory tree with one-line descriptions
4. **Routing Structure** — route definitions table: `Route | Component | Auth Required | Notes`

**Maintainer Depth (use `<details>` tags)**:

5. `<details>` **State Management Architecture** — why state is structured this way, alternatives rejected, data flow diagram
6. `<details>` **Data Fetching Strategy** — API integration pattern rationale, caching decisions, error handling approach
7. `<details>` **Error Boundaries** — where they're placed and why, recovery behaviour
8. `<details>` **Performance Optimisation Decisions** — code splitting, lazy loading rationale, bundle size trade-offs

**Conditional (only if project-specific content exists)**:

9. **Related Documentation** — cross-references

### Step 3: Generate and Write DESIGN.md

Use the `write` tool to create `knowledge-base/frontend/DESIGN.md` with:

**Consumer Surface (always present — leads the document)**:

1. **Design Principles** — 3-5 core principles, one sentence each
2. **Design Tokens** — three tables: Colour Palette (`Name | Hex | Usage`), Typography (`Token | Size | Weight | Usage`), Spacing Scale (`Token | Value | Usage`)
3. **Component Library** — catalogue of UI components with props tables and usage examples
4. **Icons** — icon system reference: how to import and use

**Maintainer Depth (use `<details>` tags)**:

5. `<details>` **Design Decision Rationale** — why specific design choices were made, brand constraints, trade-offs
6. `<details>` **Accessibility Implementation** — ARIA patterns, keyboard navigation, focus management strategy, and why
7. `<details>` **Responsive Design** — breakpoint rationale, layout strategy at each breakpoint, known limitations

**Conditional (only if project-specific content exists)**:

8. **Related Documentation** — cross-references

### Step 4: Generate and Write TESTING.md

Use the `write` tool to create `knowledge-base/frontend/TESTING.md` with:

**Consumer Surface (always present — leads the document)**:

1. **Testing Approach** — philosophy in 2-3 sentences + Test Pyramid diagram (Mermaid)
2. **How to Run Tests** — copy-paste commands for each test type
3. **Coverage Requirements** — table of thresholds: `Layer | Minimum Coverage | Tool`

**Maintainer Depth (use `<details>` tags)**:

4. `<details>` **Component Testing Patterns** — what to test, what to mock, testing library choices and why
5. `<details>` **Integration Testing Architecture** — how components are tested with real API calls, MSW setup
6. `<details>` **E2E Testing Infrastructure** — Playwright/Cypress setup, test data, known flakiness
7. `<details>` **Visual Regression Strategy** — tooling, snapshot management, review process
8. `<details>` **Accessibility Testing Automation** — axe-core integration, what's automated vs. manual
9. `<details>` **CI Integration** — pipeline configuration, parallelisation, test splitting strategy

**Conditional (only if project-specific content exists)**:

10. **Related Documentation** — cross-references

### Step 5: Generate and Write CODING-ASSERTIONS.md

Use the `write` tool to create `knowledge-base/frontend/CODING-ASSERTIONS.md` with:

**Consumer Surface (always present — leads the document)**:

1. **Quick Reference** — scannable rules table: `Category | Rule | Enforcement`
2. **Naming Conventions** — table by construct (components, hooks, files, CSS modules, etc.)
3. **File Organisation** — directory tree with brief descriptions
4. **Type Safety** — key TypeScript rules as a table

**Maintainer Depth (use `<details>` tags)**:

5. `<details>` **Component Patterns Rationale** — why composition over inheritance, when to lift state, what to avoid
6. `<details>` **State Management Rules** — what goes in global vs. local state, and why
7. `<details>` **Styling Standards Rationale** — CSS Modules vs. Tailwind choice, naming strategy, why
8. `<details>` **Accessibility Requirements** — WCAG level, specific requirements table with threat context
9. `<details>` **Performance Standards** — Core Web Vitals targets, bundle size limits, and benchmark rationale
10. `<details>` **Linting Configuration** — ESLint/Prettier rules with justifications for non-obvious choices

**Conditional (only if project-specific content exists)**:

11. **Related Documentation** — cross-references

### Step 6: Return Metadata

After writing all files, output JSON with metadata only (no content).

## Cross-Reference Format

Include in each document:

```markdown
## Related Documentation

| Document                            | Relationship | Description        |
| ----------------------------------- | ------------ | ------------------ |
| [DESIGN.md](./DESIGN.md)            | Related      | Design system      |
| [TESTING.md](./TESTING.md)          | Related      | Testing strategies |
| [Backend API.md](../backend/API.md) | See Also     | API integration    |
```

## Output Format

**After writing all files with the `write` tool**, return this JSON:

```json
{
	"architecture_document": {
		"id": "FE-ARCH",
		"filename": "ARCHITECTURE.md",
		"target_path": "knowledge-base/frontend/ARCHITECTURE.md",
		"written": true,
		"sections_count": 13,
		"diagrams_included": ["Component Hierarchy", "State Flow", "Route Structure"],
		"completeness_score": 0.95
	},
	"design_document": {
		"id": "FE-DESIGN",
		"filename": "DESIGN.md",
		"target_path": "knowledge-base/frontend/DESIGN.md",
		"written": true,
		"sections_count": 15,
		"diagrams_included": [],
		"completeness_score": 0.93
	},
	"testing_document": {
		"id": "FE-TESTING",
		"filename": "TESTING.md",
		"target_path": "knowledge-base/frontend/TESTING.md",
		"written": true,
		"sections_count": 15,
		"diagrams_included": ["Test Pyramid"],
		"completeness_score": 0.92
	},
	"coding_assertions_document": {
		"id": "FE-CODING",
		"filename": "CODING-ASSERTIONS.md",
		"target_path": "knowledge-base/frontend/CODING-ASSERTIONS.md",
		"written": true,
		"sections_count": 16,
		"diagrams_included": [],
		"completeness_score": 0.94
	},
	"generation_summary": {
		"documents_generated": 4,
		"total_diagrams": 4,
		"files_written": [
			"knowledge-base/frontend/ARCHITECTURE.md",
			"knowledge-base/frontend/DESIGN.md",
			"knowledge-base/frontend/TESTING.md",
			"knowledge-base/frontend/CODING-ASSERTIONS.md"
		],
		"average_completeness": 0.935,
		"issues": []
	}
}
```

## Success Criteria

- ✅ All 4 files written using `write` tool
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
