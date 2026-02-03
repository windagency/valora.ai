---
id: documentation.review-and-persist-parallel
version: 1.0.0
category: documentation
experimental: true
name: Review and Persist Documentation (Merged)
description: Merged review and persist stage for parallel documentation generation - saves 60s per workflow
tags:
  - documentation
  - review
  - persist
  - parallel
  - optimisation
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - documentation.generate-all-domains-parallel
inputs:
  - name: infrastructure_docs
    description: Infrastructure documentation metadata from generation stage
    type: object
    required: false
  - name: backend_docs
    description: Backend documentation metadata from generation stage
    type: object
    required: false
  - name: frontend_docs
    description: Frontend documentation metadata from generation stage
    type: object
    required: false
  - name: documentation_plan
    description: Documentation plan from context stage
    type: object
    required: true
  - name: cross_references
    description: Cross-reference mappings from context stage
    type: object
    required: true
  - name: domain_assignments
    description: Which domains were generated
    type: object
    required: true
  - name: output_dir
    description: Output directory (default: knowledge-base/)
    type: string
    required: false
  - name: project_metadata
    description: Project metadata from context stage
    type: object
    required: true
  - name: generation_metrics
    description: Metrics from generation stage
    type: object
    required: true
outputs:
  - validation_results
  - completeness_score
  - written_files
  - handoff_summary
  - time_saved
tokens:
  avg: 8000
  max: 15000
  min: 5000
---

# Review and Persist Documentation (Merged)

## Objective

Perform **merged validation and file persistence** in a single stage, reducing pipeline overhead by ~60 seconds. This prompt combines `review.validate-documentation` and `documentation.persist-documentation` with streaming operations.

## Optimisation Strategy

### Merged Operations

Instead of sequential execution:
```
review (90s) → persist (120s) = 210s
```

This prompt executes with streaming and parallel validation:
```
[validate + backup + finalise] = 150s
```

**Time saved**: ~60 seconds per workflow

---

## Instructions

### Phase 1: Parallel Validation (Concurrent)

Execute validation checks concurrently for all generated documents:

**1.1 Completeness Validation**

For each document, verify:
- [ ] All required sections present (per documentation_plan)
- [ ] Section content not empty
- [ ] Minimum word count per section (100 words)
- [ ] Document header present and formatted

**Scoring**:
```
completeness = (sections_present / sections_required) * 100
```

**1.2 Cross-Reference Validation**

For each cross-reference in cross_references:
- [ ] Target file exists
- [ ] Target section exists (if specified)
- [ ] Link syntax is correct

**Scoring**:
```
cross_ref_score = (valid_refs / total_refs) * 100
```

**1.3 Diagram Validation**

For each Mermaid diagram:
- [ ] Syntax is valid
- [ ] Diagram type matches requirement
- [ ] Diagram renders without errors

**Scoring**:
```
diagram_score = (valid_diagrams / total_diagrams) * 100
```

**1.4 Security Section Validation** (if security_context was provided)

For documents with security sections:
- [ ] Security section present
- [ ] Compliance frameworks addressed
- [ ] Controls documented
- [ ] Gaps identified

**Scoring**:
```
security_score = (security_items_present / security_items_required) * 100
```

### Phase 2: Backup Creation (Parallel with Validation)

While validation runs, create backups:

**For each existing document**:
1. Check if file exists at target path
2. If exists, create timestamped backup:
   - Format: `[FILENAME]-[YYYYMMDDHHmmss].md`
   - Location: Same directory as original
3. Record backup in written_files

**Example**:
```
knowledge-base/infrastructure/HLD.md
→ knowledge-base/infrastructure/HLD-20260128143022.md (backup)
```

### Phase 3: Final Verification

After parallel operations complete:

**3.1 Calculate Overall Scores**

