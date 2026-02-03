#!/bin/bash

# Agent Registry Generator
# Generates .ai/agents/registry.json from agent .md files
# Usage: ./generate-agent-registry.sh [--dry-run]

set -euo pipefail

# Configuration
AGENTS_DIR=".ai/agents"
REGISTRY_FILE="${AGENTS_DIR}/registry.json"
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

# Validate agents directory exists
if [[ ! -d "$AGENTS_DIR" ]]; then
    log_error "Agents directory not found: $AGENTS_DIR"
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

# Get all agent files (excluding template and subdirs)
get_agent_files() {
    find "$AGENTS_DIR" -maxdepth 1 -name "*.md" -not -name "_template.md" | sort
}

# Map agent role to domains based on expertise and inheritance
map_to_domains() {
    local role="$1"
    local expertise="$2"
    local inherited_expertise="$3"
    local all_expertise="$expertise|$inherited_expertise"

    local domains=()

    # Domain mapping logic based on expertise keywords
    if echo "$all_expertise" | grep -qi "architecture\|kubernetes\|terraform\|infrastructure\|platform\|devops\|cloud"; then
        domains+=("infrastructure")
        if echo "$role" | grep -q "lead"; then
            domains+=("architecture" "leadership" "engineering-excellence" "security")
        fi
    fi

    if echo "$all_expertise" | grep -qi "typescript\|javascript\|react\|next\|vue\|frontend\|ui\|component"; then
        domains+=("typescript-core" "typescript-general")
        if echo "$role" | grep -q "frontend"; then
            domains+=("frontend-ui")
        fi
        if echo "$role" | grep -q "react"; then
            domains+=("frontend-ui")
        fi
    fi

    if echo "$all_expertise" | grep -qi "backend\|api\|database\|server\|node\|express\|nest\|graphql\|rest"; then
        domains+=("backend-api")
    fi

    if echo "$all_expertise" | grep -qi "product\|requirements\|stakeholder\|user.*story"; then
        domains+=("product" "requirements" "stakeholder-management")
    fi

    if echo "$all_expertise" | grep -qi "test\|qa\|quality\|automation\|jest\|cypress\|playwright"; then
        domains+=("testing" "quality-assurance")
    fi

    if echo "$all_expertise" | grep -qi "security\|threat\|vulnerability\|compliance\|audit"; then
        domains+=("security" "threat-detection" "compliance")
    fi

    if echo "$all_expertise" | grep -qi "design\|ux\|ui\|user.*experience\|accessibility\|figma"; then
        domains+=("design" "user-experience" "accessibility")
    fi

    if echo "$all_expertise" | grep -qi "validation\|static.*analysis\|linting\|code.*quality"; then
        domains+=("validation" "static-analysis" "quality-gate")
    fi

    # Remove duplicates and join
    printf '%s\n' "${domains[@]}" | sort | uniq | tr '\n' ','
}

# Map agent role to selection criteria
map_to_selection_criteria() {
    local role="$1"
    local expertise="$2"
    local inherited_expertise="$3"
    local all_expertise="$expertise|$inherited_expertise"

    local criteria=()

    # Base criteria for all agents
    criteria+=("code-files" "documentation-files")

    # Role-specific criteria
    if echo "$all_expertise" | grep -qi "typescript\|javascript"; then
        criteria+=("typescript-files" "type-definitions" "architecture-files" "config-files")
    fi

    if echo "$role" | grep -q "frontend"; then
        criteria+=("react-imports")
    fi

    if echo "$all_expertise" | grep -qi "infrastructure\|terraform\|kubernetes\|docker"; then
        criteria+=("infrastructure-files" "terraform-files" "kubernetes-manifests" "docker-files")
    fi

    if echo "$all_expertise" | grep -qi "test\|qa"; then
        criteria+=("test-files" "testing-config" "qa-scripts" "test-reports")
    fi

    if echo "$all_expertise" | grep -qi "security"; then
        criteria+=("security-files" "policy-files" "audit-files" "encryption-code" "authentication-code")
    fi

    if echo "$all_expertise" | grep -qi "design\|ux"; then
        criteria+=("design-files" "ui-mockups" "accessibility-files" "ux-research")
    fi

    if echo "$all_expertise" | grep -qi "product\|requirements"; then
        criteria+=("requirements-files" "product-docs" "user-stories" "roadmap-files")
    fi

    if echo "$all_expertise" | grep -qi "architecture\|leadership"; then
        criteria+=("architecture-files" "leadership-docs" "engineering-docs" "strategy-files")
    fi

    if echo "$all_expertise" | grep -qi "cloud\|platform"; then
        criteria+=("cloud-config")
    fi

    # Remove duplicates and join
    printf '%s\n' "${criteria[@]}" | sort | uniq | tr '\n' ','
}

