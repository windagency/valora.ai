#!/bin/bash

# Commands Registry Generator
# Generates .ai/commands/registry.json from command .md files
# Usage: ./generate-commands-registry.sh [--dry-run]

set -euo pipefail

# Configuration
COMMANDS_DIR=".ai/commands"
REGISTRY_FILE="${COMMANDS_DIR}/registry.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

# Check if we're in dry-run mode
DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    log_info "Running in dry-run mode"
fi

# Change to project root
cd "$PROJECT_ROOT"

# Validate commands directory exists
if [[ ! -d "$COMMANDS_DIR" ]]; then
    log_error "Commands directory not found: $COMMANDS_DIR"
    exit 1
fi

# Extract YAML frontmatter from a markdown file
extract_frontmatter() {
    local file="$1"
    local in_frontmatter=false
    local frontmatter=""

    while IFS= read -r line; do
        if [[ "$line" == "---" ]]; then
            if [[ "$in_frontmatter" == false ]]; then
                in_frontmatter=true
                continue
            else
                break
            fi
        fi

        if [[ "$in_frontmatter" == true ]]; then
            frontmatter+="$line"$'\n'
        fi
    done < "$file"

    echo "$frontmatter"
}

# Parse YAML array values
parse_yaml_array() {
    local yaml="$1"
    local key="$2"
    local result=""

    # Find the line number where the key starts
    local start_line=$(echo "$yaml" | grep -n "^${key}:" | cut -d: -f1)

    if [[ -n "$start_line" ]]; then
        # Extract everything from the key line onwards
        local remaining_yaml=$(echo "$yaml" | tail -n +$start_line)

        # Process line by line to extract array items
        local in_array=false
        local line_num=1

        while IFS= read -r line; do
            # Check if this line starts the array
            if [[ "$line" =~ ^${key}: ]]; then
                in_array=true
                # Check if it's a single-line array
                if [[ "$line" =~ ^${key}:\s*\[ ]]; then
                    # Single line array - not supported in our simple parser
                    break
                fi
                ((line_num++))
                continue
            fi

            # If we're in the array, look for dash-prefixed lines
            if [[ "$in_array" == true ]]; then
                # Stop if we hit another top-level key (no leading spaces)
                if [[ "$line" =~ ^[a-zA-Z] && ! "$line" =~ ^[[:space:]] ]]; then
                    break
                fi

                # Extract array item (remove leading dash and spaces)
                if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*(.+) ]]; then
                    local item=$(echo "$line" | sed 's/^[[:space:]]*-[[:space:]]*//' | sed 's/^"//' | sed 's/"$//' | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')
                    if [[ -n "$item" ]]; then
                        result+="$item|"
                    fi
                fi
            fi

            ((line_num++))
        done <<< "$remaining_yaml"
    fi

    # Remove trailing pipe
    echo "${result%|}"
}

# Parse YAML single value
parse_yaml_value() {
    local yaml="$1"
    local key="$2"

    local value=$(echo "$yaml" | grep "^${key}:" | sed "s/^${key}:\s*//" | sed 's/^"//' | sed 's/"$//' | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')
    echo "$value"
}

# Get all command files (excluding template)
get_command_files() {
    find "$COMMANDS_DIR" -maxdepth 1 -name "*.md" -not -name "_template.md" | sort
}


# Process a single command file
process_command() {
    local file="$1"
    local name=$(basename "$file" .md)

    log_info "Processing command: $name"

    local frontmatter
    frontmatter=$(extract_frontmatter "$file")

    if [[ -z "$frontmatter" ]]; then
        log_warn "No frontmatter found in $file"
        return
    fi

    # Extract basic fields
    local description
    description=$(parse_yaml_value "$frontmatter" "description")
    local experimental
    experimental=$(parse_yaml_value "$frontmatter" "experimental")
    local argument_hint
    argument_hint=$(parse_yaml_value "$frontmatter" "argument-hint")
    local allowed_tools
    allowed_tools=$(parse_yaml_array "$frontmatter" "allowed-tools")
    local model
    model=$(parse_yaml_value "$frontmatter" "model")
    local agent
    agent=$(parse_yaml_value "$frontmatter" "agent")
    local dynamic_agent_selection
    dynamic_agent_selection=$(parse_yaml_value "$frontmatter" "dynamic_agent_selection")
    local fallback_agent
    fallback_agent=$(parse_yaml_value "$frontmatter" "fallback_agent")
    local agent_selection_criteria
    agent_selection_criteria=$(parse_yaml_array "$frontmatter" "agent_selection_criteria")
    # Build JSON object
    local experimental_json="false"
    if [[ "$experimental" == "true" ]]; then
        experimental_json="true"
    fi

    local argument_hint_json=""
    if [[ -n "$argument_hint" ]]; then
        # Escape quotes in argument hint
        local escaped_hint=$(echo "$argument_hint" | sed 's/"/\\"/g')
        argument_hint_json=',"argument-hint": "'$escaped_hint'"'
    fi

    local allowed_tools_json=""
    if [[ -n "$allowed_tools" ]]; then
        allowed_tools_json=$(echo "$allowed_tools" | tr '|' '\n' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
        allowed_tools_json=',"allowed-tools": ['$allowed_tools_json']'
    fi

    local dynamic_agent_selection_json=""
    if [[ "$dynamic_agent_selection" == "true" ]]; then
        dynamic_agent_selection_json=',"dynamic_agent_selection": true'
    fi

    local fallback_agent_json=""
    if [[ -n "$fallback_agent" ]]; then
        fallback_agent_json=',"fallback_agent": "'$fallback_agent'"'
    fi

    local agent_selection_criteria_json=""
    if [[ -n "$agent_selection_criteria" ]]; then
        agent_selection_criteria_json=$(echo "$agent_selection_criteria" | tr '|' '\n' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
        agent_selection_criteria_json=',"agent_selection_criteria": ['$agent_selection_criteria_json']'
    fi

    # For now, skip complex prompts parsing
    local prompts_json=""

    cat << EOF
    "$name": {
      "name": "$name",
      "description": "$description",
      "experimental": $experimental_json$argument_hint_json$allowed_tools_json$dynamic_agent_selection_json$fallback_agent_json$agent_selection_criteria_json,
      "model": "$model",
      "agent": "$agent"$prompts_json
    }
EOF
}

# Generate the complete registry
generate_registry() {
    log_info "Starting commands registry generation..."

    # Collect commands JSON
    local commands_json=""
    local first=true
    for file in $(get_command_files); do
        if [[ "$first" == false ]]; then
            commands_json+=$','
        fi
        commands_json+=$'\n'
        commands_json+="$(process_command "$file")"
        first=false
    done

    # Build complete JSON structure
    local json="{"
    json+=$'\n  "commands": {'
    json+="$commands_json"
    json+=$'\n  }'
    json+=$'\n}'

    # Validate JSON
    if echo "$json" | jq . >/dev/null 2>&1; then
        log_success "Generated valid JSON"
    else
        log_error "Generated invalid JSON"
        echo "$json" | head -20
        echo "$json" | jq . 2>&1 || true
        return 1
    fi

    # Output or write file
    if [[ "$DRY_RUN" == true ]]; then
        echo "$json"
    else
        echo "$json" > "$REGISTRY_FILE"
        log_success "Commands registry written to $REGISTRY_FILE"
    fi
}

# Main execution
main() {
    log_info "Commands Registry Generator"
    log_info "=========================="

    generate_registry
}

main "$@"
