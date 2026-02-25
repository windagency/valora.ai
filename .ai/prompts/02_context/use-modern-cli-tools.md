---
id: context.use-modern-cli-tools
version: 1.0.0
category: context
experimental: true
name: Use Modern CLI Tools
description: Replace legacy CLI commands (grep, find, cat, ls, cd, git) with modern alternatives that cut agent token usage by up to 90%
tags:
  - cli
  - tooling
  - token-efficiency
  - search
  - parsing
model_requirements:
  min_context: 8192
  recommended:
    - claude-sonnet-4.5
    - claude-haiku-4.5
agents:
  - lead
  - platform-engineer
  - software-engineer-typescript
  - software-engineer-typescript-backend
  - software-engineer-typescript-frontend
  - software-engineer-typescript-frontend-react
dependencies:
  requires: []
inputs: []
tokens:
  avg: 1500
  max: 3000
  min: 800
---

# CRITICAL FILE READING POLICY - READ THIS FIRST

## STOP: Before Making ANY Tool Calls

**You are REQUIRED to follow these rules for ALL file reading operations:**

### RULE 1: NEVER use `read_file` for files >100 lines
- PRD.md, BACKLOG.md, FUNCTIONAL.md are typically 150-500 lines
- Using `read_file` on these files WASTES 80-90% of your context window
- You MUST use `run_terminal_cmd` with `rg` instead

### RULE 2: NEVER use `read_file` for JSON/YAML/TOML/XML files
- package.json, tsconfig.json, docker-compose.yml, etc.
- ALWAYS use `jq` for JSON, `yq` for YAML via `run_terminal_cmd`
- No exceptions for file size

### RULE 3: CHECK FILE SIZE FIRST
- Use `wc -l filename` to check line count before reading
- If >100 lines, use selective extraction with `rg`, `jq`, or `yq`

### MANDATORY TOOL SELECTION TABLE

**You MUST use this table for EVERY file read operation:**

| File | Size | REQUIRED Tool | Command Example |
|------|------|---------------|-----------------|
| PRD.md | 150-500 lines | `rg` via `run_terminal_cmd` | `run_terminal_cmd("rg '^## ' knowledge-base/PRD.md")` then `run_terminal_cmd("rg -A 50 '^## Functional Requirements' knowledge-base/PRD.md")` |
| BACKLOG.md | 200-1000 lines | `rg` via `run_terminal_cmd` | `run_terminal_cmd("rg -A 5 '^### INFRA001' knowledge-base/BACKLOG.md")` |
| FUNCTIONAL.md | 100-300 lines | `rg` via `run_terminal_cmd` | `run_terminal_cmd("rg '^##' knowledge-base/FUNCTIONAL.md")` then extract sections |
| package.json | Any size | `jq` via `run_terminal_cmd` | `run_terminal_cmd("jq '{name, version, dependencies: .dependencies \| keys}' package.json")` |
| tsconfig.json | Any size | `jq` via `run_terminal_cmd` | `run_terminal_cmd("jq '.compilerOptions' tsconfig.json")` |
| docker-compose.yml | Any size | `yq` via `run_terminal_cmd` | `run_terminal_cmd("yq '.services \| keys' docker-compose.yml")` |
| *.log files | Any size | `tail`/`rg` via `run_terminal_cmd` | `run_terminal_cmd("tail -100 app.log")` |

### TOKEN WASTE EXAMPLES - DO NOT DO THIS

❌ **WRONG** (wastes 800 tokens):
```
read_file("knowledge-base/PRD.md")  # 196 lines → 800 tokens
```

✅ **CORRECT** (uses 150 tokens):
```
run_terminal_cmd("rg '^## ' knowledge-base/PRD.md")  # Get structure → 40 tokens
run_terminal_cmd("rg -A 50 '^## Functional Requirements' knowledge-base/PRD.md")  # Get section → 110 tokens
```

**Savings: 81% fewer tokens = More context for your actual work**

---

# Use Modern CLI Tools - Comprehensive Guide

---

## Why Modern CLI Tools

Legacy CLI tools (`grep`, `find`, `cat`, `ls`, `cd`) were designed for human terminals, not AI agents. They produce verbose, unstructured output that wastes context window tokens. Modern replacements output structured data, respect `.gitignore` by default, and run significantly faster on large codebases.

The token savings are substantial: a single `jq` expression replaces what would otherwise require `cat` followed by multi-line manual parsing in the agent's reasoning -- roughly 90% fewer tokens for JSON reads. Similar gains apply across the entire toolkit.

## Tool Inventory

