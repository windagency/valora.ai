---
id: context.load-commit-template
version: 1.0.0
category: context
experimental: true
name: Load Commit Template
description: Load and parse project-specific commit template configuration
tags:
  - commit-template
  - configuration
  - template-parsing
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
  - software-engineer
dependencies:
  requires:
    - context.use-modern-cli-tools
inputs:
  - name: template_name
    description: Template name specified by user (e.g., "feature", "bugfix")
    type: string
    required: true
outputs:
  - template_config
  - required_fields
tokens:
  avg: 1500
  max: 3000
  min: 800
---

# Load Commit Template

## Objective

Load project-specific commit template configuration from repository configuration files.

## Instructions

### Step 1: Locate Template Configuration

Check these locations in order:

1. **Dedicated commit config**:
   - `.commitrc.json`
   - `.commitrc.yml`
   - `.commit-templates.json`

2. **Package manager configs**:
   - `package.json` (under `"commit"` key)
   - `pyproject.toml` (under `[tool.commit]` section)
   - `Cargo.toml` (under `[package.metadata.commit]`)

3. **Git config**:
   - `.git/config` (under `[commit]` section)

### Step 2: Read Configuration File

Use `read_file` tool to load the config.

**Handle**:
- File not found → Return error
- Invalid JSON/YAML → Return error
- Valid config → Continue parsing

### Step 3: Parse Template Structure

Expected structure:

```json
{
  "commit": {
    "templates": {
      "feature": {
        "subject": "feat({{scope}}): {{description}}",
        "body": "**Ticket:** {{ticket}}\n\n{{details}}",
        "footer": "Closes #{{ticket}}",
        "required": ["scope", "description", "ticket"]
      },
      "bugfix": {
        "subject": "fix({{scope}}): {{description}}",
        "body": "**Issue:** {{ticket}}\n**Root Cause:** {{root_cause}}\n\n{{details}}",
        "footer": "Fixes #{{ticket}}",
        "required": ["scope", "description", "ticket", "root_cause"]
      }
    }
  }
}
```

### Step 4: Extract Specified Template

Retrieve the template matching `template_name`:

```typescript
const template = config.commit.templates[template_name];

if (!template) {
  return error: `Template "${template_name}" not found. Available: ${Object.keys(config.commit.templates).join(', ')}`
}
```

### Step 5: Parse Template Variables

Extract all variables from template strings:

**Pattern**: `{{variable_name}}`

**Common variables**:
- `{{scope}}` - Functional area
- `{{description}}` - Change description
- `{{ticket}}` - Issue/ticket number
- `{{details}}` - Detailed explanation
- `{{root_cause}}` - For bug fixes
- `{{breaking}}` - Breaking change description

### Step 6: Validate Required Fields

Check that all required fields are specified:

```typescript
const required = template.required || [];
const variables = extractVariables(template);

// Ensure required fields are variables in template
for (const field of required) {
  if (!variables.includes(field)) {
    warn: `Required field "${field}" not found in template`
  }
}
```

## Output Format

```json
{
  "template_config": {
    "name": "feature",
    "subject_template": "feat({{scope}}): {{description}}",
    "body_template": "**Ticket:** {{ticket}}\n\n{{details}}",
    "footer_template": "Closes #{{ticket}}",
    "required": ["scope", "description", "ticket"],
    "optional": ["details"]
  },
  "required_fields": [
    {
      "name": "scope",
      "description": "Functional area (e.g., auth, api, ui)",
      "required": true
    },
    {
      "name": "description",
      "description": "Brief change description",
      "required": true
    },
    {
      "name": "ticket",
      "description": "Issue or ticket number",
      "required": true
    }
  ],
  "config_source": ".commitrc.json",
  "available_templates": ["feature", "bugfix", "hotfix", "refactor"]
}
```

## Success Criteria

- ✅ Template configuration located
- ✅ Specified template found
- ✅ Template structure parsed
- ✅ Variables extracted
- ✅ Required fields identified

## Error Handling

- **Config file not found**: Return error with available locations
- **Template not found**: List available templates
- **Invalid format**: Return error with format expectations
- **Missing required fields**: Warn but continue

