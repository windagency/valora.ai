#!/bin/bash

# Agent Registry Generator
# Generates data/agents/registry.json from agent .md files.
#
# Agent definitions live in packages/*/agents/*.md. Their YAML frontmatter is
# parsed with a real YAML parser (the repo's `yaml` package, via Node) and
# serialised with JSON.stringify, so the output is always valid JSON regardless
# of quotes/commas/parentheses/colons in field values. (The previous hand-rolled
# sed/regex assembler was fragile, silently dropped inherited expertise via a
# `parse_yaml` typo, and still scanned the now-empty data/agents/ directory.)
#
# It maps each agent's expertise (including expertise inherited from its parent
# via `inherits`) to domains, selection criteria, and a priority, then emits the
# capabilities map plus the static taskDomains / selectionCriteria dictionaries.
#
# Usage: ./generate-agents-registry.sh [--dry-run]

set -euo pipefail

# Configuration
AGENTS_GLOB_ROOT="packages"       # agent .md files live in packages/*/agents
REGISTRY_FILE="data/agents/registry.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1" >&2; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1" >&2; }

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    log_info "Running in dry-run mode"
fi

cd "$PROJECT_ROOT"

if [[ ! -d "$AGENTS_GLOB_ROOT" ]]; then
    log_error "Packages directory not found: $AGENTS_GLOB_ROOT"
    exit 1
fi

log_info "Agent Registry Generator"
log_info "========================"
log_info "Starting registry generation..."

GEN_OUT="$(mktemp)"
trap 'rm -f "$GEN_OUT"' EXIT
node > "$GEN_OUT" <<'NODE'
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

// Collect agent .md files from every package's agents directory (excluding _template.md).
function collect() {
	const out = [];
	for (const pkg of fs.readdirSync('packages')) {
		const dir = path.join('packages', pkg, 'agents');
		if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
		for (const entry of fs.readdirSync(dir)) {
			if (entry.endsWith('.md') && entry !== '_template.md') out.push(path.join(dir, entry));
		}
	}
	return out.sort();
}

function parseFrontmatter(content) {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return null;
	return YAML.parse(match[1]) ?? {};
}

const uniqSorted = (arr) => [...new Set(arr)].sort();
const matches = (text, re) => re.test(text);

/** Domains derived from expertise keywords + role. Mirrors the original heuristic. */
function mapDomains(role, allExpertise) {
	const t = allExpertise.toLowerCase();
	const d = [];
	if (matches(t, /architecture|kubernetes|terraform|infrastructure|platform|devops|cloud/)) {
		d.push('infrastructure');
		if (/lead/.test(role)) d.push('architecture', 'leadership', 'engineering-excellence', 'security');
	}
	if (matches(t, /typescript|javascript|react|next|vue|frontend|ui|component/)) {
		d.push('typescript-core', 'typescript-general');
		if (/frontend/.test(role)) d.push('frontend-ui');
		if (/react/.test(role)) d.push('frontend-ui');
	}
	if (matches(t, /backend|api|database|server|node|express|nest|graphql|rest/)) d.push('backend-api');
	if (matches(t, /product|requirements|stakeholder|user.*story/)) d.push('product', 'requirements', 'stakeholder-management');
	if (matches(t, /test|qa|quality|automation|jest|cypress|playwright/)) d.push('testing', 'quality-assurance');
	if (matches(t, /security|threat|vulnerability|compliance|audit/)) d.push('security', 'threat-detection', 'compliance');
	if (matches(t, /design|ux|ui|user.*experience|accessibility|figma/)) d.push('design', 'user-experience', 'accessibility');
	if (matches(t, /validation|static.*analysis|linting|code.*quality/)) d.push('validation', 'static-analysis', 'quality-gate');
	return uniqSorted(d);
}

/** Selection criteria derived from expertise keywords + role. Mirrors the original heuristic. */
function mapCriteria(role, allExpertise) {
	const t = allExpertise.toLowerCase();
	const c = ['code-files', 'documentation-files'];
	if (matches(t, /typescript|javascript/)) c.push('typescript-files', 'type-definitions', 'architecture-files', 'config-files');
	if (/frontend/.test(role)) c.push('react-imports');
	if (matches(t, /infrastructure|terraform|kubernetes|docker/)) c.push('infrastructure-files', 'terraform-files', 'kubernetes-manifests', 'docker-files');
	if (matches(t, /test|qa/)) c.push('test-files', 'testing-config', 'qa-scripts', 'test-reports');
	if (matches(t, /security/)) c.push('security-files', 'policy-files', 'audit-files', 'encryption-code', 'authentication-code');
	if (matches(t, /design|ux/)) c.push('design-files', 'ui-mockups', 'accessibility-files', 'ux-research');
	if (matches(t, /product|requirements/)) c.push('requirements-files', 'product-docs', 'user-stories', 'roadmap-files');
	if (matches(t, /architecture|leadership/)) c.push('architecture-files', 'leadership-docs', 'engineering-docs', 'strategy-files');
	if (matches(t, /cloud|platform/)) c.push('cloud-config');
	return uniqSorted(c);
}

const PRIORITIES = {
	'asserter': 80,
	'lead': 90,
	'platform-engineer': 90,
	'product-manager': 75,
	'qa': 85,
	'secops-engineer': 95,
	'software-engineer-typescript': 95,
	'software-engineer-typescript-backend': 95,
	'software-engineer-typescript-frontend': 95,
	'software-engineer-typescript-frontend-react': 70,
	'ui-ux-designer': 75
};
const getPriority = (role) => PRIORITIES[role] ?? 50;