| Legacy Built-in Tool | Modern CLI Tool | Use Via | Key advantage for agents |
|---------------------|-----------------|---------|--------------------------|
| `grep` tool | `rg` (ripgrep) | `run_terminal_cmd` | `.gitignore`-aware, 60-80% fewer tokens, structured JSON output |
| `glob_file_search` tool | `fd` | `run_terminal_cmd` | Smart defaults, 5-10x faster, `.gitignore`-aware |
| `read_file` (for JSON/YAML) | `jq` / `yq` | `run_terminal_cmd` | Direct field extraction, 85-95% fewer tokens |
| `read_file` (for large files) | `rg` | `run_terminal_cmd` | Selective section extraction, 80-90% fewer tokens |
| `ls` command | `eza` | `run_terminal_cmd` | Tree view, Git status, structured output |
| `cd` command | `zoxide` | `run_terminal_cmd` | Frequency-ranked smart navigation |
| manual search | `fzf` | `run_terminal_cmd` | Fuzzy matching, pipe-friendly, preview |
| multi-step `git` | `lazygit` | `run_terminal_cmd` | TUI for complex Git workflows |

Read the reference file at `.ai/documentation/developer-guide/modern-cli-toolkit/` for detailed flags, patterns, and examples for each tool. Only read the references relevant to the current task:

- **`rg-fd.md`** -- ripgrep and fd for search and file discovery
- **`jq-yq.md`** -- jq and yq for JSON/YAML parsing
- **`fzf-eza-zoxide.md`** -- fzf, eza, and zoxide for navigation and selection
- **`lazygit.md`** -- lazygit for Git workflows

## Synergy Patterns

These are composable workflows that combine multiple tools. Each synergy is a recipe -- use the one that matches the task shape. Synergies are where the real agent efficiency gains live: instead of multiple sequential tool calls with manual parsing between them, a single pipeline produces exactly the data needed.

### 1. Smart File Reading -- Choose the right read strategy

**When**: You need to access file contents via LLM tools.
**Critical Rule**: Prefer `run_terminal_cmd` with modern tools over `read_file` for large/structured files.

```bash
# ❌ ANTI-PATTERN: read_file for structured data
read_file("package.json")  # → 500 lines in context, agent parses mentally

# ✅ CORRECT: Extract only what you need via run_terminal_cmd
run_terminal_cmd("jq '.name, .version, .dependencies | keys' package.json")  # → 10 lines

# ❌ ANTI-PATTERN: read_file for large source files
read_file("src/services/large-file.ts")  # → 2000 lines

# ✅ CORRECT: Search with context
run_terminal_cmd("rg -A 10 -B 5 'class AuthService' src/services/large-file.ts")  # → 15 lines

# ❌ ANTI-PATTERN: read_file for logs
read_file("application.log")  # → 10000 lines

# ✅ CORRECT: Recent entries only
run_terminal_cmd("tail -100 application.log")  # → 100 lines
run_terminal_cmd("rg 'ERROR|FATAL' application.log | tail -50")  # → 50 lines

# ✅ SAFE: read_file is fine for small files
read_file("README.md")  # 50 lines - acceptable
```

### 2. jq/yq Structured Extraction -- 90% fewer tokens on config reads

**When**: Agent needs to read specific fields from a JSON or YAML file.
**Instead of**: `cat file.json` or `read_file` then agent parses mentally.
**Do**:

```bash
# JSON: extract specific fields
jq '.name, .version, .dependencies | keys' package.json

# YAML: extract specific paths
yq '.spec.replicas' deployment.yaml
yq '.services.*.image' docker-compose.yml

# Get just the keys/schema of a config
jq 'keys' config.json
yq '. | keys' application.yml
```

### 3. Universal Config Parsing -- auto-detect format

**When**: Agent needs to read config files regardless of format.

```bash
parse_config() {
  local file="$1" query="$2"
  case "$file" in
    *.json) jq "$query" "$file" ;;
    *.yaml|*.yml) yq "$query" "$file" ;;
    *.toml) yq -p=toml "$query" "$file" ;;
    *.xml) yq -p=xml "$query" "$file" ;;
    *) echo "Unknown format: $file" >&2; return 1 ;;
  esac
}
```

### 4. Batch Audit -- fd + jq/yq without individual reads

**When**: Agent needs to audit multiple config files across a project.
**Instead of**: `find` then `cat` each file then manual parsing.
**Do**:

