---
id: documentation.persist-documentation
version: 1.0.0
category: documentation
experimental: true
name: Persist Documentation
description: Verify written documentation files and create handoff summary
tags:
  - documentation
  - file-writing
  - persistence
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - lead
dependencies:
  requires:
    - review.validate-documentation
    - context.use-modern-cli-tools
inputs:
  - name: infrastructure_docs
    description: Infrastructure generation metadata (files already written)
    type: object
    required: false
  - name: backend_docs
    description: Backend generation metadata (files already written)
    type: object
    required: false
  - name: frontend_docs
    description: Frontend generation metadata (files already written)
    type: object
    required: false
  - name: validation_results
    description: Validation results from review stage
    type: object
    required: true
  - name: completeness_score
    description: Overall completeness score
    type: number
    required: true
  - name: output_dir
    description: Output directory from --output-dir argument
    type: string
    required: false
  - name: project_metadata
    description: Project metadata from context stage
    type: object
    required: true
  - name: domain_assignments
    description: Which domains were enabled for generation
    type: object
    required: true
outputs:
  - written_files
  - backup_files
  - handoff_summary
tokens:
  avg: 4000
  max: 8000
  min: 2000
---

# Persist Documentation

## Objective

Verify that documentation files were written by the generation stages, collect metadata, and generate a comprehensive handoff summary for the user.

**NOTE**: Files are now written directly by the generation stages. This stage verifies they exist and creates the summary.

## Handling Disabled Domains

**Check `domain_assignments` to determine which domains were enabled:**

- If `domain_assignments.infrastructure` is `false`, skip verification for infrastructure
- If `domain_assignments.backend` is `false`, skip verification for backend
- If `domain_assignments.frontend` is `false`, skip verification for frontend

## CRITICAL: Output Format Requirement

**You MUST output ONLY valid JSON. Do NOT output markdown, do NOT wrap in code blocks, do NOT add any text before or after the JSON.**

## Instructions

### Step 1: Determine Output Directory

**Default directory**: `knowledge-base/`

**If `output_dir` provided**: Use specified directory

### Step 2: Verify Written Files

For each enabled domain, use `read_file` or `glob_file_search` to verify files exist:

**Infrastructure files** (if enabled):
- `knowledge-base/infrastructure/HLD.md`
- `knowledge-base/infrastructure/CONTAINER.md`
- `knowledge-base/infrastructure/DEPLOYMENT.md`
- `knowledge-base/infrastructure/LOGGING.md`
- `knowledge-base/infrastructure/LZ.md`
- `knowledge-base/infrastructure/WORKFLOW.md`

**Backend files** (if enabled):
- `knowledge-base/backend/ARCHITECTURE.md`
- `knowledge-base/backend/API.md`
- `knowledge-base/backend/DATA.md`
- `knowledge-base/backend/TESTING.md`
- `knowledge-base/backend/CODING-ASSERTIONS.md`

**Frontend files** (if enabled):
- `knowledge-base/frontend/ARCHITECTURE.md`
- `knowledge-base/frontend/DESIGN.md`
- `knowledge-base/frontend/TESTING.md`
- `knowledge-base/frontend/CODING-ASSERTIONS.md`

### Step 3: Collect Metadata from Generation Outputs

Extract metadata from the generation stage outputs:

- `infrastructure_docs.generation_summary.files_written`
- `backend_docs.generation_summary.files_written`
- `frontend_docs.generation_summary.files_written`

Compile list of all files written with their metadata.

### Step 4: Generate Handoff Summary

Create comprehensive handoff summary for display to user:

```markdown
# ✅ Technical Documentation Generated

**Output Directory**: `knowledge-base/`
**Completeness Score**: [XX%]
**Validation Status**: [Pass/Pass with Warnings]
**Documents Generated**: [XX]

---

## 📊 Generation Summary

| Domain | Documents | Status |
|--------|-----------|--------|
| Infrastructure | [X] | [✅/❌/⏭️ Skipped] |
| Backend | [X] | [✅/❌/⏭️ Skipped] |
| Frontend | [X] | [✅/❌/⏭️ Skipped] |
| **Total** | **[X]** | **[Status]** |

---

## 📁 Generated Files

[List files by domain with completeness scores]

---

## 🔍 Verification Steps

1. **Review diagrams**: Open files in VS Code with Mermaid preview
2. **Check cross-references**: Click links to verify navigation
3. **Review content**: Ensure accuracy for your project

---

## 🚀 Next Steps

✅ **Documentation is ready for use.**

**Recommended actions**:

1. Review generated documentation
2. Update any TODO placeholders
3. Proceed to `/fetch-task` for implementation
```

## Output Format

```json
{
  "written_files": [
    {
      "filename": "ARCHITECTURE.md",
      "path": "knowledge-base/frontend/ARCHITECTURE.md",
      "domain": "frontend",
      "verified": true,
      "completeness_score": 0.95
    }
  ],
  "backup_files": [],
  "handoff_summary": "[Complete handoff summary markdown]",
  "statistics": {
    "total_files_written": 4,
    "domains_enabled": {
      "infrastructure": false,
      "backend": false,
      "frontend": true
    },
    "average_completeness": 0.93
  },
  "status": {
    "success": true,
    "all_files_verified": true,
    "errors": [],
    "warnings": []
  }
}
```

## Success Criteria

- ✅ All expected files verified to exist
- ✅ Metadata collected from generation outputs
- ✅ Handoff summary generated
- ✅ Statistics compiled

## Error Handling

### File Not Found

**Issue**: Expected file does not exist

**Action**:

1. Report missing file in errors
2. Check if generation stage reported success
3. Include in warnings

### Metadata Missing

**Issue**: Generation metadata incomplete

**Action**:

1. Use file system to verify existence
2. Report partial metadata
3. Continue with available information

## REMINDER: Output Requirements

**Output ONLY the JSON object. No markdown, no code blocks, no explanatory text. Start directly with `{` and end with `}`.**
