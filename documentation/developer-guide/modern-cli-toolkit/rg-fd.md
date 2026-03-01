# ripgrep (rg) and fd reference

## rg — ripgrep

### Why rg over grep for agents

1. **Respects `.gitignore`** by default — never wastes tokens searching `node_modules`, `.git`, `dist`, `build`
2. **Structured JSON output** via `--json` — pipe to `jq` for precise extraction
3. **Multi-line search** — finds patterns spanning lines
4. **Faster** — uses parallelism and memory-mapped I/O

### Essential patterns

```bash
# Basic search (replaces grep -r)
rg 'pattern' src/
rg 'TODO|FIXME' .

# Case-insensitive
rg -i 'error' src/

# Whole word match
rg -w 'Error' src/

# Fixed string (no regex interpretation — use for exact matches)
rg -F 'console.log(' src/

# File type filter
rg -t ts 'interface'            # TypeScript files only
rg -t py 'import' -t rust 'use' # Multiple types
rg --type-list                   # See all supported types

# Glob filter
rg 'pattern' -g '*.test.ts'               # Only test files
rg 'pattern' -g '!*.test.ts'              # Exclude test files
rg 'pattern' -g '!{dist,build,coverage}/' # Exclude directories

# Context lines
rg 'useEffect' src/ -C 3         # 3 lines before and after
rg 'useEffect' src/ -B 2 -A 5   # 2 before, 5 after

# Files only (list matching files, no content)
rg -l 'TODO' src/                # Files with matches
rg --files-without-match 'test' src/  # Files WITHOUT matches

# Count matches
rg -c 'console.log' src/        # Count per file
rg -c 'console.log' src/ | awk -F: '{sum+=$2} END{print sum}'  # Total

# Heading mode (grouped by file — easier to read)
rg 'pattern' src/ --heading -n
```

### Structured JSON output for agent processing

This is the most important rg feature for agents — structured output that can be piped to jq for precise extraction.

```bash
# JSON output with jq filtering
rg 'TODO' src/ --json | jq -r '
  select(.type == "match") |
  "\(.data.path.text):\(.data.line_number): \(.data.lines.text | rtrimstr("\n"))"
'

# Extract just file paths with match counts
rg 'pattern' src/ --json | jq -r '
  select(.type == "match") | .data.path.text
' | sort -u

# Extract match details as structured data
rg 'import .* from' src/ --json | jq '
  select(.type == "match") |
  {
    file: .data.path.text,
    line: .data.line_number,
    text: (.data.lines.text | rtrimstr("\n"))
  }
'
```

### Multi-line patterns

```bash
# Multi-line search (e.g., find function definitions with body)
rg -U 'function \w+\([^)]*\)\s*\{[^}]*\}' src/

# Find empty catch blocks
rg -U 'catch\s*\([^)]*\)\s*\{\s*\}' src/

# Find multi-line imports
rg -U 'import \{[^}]+\} from' src/
```

### Replace mode

```bash
# Preview replacements (dry run — prints to stdout)
rg 'old_function' src/ -r 'new_function'

# Actual replacement requires piping or using sed
rg -l 'old_function' src/ | xargs sed -i 's/old_function/new_function/g'
```

### Flags reference

| Flag          | Purpose                      | Example                    |
| ------------- | ---------------------------- | -------------------------- |
| `-i`          | Case-insensitive             | `rg -i 'error'`            |
| `-w`          | Whole word                   | `rg -w 'Error'`            |
| `-F`          | Fixed string (no regex)      | `rg -F 'arr[0]'`           |
| `-l`          | Files with matches only      | `rg -l 'TODO'`             |
| `-c`          | Count matches per file       | `rg -c 'pattern'`          |
| `-n`          | Line numbers (default on)    | `rg -n 'pattern'`          |
| `-C N`        | Context (N lines each side)  | `rg -C 3 'pattern'`        |
| `-B N`        | Before context               | `rg -B 2 'pattern'`        |
| `-A N`        | After context                | `rg -A 5 'pattern'`        |
| `-t TYPE`     | File type filter             | `rg -t ts 'interface'`     |
| `-g GLOB`     | Glob pattern include/exclude | `rg -g '*.test.ts'`        |
| `-U`          | Multi-line mode              | `rg -U 'start.*\n.*end'`   |
| `--json`      | Structured JSON output       | `rg --json 'pattern'`      |
| `--heading`   | Group by file                | `rg --heading 'pattern'`   |
| `--no-ignore` | Don't respect .gitignore     | `rg --no-ignore 'pattern'` |
| `--hidden`    | Search hidden files          | `rg --hidden 'pattern'`    |
| `-r TEXT`     | Replace (stdout only)        | `rg 'old' -r 'new'`        |
| `-e PATTERN`  | Multiple patterns            | `rg -e 'foo' -e 'bar'`     |
| `--stats`     | Show match statistics        | `rg --stats 'pattern'`     |