```bash
# Find all Kubernetes deployments missing resource limits
fd -e yaml -e yml . k8s/ --exec sh -c '
  result=$(yq ".spec.template.spec.containers[] | select(.resources == null) | .name" "$1" 2>/dev/null)
  [ -n "$result" ] && echo "$1: $result"
' _ {}

# Audit all package.json files for a specific dependency
fd -g 'package.json' --type f --exec sh -c '
  ver=$(jq -r ".dependencies[\"typescript\"] // .devDependencies[\"typescript\"] // empty" "$1" 2>/dev/null)
  [ -n "$ver" ] && echo "$1: typescript@$ver"
' _ {}
```

### 5. Triple Search -- structural + textual + semantic

**When**: Agent needs to find something but does not know exactly where or how it is expressed.

```bash
# Layer 1 - Structural (fd): narrow filesystem scope
fd -e ts -e tsx . src/

# Layer 2 - Textual (rg): search within structural results
fd -e ts -e tsx . src/ | xargs rg 'useEffect|useState' -l

# Layer 3 - Semantic: agent interprets the narrowed results
rg 'useEffect' src/components/ -C 3 --json | jq -r '
  select(.type == "match") |
  "\(.data.path.text):\(.data.line_number): \(.data.lines.text)"
'
```

### 6. Hybrid Search -- rg structured output + agent interpretation

**When**: Agent needs to find code patterns expressed differently across a codebase.

```bash
# Find all error handling patterns
rg '(try\s*\{|\.catch\(|Result<|Err\()' src/ --json | jq -r '
  select(.type == "match") |
  "\(.data.path.text):\(.data.line_number)"
' | head -30

# Find API endpoints across frameworks
rg '(@(Get|Post|Put|Delete|Patch)|router\.(get|post|put|delete)|app\.(get|post|put|delete))' \
  src/ -n --heading
```

### 7. Git Structured Output -- machine-readable Git data

**When**: Agent needs Git information for processing.

```bash
# Machine-readable status
git status --porcelain=v2

# Structured log
git log --format='%H|%an|%ae|%s|%ci' -20

# Diff statistics
git diff --numstat
git diff --name-status
```

## Decision Matrix

| Task shape | Tool(s) | Example |
|------------|---------|---------|
| Read small file (<100 lines) | `read_file` | `read_file("README.md")` |
| Read a field from JSON | `run_terminal_cmd` + `jq` | `run_terminal_cmd("jq '.version' package.json")` |
| Read a field from YAML | `run_terminal_cmd` + `yq` | `run_terminal_cmd("yq '.image.tag' values.yaml")` |
| Read large file (>100 lines) | `run_terminal_cmd` + `rg`/`head`/`tail` | `run_terminal_cmd("rg -C 10 'pattern' file.ts")` |
| Read recent log entries | `run_terminal_cmd` + `tail` | `run_terminal_cmd("tail -100 app.log")` |
| Find files by name/extension | `fd` | `fd -e ts . src/` |
| Search file contents | `rg` | `rg 'TODO' src/` |
| List directory contents | `eza` | `eza -la --git --tree --level=2` |
| Navigate to a project | `zoxide` | `zoxide query project-name` |
| Select from candidates | `fzf` | `fd -e ts \| fzf` |
| Complex Git operation | `lazygit` | Interactive staging, rebasing |
| Audit configs at scale | `fd` + `jq`/`yq` | Batch audit synergy |
| Find code, unknown location | `fd` + `rg` | Triple search synergy |
| Parse any config format | `jq`/`yq` auto-detect | Universal config synergy |

## Tool Selection for File Reading

**CRITICAL**: When you need to read file contents, choose the right tool based on file type and size. The `read_file` tool reads entire files into context -- use it sparingly.

### When to use `read_file` (built-in tool)
- ✅ Small files (<100 lines) that need full content
- ✅ Binary files or non-text formats
- ✅ When you truly need the complete file content

### When to use `run_terminal_cmd` with modern tools instead

#### For structured files (JSON/YAML/TOML/XML):
```bash
# ❌ WRONG: read_file("package.json")  →  500+ lines in context
# ✅ RIGHT: Extract only what you need
run_terminal_cmd("jq '.name, .version, .dependencies | keys' package.json")  # ~10 lines

# ❌ WRONG: read_file(".github/workflows/ci.yml")  →  200+ lines
# ✅ RIGHT: Extract specific sections
run_terminal_cmd("yq '.jobs.*.steps[].name' .github/workflows/ci.yml")  # ~20 lines
```

#### For large source files:
```bash
# ❌ WRONG: read_file("src/large-service.ts")  →  2000+ lines
# ✅ RIGHT: Search with context around matches
run_terminal_cmd("rg -A 10 -B 5 'class UserService' src/large-service.ts")  # ~15 lines

# ✅ RIGHT: Read only specific line ranges
run_terminal_cmd("sed -n '100,150p' src/large-service.ts")  # 50 lines
```

