# Commands Registry Generator

**File**: `generate-commands-registry.sh`

## Purpose

Generates the `.ai/commands/registry.json` file from command definition files in the `.ai/commands/` directory. This registry catalogs available commands with their agents, models, and allowed tools.

## Usage

```bash
# Generate registry from command files
.ai/scripts/generate-commands-registry.sh

# Dry run (preview output without writing files)
.ai/scripts/generate-commands-registry.sh --dry-run
```

## What it does

1. **Parses YAML frontmatter** from all `.md` files in `.ai/commands/` (excluding `_template.md`)
2. **Extracts command metadata**: name, description, experimental status, argument hints, allowed tools, model, agent
3. **Generates JSON registry** mapping command names to their configurations

## Features

- **YAML frontmatter parsing**: Extracts structured metadata from command markdown files
- **Dynamic agent selection support**: Parses `dynamic_agent_selection`, `fallback_agent`, and `agent_selection_criteria` fields
- **JSON validation**: Ensures generated output is valid JSON
- **Error handling**: Clear error messages and logging
- **Dry run mode**: Preview changes without writing files
- **Path resolution**: Correctly handles relative paths from project root

## Dependencies

- `bash` (shell scripting)
- `jq` (JSON processing and validation)
- Standard Unix tools: `grep`, `sed`, `awk`, `find`

## Examples

```bash
# Generate registry
.ai/scripts/generate-commands-registry.sh

# Preview changes
.ai/scripts/generate-commands-registry.sh --dry-run | jq '.commands | keys'
```

## Output

The script generates `.ai/commands/registry.json` with this structure:

```json
{
  "commands": {
    "command-name": {
      "name": "command-name",
      "description": "Command description",
      "experimental": true,
      "argument-hint": "[--option=value]",
      "allowed-tools": ["tool1", "tool2"],
      "model": "claude-sonnet-4.5",
      "agent": "lead",
      "dynamic_agent_selection": true,
      "fallback_agent": "software-engineer-typescript",
      "agent_selection_criteria": [
        "analyze_task_description",
        "analyze_affected_files",
        "consider_dependencies"
      ]
    }
  }
}
```

## Command Schema

Commands are defined in `.ai/commands/*.md` files with YAML frontmatter containing:

- `name`: Command identifier (kebab-case)
- `description`: Brief description of what the command does
- `experimental`: Whether the command is experimental (boolean)
- `argument-hint`: Usage hint for command arguments (optional)
- `allowed-tools`: Array of tools the agent is permitted to use
- `model`: AI model to use for this command
- `agent`: Agent role to use for this command (fallback when dynamic selection is disabled)
- `dynamic_agent_selection`: Whether to enable automatic agent selection based on task analysis (boolean, optional)
- `fallback_agent`: Agent role to use when dynamic selection fails (optional, defaults to `agent` value)
- `agent_selection_criteria`: Array of criteria for dynamic agent selection (optional)