```json
{
  "completeness_score": {
    "infrastructure": 94,
    "backend": 92,
    "frontend": 96,
    "overall": 94
  },
  "cross_reference_score": {
    "total_refs": 47,
    "valid_refs": 47,
    "score": 100
  },
  "diagram_score": {
    "total_diagrams": 13,
    "valid_diagrams": 13,
    "score": 100
  },
  "security_score": {
    "applicable": true,
    "score": 85
  }
}
```

**3.2 Determine Validation Status**

| Overall Score | Status | Action |
|---------------|--------|--------|
| >= 95% | PASS | Proceed to next step |
| 85-94% | WARN | Proceed with noted limitations |
| 70-84% | PARTIAL | Suggest targeted regeneration |
| < 70% | FAIL | Block, require regeneration |

**3.3 Generate Quality Issues List**

For any issues found, document:
- Document affected
- Issue type (missing section, broken link, invalid diagram)
- Severity (high, medium, low)
- Recommendation

### Phase 4: Generate Handoff Summary

Create comprehensive summary for user:

```markdown
## Documentation Generation Complete

**Overall Completeness**: [XX]%
**Validation Status**: [PASS/WARN/PARTIAL/FAIL]

### Time Metrics

| Stage | Duration | Saved |
|-------|----------|-------|
| Context + Analyze | [X]s | [Y]s |
| Generate All | [X]s | [Y]s |
| Review + Persist | [X]s | [Y]s |
| **Total** | **[X]s** | **[Y]s** |

### Files Generated

**Infrastructure** ([N] files)
[List of files with completeness]

**Backend** ([N] files)
[List of files with completeness]

**Frontend** ([N] files)
[List of files with completeness]

### Quality Summary

- Cross-references: [N]/[N] valid
- Diagrams: [N]/[N] valid
- Security sections: [Included/Not applicable]

### Issues Found

[List of any quality issues]

### Next Steps

[Recommendations based on validation status]
```

---

## Output Format

