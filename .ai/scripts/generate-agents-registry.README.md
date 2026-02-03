# Agents Registry Generator

**File**: `generate-agents-registry.sh`

## Purpose

Generates the `.ai/agents/registry.json` file from agent definition files in the `.ai/agents/` directory. This registry is used by the AI orchestration engine to understand agent capabilities, domains, and selection criteria.

## Usage

```bash
# Generate registry from agent files
.ai/scripts/generate-agents-registry.sh

# Dry run (preview output without writing files)
.ai/scripts/generate-agents-registry.sh --dry-run
```

## What it does

1. **Parses YAML frontmatter** from all `.md` files in `.ai/agents/` (excluding `_template.md`)
2. **Handles inheritance** - agents with `inherits` field inherit expertise from parent agents
3. **Maps agent data** to registry format:
   - `domains`: Categorizes agents by their areas of focus
   - `expertise`: Combined list of skills (including inherited)
   - `selectionCriteria`: File types/patterns this agent should handle
   - `priority`: Numeric priority for agent selection
4. **Generates complete JSON** with capabilities, taskDomains, and selectionCriteria mappings

## Features

- **YAML parsing**: Extracts role, expertise, inheritance, and other metadata
- **Inheritance support**: Child agents inherit expertise from parent agents
- **Domain mapping**: Automatically categorizes agents by expertise keywords
- **Selection criteria**: Maps agents to appropriate file types and contexts
- **Validation**: Ensures generated JSON is valid
- **Error handling**: Provides clear error messages for invalid configurations

## Dependencies

- `bash` (shell scripting)
- `jq` (JSON processing and validation)
- Standard Unix tools: `grep`, `sed`, `awk`, `find`

## Examples

```bash
# Generate registry
.ai/scripts/generate-agents-registry.sh

# Preview changes
.ai/scripts/generate-agents-registry.sh --dry-run | jq '.capabilities | keys'
```

## Output

The script generates `.ai/agents/registry.json` with this structure:

```json
{
  "capabilities": {
    "agent-role": {
      "domains": ["domain1", "domain2"],
      "expertise": ["skill1", "skill2"],
      "selectionCriteria": ["file-type1", "file-type2"],
      "priority": 80
    }
  },
  "taskDomains": { /* domain definitions */ },
  "selectionCriteria": { /* criteria definitions */ }
}
```
