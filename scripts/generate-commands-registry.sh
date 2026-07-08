#!/bin/bash

# Commands Registry Generator
# Generates data/commands/registry.json from command .md files.
#
# Command definitions live in packages/*/commands/*.md. Their YAML frontmatter is
# parsed with a real YAML parser (the repo's `yaml` package, via Node) and
# serialised with JSON.stringify, so the output is always valid JSON regardless
# of quotes/commas/colons/backslashes in field values. (The previous hand-rolled
# sed/regex assembler produced invalid JSON for any JSON-significant character
# and still scanned the now-empty data/commands/ directory.)
#
# Usage: ./generate-commands-registry.sh [--dry-run]

set -euo pipefail

# Configuration
COMMANDS_GLOB_ROOT="packages"     # command .md files live in packages/*/commands
REGISTRY_FILE="data/commands/registry.json"
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

if [[ ! -d "$COMMANDS_GLOB_ROOT" ]]; then
    log_error "Packages directory not found: $COMMANDS_GLOB_ROOT"
    exit 1
fi

log_info "Commands Registry Generator"
log_info "=========================="
log_info "Starting commands registry generation..."

GEN_OUT="$(mktemp)"
trap 'rm -f "$GEN_OUT"' EXIT
node > "$GEN_OUT" <<'NODE'
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

// Collect command .md files from every package's commands directory (excluding _template.md).
function collect() {
	const out = [];
	for (const pkg of fs.readdirSync('packages')) {
		const dir = path.join('packages', pkg, 'commands');
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

const commands = {};
const errors = [];
for (const file of collect()) {
	const name = path.basename(file, '.md');
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

	// Stable key order; optional keys included only when present.
	const entry = { name, description: String(fm.description ?? ''), experimental: fm.experimental === true };
	if (fm['argument-hint'] != null) entry['argument-hint'] = String(fm['argument-hint']);
	if (Array.isArray(fm['allowed-tools']) && fm['allowed-tools'].length) entry['allowed-tools'] = fm['allowed-tools'];
	if (fm.dynamic_agent_selection === true) entry.dynamic_agent_selection = true;
	if (fm.fallback_agent != null) entry.fallback_agent = String(fm.fallback_agent);
	if (Array.isArray(fm.agent_selection_criteria) && fm.agent_selection_criteria.length) {
		entry.agent_selection_criteria = fm.agent_selection_criteria;
	}
	entry.model = String(fm.model ?? '');
	entry.agent = String(fm.agent ?? '');

	if (commands[name]) process.stderr.write(`[WARN] Duplicate command name '${name}' from ${file} overrides an earlier definition\n`);
	commands[name] = entry;
}

if (errors.length) {
	process.stderr.write(`Invalid command frontmatter (fix these files):\n  - ${errors.join('\n  - ')}\n`);
	process.exit(1);
}

const sorted = {};
for (const key of Object.keys(commands).sort()) sorted[key] = commands[key];

process.stdout.write(JSON.stringify({ commands: sorted }, null, '\t') + '\n');
NODE
REGISTRY_JSON="$(cat "$GEN_OUT")"

if ! printf '%s' "$REGISTRY_JSON" | jq . >/dev/null 2>&1; then
    log_error "Generated invalid JSON"
    printf '%s\n' "$REGISTRY_JSON" | head -20
    exit 1
fi
log_success "Generated valid JSON ($(printf '%s' "$REGISTRY_JSON" | jq '.commands | length') commands)"

if [[ "$DRY_RUN" == true ]]; then
    printf '%s' "$REGISTRY_JSON"
else
    printf '%s' "$REGISTRY_JSON" > "$REGISTRY_FILE"
    log_success "Commands registry written to $REGISTRY_FILE"
fi