```json
{
  "validation_results": {
    "status": "PASS",
    "overall_score": 94,
    "completeness": {
      "infrastructure": {
        "score": 94,
        "documents": [
          {"file": "HLD.md", "score": 95, "issues": []},
          {"file": "CONTAINER.md", "score": 93, "issues": []},
          {"file": "DEPLOYMENT.md", "score": 94, "issues": []},
          {"file": "LOGGING.md", "score": 91, "issues": ["Missing metrics examples"]},
          {"file": "LZ.md", "score": 89, "issues": ["Compliance section needs expansion"]},
          {"file": "WORKFLOW.md", "score": 94, "issues": []}
        ]
      },
      "backend": {
        "score": 92,
        "documents": [
          {"file": "ARCHITECTURE.md", "score": 93, "issues": []},
          {"file": "API.md", "score": 91, "issues": []},
          {"file": "DATA.md", "score": 94, "issues": []},
          {"file": "TESTING.md", "score": 90, "issues": []},
          {"file": "CODING-ASSERTIONS.md", "score": 92, "issues": []}
        ]
      },
      "frontend": {
        "score": 96,
        "documents": [
          {"file": "ARCHITECTURE.md", "score": 96, "issues": []},
          {"file": "DESIGN.md", "score": 95, "issues": []},
          {"file": "TESTING.md", "score": 94, "issues": []},
          {"file": "CODING-ASSERTIONS.md", "score": 97, "issues": []}
        ]
      }
    },
    "cross_references": {
      "total": 47,
      "valid": 47,
      "broken": [],
      "score": 100
    },
    "diagrams": {
      "total": 13,
      "valid": 13,
      "invalid": [],
      "score": 100
    },
    "security": {
      "applicable": true,
      "controls_documented": 12,
      "frameworks_addressed": ["SOC2", "ISO27001"],
      "gaps": ["NFR-003 performance lacks implementation"],
      "score": 85
    },
    "quality_issues": [
      {
        "document": "LOGGING.md",
        "type": "incomplete_section",
        "severity": "low",
        "description": "Metrics examples section needs more content",
        "recommendation": "Add specific metric query examples"
      }
    ]
  },
  "completeness_score": 94,
  "written_files": {
    "documents": [
      "knowledge-base/infrastructure/HLD.md",
      "knowledge-base/infrastructure/CONTAINER.md",
      "knowledge-base/infrastructure/DEPLOYMENT.md",
      "knowledge-base/infrastructure/LOGGING.md",
      "knowledge-base/infrastructure/LZ.md",
      "knowledge-base/infrastructure/WORKFLOW.md",
      "knowledge-base/backend/ARCHITECTURE.md",
      "knowledge-base/backend/API.md",
      "knowledge-base/backend/DATA.md",
      "knowledge-base/backend/TESTING.md",
      "knowledge-base/backend/CODING-ASSERTIONS.md",
      "knowledge-base/frontend/ARCHITECTURE.md",
      "knowledge-base/frontend/DESIGN.md",
      "knowledge-base/frontend/TESTING.md",
      "knowledge-base/frontend/CODING-ASSERTIONS.md"
    ],
    "backups": [
      "knowledge-base/infrastructure/HLD-20260128143022.md"
    ],
    "total_documents": 15,
    "total_backups": 1
  },
  "handoff_summary": "## ✅ Parallel Documentation Generation Complete\n\n**Mode**: Full Parallel (3 subprocesses)\n**Duration**: 7.2 min\n**Time Saved**: 6.3 min vs sequential\n\n---\n\n### Generation Summary\n\n| Domain | Files | Completeness |\n|--------|-------|--------------|\n| Infrastructure | 6 | 94% |\n| Backend | 5 | 92% |\n| Frontend | 4 | 96% |\n| **Total** | **15** | **94%** |\n\n### Quality Summary\n\n- ✅ Cross-references: 47/47 valid\n- ✅ Diagrams: 13/13 valid\n- ✅ Security sections: Included\n\n### Next Step\n→ `/fetch-task` to begin implementation",
  "time_saved": {
    "context_analyze_saved_ms": 15000,
    "generation_saved_ms": 337000,
    "review_persist_saved_ms": 60000,
    "total_saved_ms": 412000,
    "total_saved_minutes": 6.87,
    "sequential_equivalent_ms": 855000,
    "actual_duration_ms": 443000
  }
}
```

---

## Success Criteria

- ✅ All documents validated for completeness
- ✅ Cross-references verified (>= 95% valid)
- ✅ Diagrams syntax validated
- ✅ Security sections checked (if applicable)
- ✅ Backups created for existing files
- ✅ Overall completeness >= 85%
- ✅ Handoff summary generated
- ✅ Time savings calculated and reported

---

## Error Handling

### Low Completeness Score

**Issue**: Overall score < 85%

**Action**:
1. Set status to PARTIAL or FAIL
2. List all quality issues
3. Recommend targeted regeneration
4. Still write files (partial is better than nothing)

### Broken Cross-References

**Issue**: Cross-references point to non-existent files

**Action**:
1. Log each broken reference
2. Suggest fixes in quality_issues
3. Continue with validation
4. Reduce cross_reference_score

### Backup Failure

**Issue**: Cannot create backup of existing file

**Action**:
1. Log error
2. Skip backup for that file
3. Proceed with new file write
4. Warn user in handoff

---

## Notes

**Merged stage benefits**:
- Single pass through all documents
- Parallel validation operations
- Streaming backup creation
- Unified error handling

**Validation thresholds**:
- PASS: >= 95% overall
- WARN: 85-94% overall
- PARTIAL: 70-84% overall
- FAIL: < 70% overall

**Time savings**:
- Eliminates stage transition overhead
- Parallel validation of documents
- Concurrent backup creation
- Single output aggregation

## REMINDER: Output Requirements

**Output ONLY the JSON object. No markdown, no code blocks, no explanatory text. Start directly with `{` and end with `}`.**
