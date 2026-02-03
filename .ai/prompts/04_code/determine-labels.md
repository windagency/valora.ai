---
id: code.determine-labels
version: 1.0.0
category: code
experimental: true
name: Determine Labels
description: Automatically determine appropriate labels for pull request based on changes
tags:
  - labels
  - categorization
  - automation
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.analyze-commits-for-pr
    - context.analyze-codebase-changes
inputs:
  - name: labels_arg
    description: User-specified labels
    type: string
    required: false
  - name: change_types
    description: Types of changes
    type: object
    required: true
  - name: impact_areas
    description: Functional areas impacted
    type: object
    required: true
  - name: breaking_changes
    description: Breaking changes detected
    type: array
    required: true
  - name: complexity_metrics
    description: Change complexity
    type: object
    required: true
outputs:
  - labels_list
  - label_rationale
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Determine Labels

## Objective

Automatically determine appropriate GitHub labels for the pull request based on change analysis.

## Instructions

### Step 1: Check for Manual Labels

If `labels_arg` is provided:

- Parse comma-separated labels
- Return as-is with minimal rationale
- Skip auto-detection logic

**Example**: `--labels=feature,backend` → `["feature", "backend"]`

### Step 2: Detect Available Labels

Query repository for available labels:

```bash
gh label list --json name,description
```

**Extract**:

- Label names
- Label descriptions
- Common label patterns

**Common label patterns**:

- Change type: `feature`, `bug`, `enhancement`, `refactor`, `chore`
- Areas: `backend`, `frontend`, `api`, `database`, `infrastructure`
- Priority: `critical`, `high`, `medium`, `low`, `p0`, `p1`, `p2`
- Status: `needs-review`, `work-in-progress`, `ready`, `blocked`
- Special: `breaking-change`, `security`, `performance`, `documentation`

### Step 3: Determine Change Type Labels

From `change_types.primary`, map to labels:

**Mapping**:

| Commit Type | Label |
|------------|-------|
| `feat` | `feature` or `enhancement` |
| `fix` | `bug` or `bugfix` |
| `refactor` | `refactor` or `technical-debt` |
| `chore` | `chore` or `maintenance` |
| `docs` | `documentation` |
| `test` | `testing` |
| `perf` | `performance` |
| `style` | `styling` |
| `ci` | `ci-cd` |
| `build` | `build` |
| `security` | `security` |

**Select most appropriate** label that exists in repository.

### Step 4: Determine Area Labels

From `impact_areas.primary` and `impact_areas.secondary`:

**Common area labels**:

- `backend` - Backend services, APIs
- `frontend` - UI, client code
- `api` - API endpoints
- `database` - Schema, migrations
- `infrastructure` - DevOps, cloud
- `authentication` or `auth` - Auth/security
- `docs` - Documentation
- `tests` - Testing

**Select**:

- Primary area (always)
- Secondary areas (if significant changes, e.g., >20% of total)

### Step 5: Determine Priority Labels

Based on `complexity_metrics` and change nature:

**Priority mapping**:

| Criteria | Priority |
|----------|----------|
| Breaking changes present | `critical` or `p0` |
| Security-sensitive | `high` or `p1` |
| High complexity (score >85) | `high` or `p1` |
| Medium complexity (61-85) | `medium` or `p2` |
| Low complexity (<60) | `low` or `p3` |
| Bug fix | `high` or `p1` |
| Feature | `medium` or `p2` |
| Chore/refactor | `low` or `p3` |

**Select one** priority label (if available in repository).

### Step 6: Determine Special Labels

Check for special conditions:

#### Breaking Change

If `breaking_changes` is not empty:

- Add `breaking-change` or `breaking` label
- High priority

#### Security

If `impact_areas` includes `authentication` or `security`:

- Add `security` label
- Consider `needs-security-review`

#### Performance

If `change_types` includes `perf`:

- Add `performance` label
- Consider `needs-benchmarking`

#### Dependencies

If dependency files changed:

- Add `dependencies` or `deps` label

#### Large PR

If `complexity_metrics.files_changed` > 20 or `lines_added` > 500:

- Add `large-pr` or `needs-splitting` label

#### Documentation

If only documentation files changed:

