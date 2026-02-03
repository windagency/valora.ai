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

## Objective

Generate 5 comprehensive backend documentation files by **writing them directly to disk** using the `write` tool. Apply British English for prose and include Mermaid diagrams as specified.

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

Use `list_dir` to check if `knowledge-base/backend/` exists.

### Step 2: Generate and Write ARCHITECTURE.md

Use the `write` tool to create `knowledge-base/backend/ARCHITECTURE.md` with:

**Required sections**:

1. **Purpose** - Document scope
2. **Architecture Overview** - High-level backend design
3. **Component Diagram** (Mermaid flowchart)
4. **Service Design** - Service boundaries and responsibilities
5. **Dependency Graph** - Module dependencies
6. **Layer Architecture** - Layering patterns
7. **Design Patterns** - Patterns used
8. **Error Handling** - Error handling strategy
9. **Middleware** - Middleware chain
10. **Troubleshooting** - Common issues
11. **Best Practices** - Architecture best practices
12. **Related Documentation** - Cross-references
13. **Changelog** - Version history

### Step 3: Generate and Write API.md

Use the `write` tool to create `knowledge-base/backend/API.md` with:

**Required sections**:

1. **Purpose** - API overview
2. **API Overview** - REST/GraphQL design
3. **Authentication** - Auth mechanisms
4. **Base URL and Versioning** - API versioning
5. **Endpoints by Resource** - Endpoint documentation
6. **Request/Response Examples** - Sample payloads
7. **Error Codes** - Error response formats
8. **Rate Limiting** - Rate limit policies
9. **Sequence Diagrams** (Mermaid sequenceDiagram)
10. **Troubleshooting** - API issues
11. **Best Practices** - API best practices
12. **Related Documentation** - Cross-references
13. **Changelog** - Version history

### Step 4: Generate and Write DATA.md

Use the `write` tool to create `knowledge-base/backend/DATA.md` with:

**Required sections**:

1. **Purpose** - Data architecture overview
2. **Data Model Overview** - High-level data design
3. **Entity Relationship Diagram** (Mermaid erDiagram)
4. **Entity Definitions** - Entity details
5. **Relationships** - Entity relationships
6. **Indexing Strategy** - Database indexes
7. **Migrations** - Migration workflow
8. **Data Validation** - Validation rules
9. **Caching Strategy** - Cache layers
10. **Troubleshooting** - Data issues
11. **Best Practices** - Data best practices
12. **Related Documentation** - Cross-references
13. **Changelog** - Version history

### Step 5: Generate and Write TESTING.md

Use the `write` tool to create `knowledge-base/backend/TESTING.md` with:

**Required sections**:

1. **Purpose** - Testing strategy overview
2. **Testing Approach** - Overall philosophy
3. **Test Pyramid** (Mermaid diagram)
4. **Unit Testing** - Service unit tests
5. **Integration Testing** - API integration tests
6. **E2E Testing** - Full flow tests
7. **Test Data Management** - Fixtures and mocks
8. **Coverage Requirements** - Thresholds
9. **CI Integration** - Test automation
10. **Troubleshooting** - Test issues
11. **Best Practices** - Testing best practices
12. **Related Documentation** - Cross-references
13. **Changelog** - Version history

### Step 6: Generate and Write CODING-ASSERTIONS.md

Use the `write` tool to create `knowledge-base/backend/CODING-ASSERTIONS.md` with:

**Required sections**:

1. **Purpose** - Standards overview
2. **Naming Conventions** - Naming rules
3. **File Organisation** - Structure standards
4. **Service Patterns** - Service structure
5. **Error Handling Rules** - Error patterns
6. **Validation Patterns** - Input validation
7. **Security Assertions** - Security requirements table
8. **Performance Standards** - Performance requirements
9. **Type Safety** - TypeScript standards
10. **Logging Standards** - Logging patterns
11. **Documentation Standards** - Code docs
12. **Linting Configuration** - ESLint setup
13. **Troubleshooting** - Standards enforcement
14. **Best Practices** - Coding best practices
15. **Related Documentation** - Cross-references
16. **Changelog** - Version history

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
    "sections_count": 13,
    "diagrams_included": ["Component Diagram", "Dependency Graph"],
    "completeness_score": 0.95
  },
  "api_document": {
    "id": "BE-API",
    "filename": "API.md",
    "target_path": "knowledge-base/backend/API.md",
    "written": true,
    "sections_count": 13,
    "diagrams_included": ["Sequence Diagram"],
    "completeness_score": 0.93
  },
  "data_document": {
    "id": "BE-DATA",
    "filename": "DATA.md",
    "target_path": "knowledge-base/backend/DATA.md",
    "written": true,
    "sections_count": 13,
    "diagrams_included": ["ERD"],
    "completeness_score": 0.92
  },
  "testing_document": {
    "id": "BE-TESTING",
    "filename": "TESTING.md",
    "target_path": "knowledge-base/backend/TESTING.md",
    "written": true,
    "sections_count": 13,
    "diagrams_included": ["Test Pyramid"],
    "completeness_score": 0.90
  },
  "coding_assertions_document": {
    "id": "BE-CODING",
    "filename": "CODING-ASSERTIONS.md",
    "target_path": "knowledge-base/backend/CODING-ASSERTIONS.md",
    "written": true,
    "sections_count": 16,
    "diagrams_included": [],
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
