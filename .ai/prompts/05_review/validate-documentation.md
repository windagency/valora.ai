---
id: review.validate-documentation
version: 1.0.0
category: review
experimental: true
name: Validate Documentation
description: Validate completeness, quality, and cross-references of generated documentation
tags:
  - documentation
  - validation
  - review
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - lead
dependencies:
  requires:
    - context.use-modern-cli-tools
    - documentation.generate-infrastructure-docs
    - documentation.generate-backend-docs
    - documentation.generate-frontend-docs
inputs:
  - name: infrastructure_docs
    description: Generated infrastructure documentation (may be null/empty if domain disabled)
    type: object
    required: false
  - name: backend_docs
    description: Generated backend documentation (may be null/empty if domain disabled)
    type: object
    required: false
  - name: frontend_docs
    description: Generated frontend documentation (may be null/empty if domain disabled)
    type: object
    required: false
  - name: documentation_plan
    description: Original documentation plan
    type: object
    required: true
  - name: cross_references
    description: Cross-reference mappings
    type: object
    required: true
  - name: domain_assignments
    description: Which domains were enabled for generation
    type: object
    required: true
outputs:
  - validation_results
  - completeness_score
  - quality_issues
  - cross_reference_status
tokens:
  avg: 6000
  max: 12000
  min: 3000
---

# Validate Documentation

## Objective

Validate generated documentation for completeness, quality, consistency, and cross-reference integrity. Determine if documentation meets the minimum 85% completeness threshold.

## Handling Disabled Domains

**Check `domain_assignments` to determine which domains were enabled:**

- If `domain_assignments.infrastructure` is `false` or missing, skip validation for `infrastructure_docs`
- If `domain_assignments.backend` is `false` or missing, skip validation for `backend_docs`
- If `domain_assignments.frontend` is `false` or missing, skip validation for `frontend_docs`

**Only validate domains that were enabled.** Calculate completeness score based on enabled domains only.

If a domain's docs input is `null`, `undefined`, or empty, and that domain was enabled, report it as a critical issue.

## CRITICAL: Output Format Requirement

**You MUST output ONLY valid JSON. Do NOT output markdown, do NOT wrap in code blocks, do NOT add any text before or after the JSON.**

Your response must be a single JSON object matching the schema defined in the "Output Format" section at the end of this prompt.

## Instructions

### Step 1: Validate Document Completeness

For each generated document, verify:

**Structural completeness**:

- [ ] Standardised header present with all required fields
- [ ] Purpose section at document start
- [ ] All required sections from plan present
- [ ] Troubleshooting section included
- [ ] Best practices section included
- [ ] Related documentation section with cross-references
- [ ] Changelog table at document end

**Content completeness**:

- [ ] Sections have substantive content (not just placeholders)
- [ ] Diagrams included where specified in plan
- [ ] Code examples where appropriate
- [ ] Tables properly formatted
- [ ] Lists properly structured

**Calculate section coverage**:

```
section_coverage = (present_sections / required_sections) * 100
```

### Step 2: Validate Diagram Quality

For each diagram in documents:

**Mermaid syntax validation**:

- [ ] Valid Mermaid diagram type (flowchart, sequenceDiagram, erDiagram, etc.)
- [ ] Proper node definitions
- [ ] Valid relationship syntax
- [ ] No syntax errors that would prevent rendering

**Diagram content validation**:

- [ ] Diagram matches section context
- [ ] Key elements included
- [ ] Labels are meaningful
- [ ] Complexity appropriate (not too simple or too complex)

**Diagram inventory**:

- Count diagrams per document
- Match against plan requirements
- Note missing diagrams

### Step 3: Validate Cross-References

For each cross-reference in documents:

**Path validation**:

- [ ] Target file exists in documentation set
- [ ] Relative path is correct
- [ ] No broken links to non-existent documents

**Reference accuracy**:

- [ ] Referenced document exists
- [ ] Relationship type is appropriate
- [ ] Description is accurate

**Cross-reference matrix**:

Build matrix of all document relationships:

```
Document A → Document B (relationship type)
```

### Step 4: Validate Language Standards

Check language consistency:

**British English in prose**:

- [ ] "colour" not "color"
- [ ] "behaviour" not "behavior"
- [ ] "organisation" not "organization"
- [ ] "utilise" not "utilize"
- [ ] "centre" not "center"

**American English in code**:

- [ ] Code snippets use American spelling
- [ ] Technical identifiers follow conventions

**Common spelling issues to check**:

| British (correct) | American (incorrect) |
|-------------------|---------------------|
| colour | color |
| behaviour | behavior |
| organisation | organization |
| utilise | utilize |
| analyse | analyze |
| centre | center |
| licence (noun) | license |
| practise (verb) | practice |
| favour | favor |
| honour | honor |

### Step 5: Validate Quality Standards

Check quality indicators:

**Readability**:

- [ ] Clear section headings
- [ ] Logical flow between sections
- [ ] Appropriate use of formatting
- [ ] Consistent tone throughout

**Technical accuracy**:

- [ ] Technical terms used correctly
- [ ] Code examples are syntactically valid
- [ ] Architecture patterns accurately described

**Consistency**:

- [ ] Consistent header format across documents
- [ ] Consistent table formatting
- [ ] Consistent code block formatting
- [ ] Consistent terminology

### Step 6: Calculate Completeness Score

**Scoring formula**:

```
completeness_score = (
  (section_coverage * 0.4) +
  (diagram_coverage * 0.2) +
  (cross_reference_validity * 0.2) +
  (quality_score * 0.2)
) / 100
```

