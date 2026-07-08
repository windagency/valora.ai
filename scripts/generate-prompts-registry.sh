#!/bin/bash

# Prompts Registry Generator
# Generates data/prompts/registry.json from prompt .md files.
#
# The frontmatter is parsed with a real YAML parser (the repo's `yaml` package,
# via Node) and serialised with JSON.stringify, so the output is always valid
# JSON regardless of quotes, commas, colons or backslashes in field values.
# (The previous hand-rolled sed/regex assembler produced invalid JSON whenever a
# value contained a JSON-significant character.)
#
# Usage: ./generate-prompts-registry.sh [--dry-run]

set -euo pipefail

# Configuration
PROMPTS_DIR="data/prompts"
REGISTRY_FILE="${PROMPTS_DIR}/registry.json"
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

# Check if we're in dry-run mode
DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    log_info "Running in dry-run mode"
fi

cd "$PROJECT_ROOT"

if [[ ! -d "$PROMPTS_DIR" ]]; then
    log_error "Prompts directory not found: $PROMPTS_DIR"
    exit 1
fi

log_info "Prompts Registry Generator"
log_info "========================="
log_info "Starting prompts registry generation..."

# Build the registry JSON with Node + the `yaml` package (guaranteed-valid JSON).
# The script reads all prompt .md files, parses their YAML frontmatter, and emits
# { "prompts": { "<id>": { ... } } } sorted by id, tab-indented.
REGISTRY_JSON="$(PROMPTS_DIR="$PROMPTS_DIR" node <<'NODE'
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const promptsDir = process.env.PROMPTS_DIR;

/** Recursively collect prompt .md files, skipping underscore dirs (_meta, _shared) and _template.md. */
function collect(dir) {
	const out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name.startsWith('_')) continue;
			out.push(...collect(full));
		} else if (entry.name.endsWith('.md') && entry.name !== '_template.md') {
			out.push(full);
		}
	}
	return out;
}

function parseFrontmatter(content) {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return null;
	return YAML.parse(match[1]) ?? {};
}

const prompts = {};
const errors = [];
for (const file of collect(promptsDir)) {
	const rel = path.relative(promptsDir, file).replace(/\.md$/, '');
	const id = rel.split(path.sep).join('.');
	let fm;
	try {
		fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
	} catch (err) {
		// Report the offending file precisely instead of crashing the whole run.
		errors.push(`${file}: ${err.message.split('\n')[0]}`);
		continue;
	}
	if (!fm) {
		process.stderr.write(`[WARN] No frontmatter found in ${file}\n`);
		continue;
	}

	// Build the entry with a stable key order; include optional keys only when present.
	const entry = {
		id,
		version: String(fm.version ?? ''),
		category: String(fm.category ?? ''),
		experimental: fm.experimental === true,
		name: String(fm.name ?? ''),
		description: String(fm.description ?? '')
	};
	if (Array.isArray(fm.tags) && fm.tags.length) entry.tags = fm.tags;
	if (Array.isArray(fm.agents) && fm.agents.length) entry.agents = fm.agents;
	if (Array.isArray(fm.outputs) && fm.outputs.length) entry.outputs = fm.outputs;
	if (fm.model_requirements != null) entry.model_requirements = fm.model_requirements;
	if (fm.dependencies != null) entry.dependencies = fm.dependencies;
	if (fm.inputs !== undefined) entry.inputs = fm.inputs;

	prompts[id] = entry;
}

if (errors.length) {
	process.stderr.write(`Invalid prompt frontmatter (fix these files):\n  - ${errors.join('\n  - ')}\n`);
	process.exit(1);
}

const sorted = {};
for (const key of Object.keys(prompts).sort()) sorted[key] = prompts[key];

process.stdout.write(JSON.stringify({ prompts: sorted }, null, '\t') + '\n');
NODE
)"

# Defensive validation (Node already guarantees valid JSON, but keep parity with prior behaviour).
if ! printf '%s' "$REGISTRY_JSON" | jq . >/dev/null 2>&1; then
    log_error "Generated invalid JSON"
    printf '%s\n' "$REGISTRY_JSON" | head -20
    exit 1
fi
log_success "Generated valid JSON ($(printf '%s' "$REGISTRY_JSON" | jq '.prompts | length') prompts)"

if [[ "$DRY_RUN" == true ]]; then
    printf '%s' "$REGISTRY_JSON"
else
    printf '%s' "$REGISTRY_JSON" > "$REGISTRY_FILE"
    log_success "Prompts registry written to $REGISTRY_FILE"
fi