#### For log files or sequential data:
```bash
# ❌ WRONG: read_file("application.log")  →  10000+ lines
# ✅ RIGHT: Read recent entries only
run_terminal_cmd("tail -100 application.log")  # 100 lines

# ✅ RIGHT: Read with pattern filtering
run_terminal_cmd("rg 'ERROR|FATAL' application.log | tail -50")  # ~50 lines
```

#### For understanding file structure:
```bash
# ❌ WRONG: read_file("config.json") to find available fields
# ✅ RIGHT: List keys only
run_terminal_cmd("jq 'keys' config.json")  # ~5 lines

# ✅ RIGHT: Get schema/structure
run_terminal_cmd("jq 'paths(scalars) as $p | {($p | join(\".\")): getpath($p) | type}' config.json")
```

### Decision Tree for File Reading

```
Need to read a file?
│
├─ Is it structured (JSON/YAML/TOML/XML)?
│  └─ YES → Use jq/yq via run_terminal_cmd
│  └─ NO  → Continue
│
├─ Is it >100 lines?
│  └─ YES → Use rg/head/tail/sed via run_terminal_cmd
│  └─ NO  → Continue
│
├─ Do you need specific sections only?
│  └─ YES → Use rg with context (-A/-B/-C) via run_terminal_cmd
│  └─ NO  → Use read_file
```

## Anti-Patterns

These patterns waste tokens. Replace them with the modern equivalent.

| Anti-pattern | Tokens wasted | Modern replacement |
|-------------|---------------|-------------------|
| `read_file("large-file.json")` then extract field | ~500-5000 | `run_terminal_cmd("jq '.field' large-file.json")` (~20) |
| `read_file("config.yaml")` for one value | ~200-1000 | `run_terminal_cmd("yq '.key' config.yaml")` (~5) |
| `read_file("*.log")` for recent errors | ~5000-50000 | `run_terminal_cmd("rg 'ERROR' file.log \| tail -50")` (~50) |
| `read_file` then search for pattern in code | ~1000-10000 | `run_terminal_cmd("rg -C 5 'pattern' file.ts")` (~20) |
| `cat file.json` then parse manually | ~500-5000 | `jq '.field' file.json` (~20) |
| `grep -r "pattern" .` (searches node_modules, .git) | ~1000+ | `rg "pattern"` (auto-excludes) |
| `find . -name "*.ts" -type f` | verbose output | `fd -e ts` |
| `ls -la` for tree view | multiple calls | `eza -la --tree --level=2` |
| `cd` then `pwd` then `cd` back | 3 commands | `zoxide query name` |
| Multiple `git log`, `git diff`, `git status` | 3+ commands | `lazygit` (single TUI) |
| `cat config.yaml \| grep "key"` | imprecise | `yq '.key' config.yaml` |

## Token Economy Principles

1. **Prefer run_terminal_cmd over read_file**: For files >100 lines or structured data, use `run_terminal_cmd` with jq/yq/rg/head/tail instead of `read_file`. Reading a 1000-line JSON with `read_file` wastes 990 lines if you only need one field.
2. **Extract, don't dump**: Use `jq`/`yq` to extract only the fields needed. Never `cat` or `read_file` an entire config file into context.
3. **Filter at source**: Use `rg --json` and pipe through `jq` to get structured results. Don't dump raw grep output.
4. **Scope searches**: Use `fd` to narrow the filesystem scope before running `rg`. Two fast commands beat one slow one.
5. **Batch, don't loop**: Use `fd --exec` to process multiple files in one command instead of a shell loop with individual reads.
6. **Structured output**: Prefer `--json` flags (`rg`, `eza`) when the agent needs to process results programmatically.
7. **Read only what you need**: For large files, use line ranges (`sed -n 'X,Yp'`), context (`rg -C N`), or recent lines (`tail -N`) instead of full reads.

## Error Handling

```bash
# Safe extraction with fallback
jq -r '.version // "unknown"' package.json

# Check if a tool is available before using it
command -v rg >/dev/null 2>&1 || { echo "rg not found"; exit 1; }

# yq: handle multi-document YAML safely
yq -e '.spec.replicas' deployment.yaml 2>/dev/null || echo "field not found"
```

## Installation

Before using any tool, verify it is installed. If not, install using the bundled script:

```bash
bash .ai/scripts/install-tools.sh [tool1] [tool2] ...
bash .ai/scripts/install-tools.sh --all
bash .ai/scripts/install-tools.sh --check
```
