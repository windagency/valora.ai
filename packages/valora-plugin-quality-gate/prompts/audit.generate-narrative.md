---
id: audit.generate-narrative
version: 1.0.0
category: audit
experimental: true
name: Generate Cross-Duplication Narrative
description: Transform the structured audit JSON into a prioritised refactoring narrative
tags:
  - audit
  - architecture
  - refactoring
inputs:
  - name: scan_json
    description: JSON string produced by the audit scan stage
    type: string
    required: true
  - name: total_violations
    description: Total violation count from summary
    type: number
    required: true
outputs:
  - narrative_markdown
  - report_path
---

Generate a prioritised refactoring narrative from the cross-duplication audit results.

## Instructions

If `total_violations` is `0`, output:

```
## Cross-Duplication Audit — {date}

No violations found. The project's sibling directories do not share duplicated concerns above the configured threshold.
```

Set `report_path` to empty string and stop.

---

Otherwise, parse `scan_json` and produce the following Markdown report. Follow these constraints exactly:

- Interface sketches must be ≤ 5 lines each.
- Suggested extraction path comes directly from `violation.suggestedExtractionPath` in the JSON — do not invent paths.
- Order violations by `affectedSiblings.length` descending (highest first).
- Order prioritised actions by `affectedSiblings.length` descending.

## Report format

```markdown
## Cross-Duplication Audit — {date}

### Executive summary

{2–3 sentences covering: total violation count, number of sibling groups affected, worst offender (highest N), and the primary concern category.}

### Violations

{For each violation in each sibling group, ordered by affectedSiblings.length descending:}

#### [{SEVERITY}] {concern} — {parentPath}/{affectedSiblings joined with commas}

**Pattern:** {describe what the topKeywords indicate, e.g. "try/catch + Error() repeated in N of M siblings"}
**Affected siblings:** {affectedSiblings.length} of {total siblings in group}
**Suggested extraction:** `{suggestedExtractionPath}`
**Interface sketch:**
{≤5 lines of TypeScript showing the extracted abstraction's public surface}

### Prioritised actions

{Numbered list ordered by affectedSiblings.length descending. Each action names the extraction, the suggested path, and the number of siblings it unblocks.}
```

## After generating the narrative

1. Write the Markdown to `.valora/reports/cross-duplication-{YYYY-MM-DD}.md` using `run_terminal_cmd` with `mkdir -p .valora/reports && cat > .valora/reports/cross-duplication-{date}.md`.
2. Set `report_path` to `.valora/reports/cross-duplication-{date}.md`.
3. Output the full narrative as `narrative_markdown`.