---

## fd — file finder

### Why fd over find for agents

1. **Smart defaults** — ignores `.git`, `node_modules`, hidden files
2. **Regex by default** — no need for `-regex` flag gymnastics
3. **Parallel execution** — `--exec` runs commands in parallel
4. **Coloured output** and intuitive syntax

### Essential patterns

```bash
# Find by name pattern (regex by default)
fd 'component' src/              # Files matching 'component' anywhere in name
fd '^index\.ts$' src/            # Exact filename match

# Find by extension
fd -e ts                         # All .ts files
fd -e ts -e tsx . src/             # TypeScript + TSX
fd -e yaml -e yml                # YAML files

# Find by type
fd -t f                          # Files only
fd -t d                          # Directories only
fd -t l                          # Symlinks only

# Glob mode (instead of regex)
fd -g '*.test.ts' src/
fd -g 'Dockerfile*'
fd -g '*.{yaml,yml}' k8s/

# Exclude patterns
fd -e ts --exclude 'node_modules' --exclude '*.test.ts'
fd -e ts -E 'dist' -E '__tests__'  # -E is shorthand for --exclude

# Hidden and ignored files
fd -H                            # Include hidden files
fd -I                            # Don't respect .gitignore
fd -HI                           # Include everything

# Full path matching
fd -p 'src/components/.*\.tsx$'

# Size filter
fd -e log --size +10m            # Files larger than 10MB
fd -t f --size -1k               # Files smaller than 1KB

# Modified time
fd -t f --changed-within 1d      # Modified in last day
fd -t f --changed-before 30d     # Older than 30 days
```

### Execution — the power feature

`fd --exec` replaces `find ... -exec` with parallel execution and cleaner syntax.

```bash
# Execute command per file (parallel by default)
fd -e ts --exec wc -l {}         # Line count per TypeScript file

# Execute with placeholder tokens
# {} = full path, {/} = filename, {//} = parent dir, {.} = path without ext, {/.} = filename without ext
fd -e ts --exec echo 'File: {/} in {//}'

# Batch execution (all files as args to one command)
fd -e ts -X wc -l                # Single wc invocation with all files

# Combined with other tools
fd -e yaml k8s/ --exec yq '.kind' {}          # Extract kind from all YAML
fd -g 'package.json' --exec jq '.name' {}     # All package names
fd -e ts --exec rg 'TODO' {}                   # TODOs in TypeScript files

# Delete matching files (careful!)
fd -e log --changed-before 30d --exec rm {}

# Complex exec with shell
fd -e json --exec sh -c '
  name=$(jq -r ".name" "$1" 2>/dev/null)
  [ -n "$name" ] && echo "$1: $name"
' _ {}
```

### Flags reference

| Flag                 | Purpose                                  | Example                  |
| -------------------- | ---------------------------------------- | ------------------------ |
| `-e EXT`             | Extension filter                         | `fd -e ts`               |
| `-t TYPE`            | Type: f(ile), d(ir), l(ink), x(ecutable) | `fd -t f`                |
| `-g`                 | Glob mode (not regex)                    | `fd -g '*.test.ts'`      |
| `-p`                 | Match against full path                  | `fd -p 'src/.*test'`     |
| `-H`                 | Include hidden files                     | `fd -H`                  |
| `-I`                 | Don't respect .gitignore                 | `fd -I`                  |
| `-E PAT`             | Exclude pattern                          | `fd -E 'dist'`           |
| `-d N`               | Max depth                                | `fd -d 2 -t d`           |
| `--size`             | Size filter                              | `fd --size +10m`         |
| `--changed-within`   | Modified within duration                 | `fd --changed-within 2h` |
| `--exec`             | Execute per file (parallel)              | `fd --exec cmd {}`       |
| `-X`                 | Execute batch (one invocation)           | `fd -X cmd`              |
| `-0`                 | Null-separated output                    | `fd -0 \| xargs -0`      |
| `-a`                 | Absolute paths                           | `fd -a -e ts`            |
| `-L`                 | Follow symlinks                          | `fd -L`                  |
| `--strip-cwd-prefix` | Remove `./` prefix                       | Cleaner output           |