**Thresholds**:

- **>= 95%**: Excellent - Ready for use
- **85-94%**: Good - Ready with minor gaps noted
- **70-84%**: Acceptable - Needs improvement before use
- **< 70%**: Insufficient - Requires regeneration

### Step 7: Compile Validation Report

Create detailed validation report:

**Summary**:

- Overall completeness score
- Pass/fail status (>= 85% = pass)
- Document count validated
- Issues by severity

**Per-document details**:

- Completeness percentage
- Missing sections
- Diagram status
- Quality issues

**Recommendations**:

- Priority fixes
- Optional improvements
- Enhancement suggestions

## Output Format

```json
{
  "validation_results": {
    "overall_status": "pass",
    "threshold_met": true,
    "documents_validated": 15,
    "documents_by_domain": {
      "infrastructure": 6,
      "backend": 5,
      "frontend": 4
    },
    "per_document": [
      {
        "id": "INFRA-HLD",
        "filename": "HLD.md",
        "domain": "infrastructure",
        "completeness_score": 0.95,
        "status": "pass",
        "sections_present": 12,
        "sections_required": 12,
        "diagrams_present": 2,
        "diagrams_required": 2,
        "has_header": true,
        "has_troubleshooting": true,
        "has_best_practices": true,
        "has_changelog": true,
        "has_cross_references": true,
        "issues": []
      }
    ]
  },
  "completeness_score": 0.92,
  "score_breakdown": {
    "section_coverage": 0.94,
    "diagram_coverage": 0.88,
    "cross_reference_validity": 0.95,
    "quality_score": 0.90
  },
  "quality_issues": {
    "critical": [],
    "high": [
      {
        "document": "BE-API",
        "section": "Endpoints by Resource",
        "issue": "Missing endpoint documentation for /users resource",
        "recommendation": "Add complete endpoint documentation"
      }
    ],
    "medium": [
      {
        "document": "FE-DESIGN",
        "section": "Colour Palette",
        "issue": "Incomplete colour definitions for secondary palette",
        "recommendation": "Add secondary colour definitions"
      }
    ],
    "low": [
      {
        "document": "INFRA-WORKFLOW",
        "section": "Best Practices",
        "issue": "Best practices section has only 2 items",
        "recommendation": "Expand with additional practices"
      }
    ]
  },
  "cross_reference_status": {
    "total_references": 24,
    "valid_references": 23,
    "broken_references": 1,
    "broken_details": [
      {
        "source_document": "FE-ARCH",
        "target_document": "BE-WEBSOCKET",
        "target_path": "../backend/WEBSOCKET.md",
        "issue": "Target document does not exist"
      }
    ],
    "reference_matrix": {
      "INFRA-HLD": ["INFRA-CONTAINER", "INFRA-DEPLOYMENT"],
      "BE-API": ["BE-ARCH", "BE-DATA"],
      "FE-ARCH": ["FE-DESIGN", "BE-API"]
    }
  },
  "language_validation": {
    "british_english_compliance": 0.98,
    "issues": [
      {
        "document": "BE-TESTING",
        "line_hint": "Performance testing section",
        "found": "behavior",
        "expected": "behaviour"
      }
    ]
  },
  "diagram_validation": {
    "total_diagrams": 12,
    "valid_diagrams": 11,
    "issues": [
      {
        "document": "BE-DATA",
        "diagram": "ERD",
        "issue": "Missing relationship label between User and Project"
      }
    ]
  },
  "recommendations": {
    "priority_fixes": [
      "Fix broken cross-reference in FE-ARCH to BE-WEBSOCKET",
      "Add missing endpoint documentation in BE-API"
    ],
    "optional_improvements": [
      "Expand colour palette in FE-DESIGN",
      "Add more best practices in INFRA-WORKFLOW"
    ],
    "enhancement_suggestions": [
      "Consider adding more sequence diagrams for complex flows",
      "Add more troubleshooting scenarios based on common issues"
    ]
  },
  "summary": {
    "status": "PASS",
    "message": "Documentation meets quality threshold (92% >= 85%)",
    "ready_for_persist": true,
    "warnings_count": 5,
    "critical_issues_count": 0
  }
}
```

## Success Criteria

- ✅ All generated documents validated
- ✅ Completeness score calculated
- ✅ Quality issues identified and categorised
- ✅ Cross-references validated
- ✅ Language standards checked
- ✅ Diagram syntax validated
- ✅ Clear pass/fail determination
- ✅ Actionable recommendations provided

## Decision Logic

**Proceed to persist stage**:

- Completeness score >= 85%
- No critical issues
- Cross-references mostly valid (allow minor issues)

**Fail validation**:

- Completeness score < 85%
- Any critical issues present
- Multiple documents below 70% completeness

**Pass with warnings**:

- Completeness score 85-94%
- Non-critical issues present
- Some cross-reference issues

## Error Handling

### Missing Documents

**Issue**: Expected document not provided

**Action**:

1. Exclude from validation
2. Note in summary
3. Adjust totals accordingly

### Malformed Content

**Issue**: Document content cannot be parsed

**Action**:

1. Mark document as failed
2. Record specific parsing error
3. Include in critical issues

## Notes

- This prompt focuses on VALIDATION only
- No content modification happens here
- Output determines if persist stage proceeds
- Quality issues feed back for improvement
- Cross-reference validation prevents broken links

## REMINDER: Output Requirements

**Output ONLY the JSON object. No markdown, no code blocks, no explanatory text. Start directly with `{` and end with `}`.**