# Map agent to priority (higher = more important)
get_priority() {
    local role="$1"

    case "$role" in
        "lead")
            echo 90
            ;;
        "platform-engineer")
            echo 90
            ;;
        "secops-engineer")
            echo 95
            ;;
        "asserter")
            echo 80
            ;;
        "qa")
            echo 85
            ;;
        "software-engineer-typescript-backend")
            echo 95
            ;;
        "software-engineer-typescript-frontend")
            echo 95
            ;;
        "software-engineer-typescript")
            echo 95
            ;;
        "software-engineer-typescript-frontend-react")
            echo 70
            ;;
        "product-manager")
            echo 75
            ;;
        "ui-ux-designer")
            echo 75
            ;;
        *)
            echo 50
            ;;
    esac
}

# Process a single agent file
process_agent() {
    local file="$1"
    local role=$(basename "$file" .md)

    log_info "Processing agent: $role"

    local frontmatter
    frontmatter=$(extract_frontmatter "$file")

    if [[ -z "$frontmatter" ]]; then
        log_warn "No frontmatter found in $file"
        return
    fi

    # Extract basic fields
    local version
    version=$(parse_yaml_value "$frontmatter" "version")
    local description
    description=$(parse_yaml_value "$frontmatter" "description")
    local inherits
    inherits=$(parse_yaml_value "$frontmatter" "inherits")
    local expertise
    expertise=$(parse_yaml_array "$frontmatter" "expertise")

    # Handle inheritance
    local inherited_expertise=""
    if [[ -n "$inherits" && "$inherits" != "null" ]]; then
        local parent_file="${AGENTS_DIR}/${inherits}.md"
        if [[ -f "$parent_file" ]]; then
            local parent_frontmatter
            parent_frontmatter=$(extract_frontmatter "$parent_file")
            inherited_expertise=$(parse_yaml "$parent_frontmatter" "expertise")
        fi
    fi

    # Map to registry format
    local domains
    domains=$(map_to_domains "$role" "$expertise" "$inherited_expertise")
    local selection_criteria
    selection_criteria=$(map_to_selection_criteria "$role" "$expertise" "$inherited_expertise")
    local priority
    priority=$(get_priority "$role")

    # Build JSON arrays
    local domains_json=""
    if [[ -n "$domains" ]]; then
        # Split by comma, filter empty, wrap in quotes, join with commas
        domains_json=$(echo "$domains" | tr ',' '\n' | grep -v '^$' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
    fi

    local expertise_json=""
    if [[ -n "$expertise$inherited_expertise" ]]; then
        # Combine expertise, split by |, clean up, sort, unique, format as JSON array
        expertise_json=$(echo "$expertise|$inherited_expertise" | tr '|' '\n' | grep -v '^$' | sed 's/^[[:space:]]*-[[:space:]]*//' | sort | uniq | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
    fi

    local criteria_json=""
    if [[ -n "$selection_criteria" ]]; then
        # Split by comma, filter empty, wrap in quotes, join with commas
        criteria_json=$(echo "$selection_criteria" | tr ',' '\n' | grep -v '^$' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
    fi

    cat << EOF
    "$role": {
      "domains": [$domains_json],
      "expertise": [$expertise_json],
      "selectionCriteria": [$criteria_json],
      "priority": $priority
    }
EOF
}

# Generate the complete registry
generate_registry() {
    log_info "Starting registry generation..."

    # Collect capabilities JSON
    local capabilities_json=""
    local first=true
    for file in $(get_agent_files); do
        if [[ "$first" == false ]]; then
            capabilities_json+=$','
        fi
        capabilities_json+=$'\n'
        capabilities_json+="$(process_agent "$file")"
        first=false
    done

    # Build complete JSON structure
    local json="{"
    json+=$'\n  "capabilities": {'
    json+="$capabilities_json"
    json+=$'\n  },'

    # Add taskDomains mapping
    json+=$'\n  "taskDomains": {'
    json+=$'\n    "accessibility": "Accessibility and inclusive design",'
    json+=$'\n    "architecture": "System architecture and technical leadership",'
    json+=$'\n    "backend-api": "Backend API development, databases, and business logic",'
    json+=$'\n    "cloud": "Cloud platform management and services",'
    json+=$'\n    "compliance": "Compliance frameworks and regulatory requirements",'
    json+=$'\n    "design": "UI/UX design and user interface development",'
    json+=$'\n    "devops": "DevOps practices, CI/CD, and deployment automation",'
    json+=$'\n    "engineering-excellence": "Engineering best practices and excellence",'
    json+=$'\n    "frontend-ui": "Frontend UI development with React/Next.js",'
    json+=$'\n    "infrastructure": "Infrastructure, DevOps, cloud, and platform engineering tasks",'
    json+=$'\n    "leadership": "Engineering leadership and team management",'
    json+=$'\n    "product": "Product management and requirements",'
    json+=$'\n    "quality-assurance": "Quality assurance and test automation",'
    json+=$'\n    "quality-gate": "Quality assurance checkpoints",'
    json+=$'\n    "requirements": "Requirements gathering and specification",'
    json+=$'\n    "security": "Security, compliance, and threat detection tasks",'
    json+=$'\n    "stakeholder-management": "Stakeholder communication and management",'
    json+=$'\n    "static-analysis": "Static code analysis and linting",'
    json+=$'\n    "testing": "Software testing and quality assurance",'
    json+=$'\n    "threat-detection": "Threat modeling and security monitoring",'
    json+=$'\n    "typescript-core": "Core TypeScript development and architecture",'
    json+=$'\n    "typescript-general": "General TypeScript development patterns",'
    json+=$'\n    "user-experience": "User experience design and research",'
    json+=$'\n    "validation": "Code validation and quality gates"'
    json+=$'\n  },'

    # Add selectionCriteria mapping
    json+=$'\n  "selectionCriteria": {'
    json+=$'\n    "accessibility-files": "Accessibility guidelines and tests",'
    json+=$'\n    "architecture-files": "Architecture and design files",'
    json+=$'\n    "audit-files": "Audit and compliance related files",'
    json+=$'\n    "authentication-code": "Authentication and authorization code",'
    json+=$'\n    "cloud-config": "AWS/GCP/Azure configuration files",'
    json+=$'\n    "code-files": "General code files for analysis",'
    json+=$'\n    "config-files": "Configuration and setup files",'
    json+=$'\n    "design-files": "Design assets and mockups",'
    json+=$'\n    "docker-files": "Dockerfiles and docker-compose files",'
    json+=$'\n    "documentation-files": "Documentation and knowledge base files",'
    json+=$'\n    "encryption-code": "Encryption, hashing, and cryptographic code",'
    json+=$'\n    "engineering-docs": "Engineering standards and practices",'
    json+=$'\n    "infrastructure-files": "Files in infrastructure/, *.tf, docker files",'
    json+=$'\n    "kubernetes-manifests": "Kubernetes YAML manifests",'
    json+=$'\n    "leadership-docs": "Leadership and team documentation",'
    json+=$'\n    "policy-files": "Policy as Code files (OPA, Sentinel)",'
    json+=$'\n    "product-docs": "Product documentation and guides",'
    json+=$'\n    "qa-scripts": "Quality assurance scripts",'
    json+=$'\n    "react-imports": "Files importing React or React components",'
    json+=$'\n    "requirements-files": "Requirements and specification files",'
    json+=$'\n    "roadmap-files": "Product roadmap and planning files",'
    json+=$'\n    "security-files": "Security policies, audit logs, encryption code",'
    json+=$'\n    "strategy-files": "Strategic planning and roadmap files",'
    json+=$'\n    "terraform-files": "Terraform configuration files (*.tf)",'
    json+=$'\n    "test-files": "Test files and test suites",'
    json+=$'\n    "test-reports": "Test execution reports",'
    json+=$'\n    "testing-config": "Testing configuration and setup",'
    json+=$'\n    "type-definitions": "Type definition files (*.d.ts)",'
    json+=$'\n    "typescript-files": "TypeScript source files (*.ts)",'
    json+=$'\n    "ui-mockups": "UI mockups and wireframes",'
    json+=$'\n    "user-stories": "User stories and acceptance criteria",'
    json+=$'\n    "ux-research": "User research and usability files"'
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
        log_success "Registry written to $REGISTRY_FILE"
    fi
}

# Main execution
main() {
    log_info "Agent Registry Generator"
    log_info "========================"

    generate_registry
}

main "$@"
