# Prompts Registry Generator

**File**: `generate-prompts-registry.sh`

## Purpose

Generates the `.ai/prompts/registry.json` file from prompt definition files in the `.ai/prompts/` directory. This registry catalogs reusable AI prompts with their metadata, dependencies, and requirements.

## Usage

```bash
# Generate registry from prompt files
.ai/scripts/generate-prompts-registry.sh

# Dry run (preview output without writing files)
.ai/scripts/generate-prompts-registry.sh --dry-run
```

## What it does

1. **Parses YAML frontmatter** from all `.md` files in `.ai/prompts/` subdirectories (excluding `_template.md` and `_meta/`)
2. **Extracts prompt metadata**: id, version, category, name, description, tags, model requirements, agents, dependencies, inputs, outputs
3. **Generates JSON registry** mapping prompt IDs to their configurations

## Features

- **YAML frontmatter parsing**: Extracts structured metadata from prompt markdown files
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
.ai/scripts/generate-prompts-registry.sh

# Preview changes
.ai/scripts/generate-prompts-registry.sh --dry-run | jq '.prompts | keys'
```

## Output

The script generates `.ai/prompts/registry.json` with this structure:

```json
{
  "prompts": {
    "category.name": {
      "id": "category.name",
      "version": "1.0.0",
      "category": "context",
      "experimental": true,
      "name": "Prompt Name",
      "description": "Prompt description",
      "tags": ["tag1", "tag2"],
      "agents": ["agent1", "agent2"],
      "outputs": ["output1", "output2"]
    }
  }
}
```

## Prompt Schema

Prompts are defined in `.ai/prompts/*/*.md` files with YAML frontmatter containing:

- `id`: Unique prompt identifier (category.name format)
- `version`: Semantic version of the prompt
- `category`: Prompt category (onboard, context, plan, code, review, test, documentation, deployment, refactor, maintenance)
- `name`: Human-readable prompt name
- `description`: Brief description of prompt purpose
- `tags`: Searchable tags for categorization
- `model_requirements`: Model compatibility and requirements
  - `min_context`: Minimum context window size
  - `recommended`: Recommended models
  - `forbidden`: Incompatible models
- `agents`: Compatible agent roles
- `dependencies`: Prompt dependencies and relationships
  - `requires`: Required prerequisite prompts
  - `optional`: Optional enhancement prompts
  - `conflicts_with`: Conflicting prompts
- `inputs`: Input parameters with validation rules
- `outputs`: Output variables produced by the prompt