- Add `documentation` label
- Remove technical labels

#### WIP/Draft

If PR is marked as draft (from command args):

- Add `work-in-progress` or `wip` label

### Step 7: Filter and Validate Labels

**Filter**:

1. Check each label exists in repository
2. Remove duplicates
3. Limit to 5-7 labels max (avoid label spam)
4. Prioritize important labels

**Priority order** (keep if need to limit):

1. Breaking change / Security (critical)
2. Change type (feature, bug, refactor)
3. Primary area (backend, frontend)
4. Priority (p0, p1, p2)
5. Status (needs-review, wip)
6. Secondary areas / Special labels

### Step 8: Generate Rationale

For each label, provide reasoning:

**Example rationales**:

- `feature`: "Primary change type (3 feat commits)"
- `backend`: "Main impact area (8 files, 234 lines)"
- `breaking-change`: "Detected breaking changes in /auth/login API"
- `security`: "Changes to authentication module"
- `p1`: "High priority (security-sensitive changes)"
- `needs-review`: "Ready for review"

## Output Format

```json
{
  "labels_list": ["feature", "backend", "security", "breaking-change", "needs-review"],
  "label_rationale": {
    "feature": {
      "reason": "Primary change type (3 feat commits)",
      "confidence": "high",
      "priority": 1
    },
    "backend": {
      "reason": "Main impact area (8 files, 234 lines)",
      "confidence": "high",
      "priority": 2
    },
    "security": {
      "reason": "Changes to authentication module",
      "confidence": "high",
      "priority": 1
    },
    "breaking-change": {
      "reason": "Detected breaking changes in /auth/login API",
      "confidence": "high",
      "priority": 1
    },
    "needs-review": {
      "reason": "PR ready for review",
      "confidence": "high",
      "priority": 3
    }
  },
  "labels_available": true,
  "labels_not_found": [],
  "recommendations": [
    "Consider adding 'high' priority label for security changes"
  ]
}
```

## Success Criteria

- ✅ 3-7 labels selected (optimal range)
- ✅ All labels exist in repository
- ✅ No duplicate labels
- ✅ Rationale provided for each
- ✅ Critical labels prioritized

## Special Cases

### Repository Has No Labels

**Fallback**:

- Return empty list
- Suggest creating standard label set
- Provide recommended labels

### Only Custom Labels

**If** repository has non-standard labels:

- Attempt fuzzy matching
- Use label descriptions to map
- Fall back to manual assignment

### Conflicting Labels

**Example**: Both `bug` and `feature` detected

**Resolution**:

- Use primary change type (most frequent)
- Or select based on priority (bug > feature for urgency)

### Too Many Labels

**If** auto-detection suggests >7 labels:

- Apply priority filtering
- Keep critical/breaking/security
- Keep change type + primary area
- Drop secondary areas
- Drop low-priority labels

## Examples

### Example 1: Feature Addition

**Input**:

```json
{
  "change_types": {"primary": "feat"},
  "impact_areas": {"primary": ["backend"]},
  "breaking_changes": [],
  "complexity_metrics": {"complexity_score": 55}
}
```

**Output**:

```json
{
  "labels_list": ["feature", "backend", "medium"],
  "label_rationale": {
    "feature": {"reason": "Primary change type (feat)"},
    "backend": {"reason": "Main impact area"},
    "medium": {"reason": "Medium complexity (score: 55)"}
  }
}
```

---

### Example 2: Breaking Bug Fix

**Input**:

```json
{
  "change_types": {"primary": "fix"},
  "impact_areas": {"primary": ["api"]},
  "breaking_changes": [{"description": "Changed API signature"}],
  "complexity_metrics": {"complexity_score": 45}
}
```

**Output**:

```json
{
  "labels_list": ["bug", "api", "breaking-change", "critical"],
  "label_rationale": {
    "bug": {"reason": "Primary change type (fix)"},
    "api": {"reason": "Main impact area"},
    "breaking-change": {"reason": "Detected API signature change"},
    "critical": {"reason": "Breaking change requires immediate attention"}
  }
}
```

## Notes

- Labels improve discoverability and organization
- Help with automated workflows (e.g., release notes)
- Enable filtering and reporting
- Should be consistent across repository

