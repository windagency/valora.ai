---
id: context.load-pr-template
version: 1.0.0
category: context
experimental: true
name: Load PR Template
description: Load and parse pull request template for structured description
tags:
  - pr-template
  - github
  - template-parsing
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.use-modern-cli-tools
inputs:
  - name: template_name
    description: Optional custom template name
    type: string
    required: false
outputs:
  - template_content
  - required_sections
  - checklist_items
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Load PR Template

## Objective

Load the pull request template from the repository and parse its structure for use in PR description generation.

## Instructions

### Step 1: Locate PR Template

Check these locations in order:

1. **Custom template** (if `template_name` provided):
   - `.github/PULL_REQUEST_TEMPLATE/<template_name>.md`
   - `docs/pull_request_templates/<template_name>.md`

2. **Default template**:
   - `.github/pull_request_template.md`
   - `.github/PULL_REQUEST_TEMPLATE.md`
   - `docs/pull_request_template.md`
   - `.gitlab/merge_request_templates/default.md` (GitLab)

3. **No template**: Return null, will generate standard format

### Step 2: Read Template Content

Use `read_file` tool to load the template.

**Handle**:

- Template not found → Return null
- Template is empty → Return null
- Template is valid → Continue parsing

### Step 3: Parse Template Sections

Identify sections in the template:

**Common sections**:

- `## Summary` or `## Description`
- `## Changes` or `## What changed?`
- `## Motivation` or `## Why?`
- `## Testing` or `## How to test?`
- `## Screenshots` or `## Visual changes`
- `## Breaking Changes`
- `## Related Issues` or `## Closes`
- `## Checklist`
- `## Additional Notes`

**Parse markers**:

- Headers: `##`, `###`
- Placeholders: `[description]`, `<add here>`, `<!-- comment -->`
- Checkboxes: `- [ ]`, `* [ ]`

### Step 4: Identify Required vs. Optional Sections

**Required sections** (must be filled):

- Usually marked with comments: `<!-- required -->`
- Or all-caps: `## DESCRIPTION (REQUIRED)`
- Or explicit in template text

**Optional sections**:

- Marked with `(optional)` or `(if applicable)`
- Or no special marker

### Step 5: Extract Checklist Items

Find checkbox lists:

```markdown
## Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Breaking changes documented
- [ ] Reviewed my own code
```

**Parse each item**:

- Text
- Checked/unchecked state (default unchecked)
- Required vs. optional

### Step 6: Extract Template Metadata

Look for special comments:

```markdown
<!-- PR Template v2.0 -->
<!-- Assignees: @alice, @bob -->
<!-- Labels: needs-review -->
```

## Output Format

```json
{
  "template_content": "## Summary\n\n[Brief description]\n\n## Changes\n\n- Change 1\n- Change 2\n\n...",
  "template_found": true,
  "template_path": ".github/pull_request_template.md",
  "required_sections": [
    {
      "title": "Summary",
      "level": 2,
      "placeholder": "[Brief description]",
      "required": true
    },
    {
      "title": "Changes",
      "level": 2,
      "placeholder": "- Change 1\n- Change 2",
      "required": true
    },
    {
      "title": "Testing",
      "level": 2,
      "placeholder": "[How was this tested?]",
      "required": false
    }
  ],
  "checklist_items": [
    {
      "text": "Tests added/updated",
      "checked": false,
      "required": true
    },
    {
      "text": "Documentation updated",
      "checked": false,
      "required": true
    },
    {
      "text": "Breaking changes documented",
      "checked": false,
      "required": false
    }
  ],
  "metadata": {
    "version": "2.0",
    "suggested_assignees": ["@alice", "@bob"],
    "suggested_labels": ["needs-review"]
  }
}
```

## Success Criteria

- ✅ Template located (or determined to not exist)
- ✅ Template content parsed
- ✅ Sections identified and categorized
- ✅ Checklist items extracted
- ✅ Required vs. optional sections marked

## Error Handling

- **Template not found**: Return null, use default format
- **Template malformed**: Parse what's possible, warn user
- **Multiple templates**: Use first found, log others

