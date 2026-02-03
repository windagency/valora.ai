#!/bin/bash

# Prompts Registry Generator
# Generates .ai/prompts/registry.json from prompt .md files
# Usage: ./generate-prompts-registry.sh [--dry-run]

set -euo pipefail

# Configuration
PROMPTS_DIR=".ai/prompts"
REGISTRY_FILE="${PROMPTS_DIR}/registry.json"
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

# Validate prompts directory exists
if [[ ! -d "$PROMPTS_DIR" ]]; then
    log_error "Prompts directory not found: $PROMPTS_DIR"
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
                    local item=$(echo "$line" | sed 's/^[[:space:]]*-[[:space:]]*//' | sed 's/^"//' | sed 's/"$//')
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

    local value=$(echo "$yaml" | grep "^${key}:" | sed "s/^${key}:\s*//" | sed 's/^"//' | sed 's/"$//')
    echo "$value"
}

# Parse complex nested structures
parse_model_requirements() {
    local yaml="$1"
    local result=""

    # Find model_requirements section
    local section_start=$(echo "$yaml" | grep -n "^model_requirements:" | cut -d: -f1)

    if [[ -n "$section_start" ]]; then
        result+='"model_requirements": {'

        # Min context
        local min_context=$(echo "$yaml" | grep -A 10 "^model_requirements:" | grep "min_context:" | sed 's/.*min_context:\s*//' | sed 's/^"//' | sed 's/"$//')
        if [[ -n "$min_context" ]]; then
            result+='"min_context": '$min_context','
        fi

        # Recommended models
        local recommended=$(parse_yaml_array "$yaml" "  recommended")
        if [[ -n "$recommended" ]]; then
            local recommended_json=$(echo "$recommended" | tr '|' '\n' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
            result+='"recommended": ['$recommended_json'],'
        fi

        # Forbidden models
        local forbidden=$(parse_yaml_array "$yaml" "  forbidden")
        if [[ -n "$forbidden" ]]; then
            local forbidden_json=$(echo "$forbidden" | tr '|' '\n' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
            result+='"forbidden": ['$forbidden_json'],'
        fi

        result=$(echo "$result" | sed 's/,$//')  # Remove trailing comma
        result+='}'
    fi

    echo "$result"
}

parse_dependencies() {
    local yaml="$1"
    local result=""

    # Find dependencies section
    local section_start=$(echo "$yaml" | grep -n "^dependencies:" | cut -d: -f1)

    if [[ -n "$section_start" ]]; then
        result+='"dependencies": {'

        # Requires
        local requires=$(parse_yaml_array "$yaml" "  requires")
        if [[ -n "$requires" ]]; then
            local requires_json=$(echo "$requires" | tr '|' '\n' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
            result+='"requires": ['$requires_json'],'
        fi

        # Optional
        local optional=$(parse_yaml_array "$yaml" "  optional")
        if [[ -n "$optional" ]]; then
            local optional_json=$(echo "$optional" | tr '|' '\n' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
            result+='"optional": ['$optional_json'],'
        fi

        # Conflicts with
        local conflicts=$(parse_yaml_array "$yaml" "  conflicts_with")
        if [[ -n "$conflicts" ]]; then
            local conflicts_json=$(echo "$conflicts" | tr '|' '\n' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
            result+='"conflicts_with": ['$conflicts_json'],'
        fi

        result=$(echo "$result" | sed 's/,$//')  # Remove trailing comma
        result+='}'
    fi

    echo "$result"
}

parse_inputs() {
    local yaml="$1"
    local result=""

    # Find inputs section
    local section_start=$(echo "$yaml" | grep -n "^inputs:" | cut -d: -f1)

    if [[ -n "$section_start" ]]; then
        result+='"inputs": ['
        local remaining_yaml=$(echo "$yaml" | tail -n +$section_start)
        local in_inputs=false
        local current_input=""
        local brace_count=0

        while IFS= read -r line; do
            # Start of inputs
            if [[ "$line" =~ ^inputs: ]]; then
                in_inputs=true
                continue
            fi

            if [[ "$in_inputs" == true ]]; then
                # End of inputs
                if [[ "$line" =~ ^[a-zA-Z] && ! "$line" =~ ^[[:space:]] ]]; then
                    break
                fi

                # New input item
                if [[ "$line" =~ ^\s*-\s*name:\s*(.+) ]]; then
                    if [[ -n "$current_input" ]]; then
                        result+='},'
                    fi
                    local input_name=$(echo "$line" | sed 's/.*name:\s*//' | sed 's/^"//' | sed 's/"$//')
                    result+='{"name": "'$input_name'"'
                    current_input="$input_name"
                fi

                # Description
                if [[ "$line" =~ ^\s*description:\s*(.+) ]]; then
                    local desc=$(echo "$line" | sed 's/.*description:\s*//' | sed 's/^"//' | sed 's/"$//')
                    result+=',"description": "'$desc'"'
                fi

                # Type
                if [[ "$line" =~ ^\s*type:\s*(.+) ]]; then
                    local type=$(echo "$line" | sed 's/.*type:\s*//' | sed 's/^"//' | sed 's/"$//')
                    result+=',"type": "'$type'"'
                fi

                # Required
                if [[ "$line" =~ ^\s*required:\s*(.+) ]]; then
                    local required=$(echo "$line" | sed 's/.*required:\s*//' | sed 's/^"//' | sed 's/"$//')
                    result+=',"required": '$required''
                fi

                # Default
                if [[ "$line" =~ ^\s*default:\s*(.+) ]]; then
                    local default_val=$(echo "$line" | sed 's/.*default:\s*//' | sed 's/^"//' | sed 's/"$//')
                    result+=',"default": "'$default_val'"'
                fi
            fi
        done <<< "$remaining_yaml"

        if [[ -n "$current_input" ]]; then
            result+='}'
        fi
        result+=']'
    fi

    echo "$result"
}

# Get all prompt files (excluding templates and meta files)
get_prompt_files() {
    find "$PROMPTS_DIR" -name "*.md" -not -path "*/_meta/*" -not -name "_template.md" | sort
}

# Process a single prompt file
process_prompt() {
    local file="$1"
    local relative_path="${file#$PROMPTS_DIR/}"
    local id=$(echo "$relative_path" | sed 's/\.md$//' | tr '/' '.')

    log_info "Processing prompt: $id"

    local frontmatter
    frontmatter=$(extract_frontmatter "$file")

    if [[ -z "$frontmatter" ]]; then
        log_warn "No frontmatter found in $file"
        return
    fi

    # Extract basic fields
    local version
    version=$(parse_yaml_value "$frontmatter" "version")
    local category
    category=$(parse_yaml_value "$frontmatter" "category")
    local experimental
    experimental=$(parse_yaml_value "$frontmatter" "experimental")
    local name
    name=$(parse_yaml_value "$frontmatter" "name")
    local description
    description=$(parse_yaml_value "$frontmatter" "description")
    local tags
    tags=$(parse_yaml_array "$frontmatter" "tags")
    local agents
    agents=$(parse_yaml_array "$frontmatter" "agents")
    local outputs
    outputs=$(parse_yaml_array "$frontmatter" "outputs")

    # Parse complex sections
    local model_reqs
    model_reqs=$(parse_model_requirements "$frontmatter")
    local deps
    deps=$(parse_dependencies "$frontmatter")
    local inputs
    inputs=$(parse_inputs "$frontmatter")

    # Build JSON object
    local experimental_json="false"
    if [[ "$experimental" == "true" ]]; then
        experimental_json="true"
    fi

    local tags_json=""
    if [[ -n "$tags" ]]; then
        tags_json=$(echo "$tags" | tr '|' '\n' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
        tags_json=',"tags": ['$tags_json']'
    fi

    local agents_json=""
    if [[ -n "$agents" ]]; then
        agents_json=$(echo "$agents" | tr '|' '\n' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
        agents_json=',"agents": ['$agents_json']'
    fi

    local outputs_json=""
    if [[ -n "$outputs" ]]; then
        outputs_json=$(echo "$outputs" | tr '|' '\n' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
        outputs_json=',"outputs": ['$outputs_json']'
    fi

    local model_reqs_json=""
    if [[ -n "$model_reqs" ]]; then
        model_reqs_json=",$model_reqs"
    fi

    local deps_json=""
    if [[ -n "$deps" ]]; then
        deps_json=",$deps"
    fi

    local inputs_json=""
    if [[ -n "$inputs" ]]; then
        inputs_json=",$inputs"
    fi

    cat << EOF
    "$id": {
      "id": "$id",
      "version": "$version",
      "category": "$category",
      "experimental": $experimental_json,
      "name": "$name",
      "description": "$description"$tags_json$agents_json$outputs_json$model_reqs_json$deps_json$inputs_json
    }
EOF
}

# Generate the complete registry
generate_registry() {
    log_info "Starting prompts registry generation..."

    # Collect prompts JSON
    local prompts_json=""
    local first=true
    for file in $(get_prompt_files); do
        if [[ "$first" == false ]]; then
            prompts_json+=$','
        fi
        prompts_json+=$'\n'
        prompts_json+="$(process_prompt "$file")"
        first=false
    done

    # Build complete JSON structure
    local json="{"
    json+=$'\n  "prompts": {'
    json+="$prompts_json"
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
        log_success "Prompts registry written to $REGISTRY_FILE"
    fi
}

# Main execution
main() {
    log_info "Prompts Registry Generator"
    log_info "========================="

    generate_registry
}

main "$@"