// First pass: parse every agent's own expertise so `inherits` can resolve by role.
const files = collect();
const errors = [];
const own = {}; // role -> { expertise: string[] , inherits?: string }
for (const file of files) {
	const role = path.basename(file, '.md');
	let fm;
	try {
		fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
	} catch (err) {
		errors.push(`${file}: ${err.message.split('\n')[0]}`);
		continue;
	}
	if (!fm) {
		process.stderr.write(`[WARN] No frontmatter found in ${file}\n`);
		continue;
	}
	own[role] = {
		expertise: Array.isArray(fm.expertise) ? fm.expertise.map((e) => String(e)) : [],
		inherits: fm.inherits != null && fm.inherits !== 'null' ? String(fm.inherits) : undefined
	};
}

if (errors.length) {
	process.stderr.write(`Invalid agent frontmatter (fix these files):\n  - ${errors.join('\n  - ')}\n`);
	process.exit(1);
}

// Second pass: build capabilities with inherited expertise resolved (direct parent).
const capabilities = {};
for (const role of Object.keys(own).sort()) {
	const inheritsFrom = own[role].inherits;
	const inherited = inheritsFrom && own[inheritsFrom] ? own[inheritsFrom].expertise : [];
	const expertise = uniqSorted([...own[role].expertise, ...inherited]);
	const allExpertise = expertise.join('|');
	capabilities[role] = {
		domains: mapDomains(role, allExpertise),
		expertise,
		selectionCriteria: mapCriteria(role, allExpertise),
		priority: getPriority(role)
	};
}

const taskDomains = {
	accessibility: 'Accessibility and inclusive design',
	architecture: 'System architecture and technical leadership',
	'backend-api': 'Backend API development, databases, and business logic',
	cloud: 'Cloud platform management and services',
	compliance: 'Compliance frameworks and regulatory requirements',
	design: 'UI/UX design and user interface development',
	devops: 'DevOps practices, CI/CD, and deployment automation',
	'engineering-excellence': 'Engineering best practices and excellence',
	'frontend-ui': 'Frontend UI development with React/Next.js',
	infrastructure: 'Infrastructure, DevOps, cloud, and platform engineering tasks',
	leadership: 'Engineering leadership and team management',
	product: 'Product management and requirements',
	'quality-assurance': 'Quality assurance and test automation',
	'quality-gate': 'Quality assurance checkpoints',
	requirements: 'Requirements gathering and specification',
	security: 'Security, compliance, and threat detection tasks',
	'stakeholder-management': 'Stakeholder communication and management',
	'static-analysis': 'Static code analysis and linting',
	testing: 'Software testing and quality assurance',
	'threat-detection': 'Threat modeling and security monitoring',
	'typescript-core': 'Core TypeScript development and architecture',
	'typescript-general': 'General TypeScript development patterns',
	'user-experience': 'User experience design and research',
	validation: 'Code validation and quality gates'
};

const selectionCriteria = {
	'accessibility-files': 'Accessibility guidelines and tests',
	'architecture-files': 'Architecture and design files',
	'audit-files': 'Audit and compliance related files',
	'authentication-code': 'Authentication and authorization code',
	'cloud-config': 'AWS/GCP/Azure configuration files',
	'code-files': 'General code files for analysis',
	'config-files': 'Configuration and setup files',
	'design-files': 'Design assets and mockups',
	'docker-files': 'Dockerfiles and docker-compose files',
	'documentation-files': 'Documentation and knowledge base files',
	'encryption-code': 'Encryption, hashing, and cryptographic code',
	'engineering-docs': 'Engineering standards and practices',
	'infrastructure-files': 'Files in infrastructure/, *.tf, docker files',
	'kubernetes-manifests': 'Kubernetes YAML manifests',
	'leadership-docs': 'Leadership and team documentation',
	'policy-files': 'Policy as Code files (OPA, Sentinel)',
	'product-docs': 'Product documentation and guides',
	'qa-scripts': 'Quality assurance scripts',
	'react-imports': 'Files importing React or React components',
	'requirements-files': 'Requirements and specification files',
	'roadmap-files': 'Product roadmap and planning files',
	'security-files': 'Security policies, audit logs, encryption code',
	'strategy-files': 'Strategic planning and roadmap files',
	'terraform-files': 'Terraform configuration files (*.tf)',
	'test-files': 'Test files and test suites',
	'test-reports': 'Test execution reports',
	'testing-config': 'Testing configuration and setup',
	'type-definitions': 'Type definition files (*.d.ts)',
	'typescript-files': 'TypeScript source files (*.ts)',
	'ui-mockups': 'UI mockups and wireframes',
	'user-stories': 'User stories and acceptance criteria',
	'ux-research': 'User research and usability files'
};

process.stdout.write(JSON.stringify({ capabilities, taskDomains, selectionCriteria }, null, '\t') + '\n');
NODE
REGISTRY_JSON="$(cat "$GEN_OUT")"

if ! printf '%s' "$REGISTRY_JSON" | jq . >/dev/null 2>&1; then
    log_error "Generated invalid JSON"
    printf '%s\n' "$REGISTRY_JSON" | head -20
    exit 1
fi
log_success "Generated valid JSON ($(printf '%s' "$REGISTRY_JSON" | jq '.capabilities | length') agents)"

if [[ "$DRY_RUN" == true ]]; then
    printf '%s' "$REGISTRY_JSON"
else
    printf '%s' "$REGISTRY_JSON" > "$REGISTRY_FILE"
    log_success "Registry written to $REGISTRY_FILE"
fi
