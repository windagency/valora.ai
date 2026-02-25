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

## Objective

Generate 4 comprehensive frontend documentation files by **writing them directly to disk** using the `write` tool. Apply British English for prose and include Mermaid diagrams as specified.

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

| Attribute | Value |
|-----------|-------|
| **Purpose** | [Brief purpose description] |
| **Version** | 1.0.0 |
| **Author** | AI Documentation Generator |
| **Created** | [YYYY-MM-DD] |
| **Last Updated** | [YYYY-MM-DD] |
| **Status** | Draft |

---
```

## Instructions

### Step 1: Create Output Directory

Use `list_dir` to check if `knowledge-base/frontend/` exists. If not, it will be created when writing files.

### Step 2: Generate and Write ARCHITECTURE.md

Use the `write` tool to create `knowledge-base/frontend/ARCHITECTURE.md` with:

**Required sections**:

1. **Purpose** - Document scope and intended audience
2. **Architecture Overview** - High-level frontend design
3. **Component Hierarchy Diagram** (Mermaid flowchart)
4. **Application Structure** - Folder and file organisation
5. **State Management** - State architecture and patterns
6. **Routing Structure** - Route definitions (with Mermaid diagram)
7. **Data Fetching** - API integration patterns
8. **Error Boundaries** - Error handling strategy
9. **Performance Optimisation** - Performance patterns
10. **Troubleshooting** - Common issues and resolutions
11. **Best Practices** - Architecture best practices
12. **Related Documentation** - Cross-references
13. **Changelog** - Version history table

### Step 3: Generate and Write DESIGN.md

Use the `write` tool to create `knowledge-base/frontend/DESIGN.md` with:

**Required sections**:

1. **Purpose** - Design system overview
2. **Design Principles** - Core design philosophy
3. **Design Tokens** - Colours, typography, spacing
4. **Colour Palette** - Colour definitions table
5. **Typography** - Font styles table
6. **Spacing System** - Spacing scale table
7. **Component Library** - UI component catalogue
8. **Icons** - Icon system
9. **Layout Patterns** - Common layouts
10. **Responsive Design** - Breakpoints
11. **Accessibility** - A11y guidelines
12. **Troubleshooting** - Design issues
13. **Best Practices** - Design best practices
14. **Related Documentation** - Cross-references
15. **Changelog** - Version history table

### Step 4: Generate and Write TESTING.md

Use the `write` tool to create `knowledge-base/frontend/TESTING.md` with:

**Required sections**:

1. **Purpose** - Testing strategy overview
2. **Testing Approach** - Overall philosophy
3. **Test Pyramid** (Mermaid diagram)
4. **Unit Testing** - Component unit tests
5. **Integration Testing** - Component integration
6. **E2E Testing** - End-to-end scenarios
7. **Visual Regression** - Visual testing
8. **Accessibility Testing** - A11y automation
9. **Test Data Management** - Mocks and fixtures
10. **Coverage Requirements** - Thresholds
11. **CI Integration** - Automation
12. **Troubleshooting** - Test issues
13. **Best Practices** - Testing best practices
14. **Related Documentation** - Cross-references
15. **Changelog** - Version history table

### Step 5: Generate and Write CODING-ASSERTIONS.md

Use the `write` tool to create `knowledge-base/frontend/CODING-ASSERTIONS.md` with:

**Required sections**:

1. **Purpose** - Standards overview
2. **Naming Conventions** - Naming rules
3. **File Organisation** - Structure standards
4. **Component Patterns** - Component structure
5. **State Management Rules** - State patterns
6. **Styling Standards** - CSS conventions
7. **Accessibility Requirements** - A11y requirements table
8. **Performance Standards** - Performance requirements
9. **Type Safety** - TypeScript standards
10. **Error Handling** - Error patterns
11. **Documentation Standards** - Component docs
12. **Linting Configuration** - ESLint/Prettier
13. **Troubleshooting** - Standards enforcement
14. **Best Practices** - Coding best practices
15. **Related Documentation** - Cross-references
16. **Changelog** - Version history table

### Step 6: Return Metadata

After writing all files, output JSON with metadata only (no content).

## Cross-Reference Format

Include in each document:

```markdown
## Related Documentation

| Document | Relationship | Description |
|----------|--------------|-------------|
| [DESIGN.md](./DESIGN.md) | Related | Design system |
| [TESTING.md](./TESTING.md) | Related | Testing strategies |
| [Backend API.md](../backend/API.md) | See Also | API integration |
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
- ✅ Each document includes standardised header
- ✅ All required sections present
- ✅ Mermaid diagrams render correctly
- ✅ British English used consistently
- ✅ Cross-references use correct relative paths
- ✅ Completeness score >= 85% for each document

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
