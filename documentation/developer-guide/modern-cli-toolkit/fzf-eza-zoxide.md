# fzf, eza, and zoxide reference

## fzf — fuzzy finder

### Why fzf for agents

fzf is a general-purpose fuzzy finder. For agents, its value is in non-interactive pipe mode: filtering large candidate lists down to best matches without dumping everything into context.

### Essential patterns

```bash
# Non-interactive mode (agent-friendly — no TUI)
# Use --filter for exact prefix/substring matching
echo -e "foo\nbar\nbaz\nfoobar" | fzf --filter 'foo'
# Output: foo, foobar

# Fuzzy match with scoring (returns best match first)
fd -e ts | fzf --filter 'compnnt'  # Fuzzy matches 'component'

# With preview (only useful in interactive contexts)
fd -e ts | fzf --preview 'head -20 {}'

# Select top N results
fd -e ts | fzf --filter 'hook' | head -5

# Combine with rg for file selection
rg -l 'useState' src/ | fzf --filter 'form'
```

### Pipeline patterns for agents

```bash
# Find the most likely config file
fd -g '*.config.*' | fzf --filter 'jest'
# → jest.config.ts (if it exists)

# Find test file for a given source file
fd -g '*.test.ts' -g '*.spec.ts' | fzf --filter 'UserService'

# Disambiguate files with similar names
fd 'index' src/ | fzf --filter 'components'
# → src/components/index.ts
```

### Flags reference (agent-relevant subset)

| Flag             | Purpose                           | Example                       |
| ---------------- | --------------------------------- | ----------------------------- |
| `--filter QUERY` | Non-interactive fuzzy match       | `fzf --filter 'query'`        |
| `--exact`        | Exact substring match (not fuzzy) | `fzf --exact --filter 'test'` |
| `--select-1`     | Auto-select if single match       | `fzf --select-1`              |
| `--exit-0`       | Exit 0 if no match (don't block)  | `fzf --exit-0`                |
| `-1`             | Shorthand for `--select-1`        |                               |
| `-0`             | Shorthand for `--exit-0`          |                               |
| `--no-sort`      | Preserve input order              |                               |
| `--tac`          | Reverse input order               |                               |

---

## eza — modern ls

### Why eza over ls for agents

1. **Tree view** built in — no need for the `tree` command
2. **Git-aware** — shows file status (modified, staged, untracked)
3. **Structured output** — cleaner, more consistent format
4. **Smarter defaults** — human-readable sizes, colour-coded types

### Essential patterns

```bash
# Basic listing (replaces ls -la)
eza -la

# Tree view (replaces tree command)
eza --tree --level=2
eza --tree --level=3 -I 'node_modules|.git|dist'

# Git-aware listing
eza -la --git                      # Show git status per file
eza --tree --level=2 --git         # Tree with git status

# Sort options
eza -la --sort=modified            # Most recently modified last
eza -la --sort=size                # By size
eza -la --sort=name                # Alphabetical (default)
eza -la -r --sort=modified         # Most recently modified first

# Filter by type
eza -la --only-dirs                # Directories only
eza -la --only-files               # Files only

# Long format with specific columns
eza -l --no-user --no-permissions --sort=modified  # Compact listing

# File size details
eza -la --total-size               # Show directory sizes

# Combine with grep for filtering
eza -la | grep '\.ts$'            # TypeScript files only
eza --tree --level=2 -I 'node_modules|.git' --only-dirs  # Directory structure
```

### Agent-optimised patterns

```bash
# Quick project structure overview (great for context gathering)
eza --tree --level=2 -I 'node_modules|.git|dist|coverage|.next|build|__pycache__' --only-dirs

# Find recently modified files
eza -la --sort=modified -r | head -20

# Git status overview
eza -la --git --git-ignore | grep -E '^\s*(M|N|I)'

# One file per line, names only (for piping)
eza -1                              # Filenames only, one per line
eza -1a                             # Including hidden
```

### Flags reference

| Flag               | Purpose                               | Example                  |
| ------------------ | ------------------------------------- | ------------------------ |
| `-l`               | Long format                           | `eza -l`                 |
| `-a`               | Show hidden files                     | `eza -la`                |
| `-1`               | One file per line                     | `eza -1`                 |
| `--tree`           | Tree view                             | `eza --tree`             |
| `--level=N`        | Tree depth                            | `eza --tree --level=3`   |
| `-I GLOB`          | Ignore glob pattern                   | `eza -I 'node_modules'`  |
| `--git`            | Show git status                       | `eza -la --git`          |
| `--git-ignore`     | Respect .gitignore                    | `eza --git-ignore`       |
| `--sort=FIELD`     | Sort: name, size, modified, extension | `eza --sort=modified`    |
| `-r`               | Reverse sort order                    | `eza -r --sort=modified` |
| `--only-dirs`      | Show directories only                 | `eza --only-dirs`        |
| `--only-files`     | Show files only                       | `eza --only-files`       |
| `--total-size`     | Calculate directory sizes             | `eza -la --total-size`   |
| `--no-user`        | Hide user column                      | `eza -l --no-user`       |
| `--no-permissions` | Hide permissions column               |                          |
| `--no-time`        | Hide time column                      |                          |
| `--icons`          | Show file type icons                  | `eza --icons`            |

---

## zoxide — smart cd

### Why zoxide for agents

zoxide tracks directory visit frequency and recency. For agents, its value is jumping directly to a project directory without knowing the exact path — useful when the agent needs to navigate between projects.

**Important**: zoxide learns from usage. On a fresh system with no history, it falls back to substring matching on known paths. It becomes more useful over time as it builds a frequency database.

### Essential patterns

```bash
# Initialise (add to shell profile for persistent use)
eval "$(zoxide init bash)"        # Bash
eval "$(zoxide init zsh)"         # Zsh

# Navigate (replaces cd)
z project-name                     # Jump to best match
z src components                   # Multiple keywords narrow the match
z ~/repos/my-app                   # Exact paths still work

# Query without navigating (agent-friendly — just get the path)
zoxide query project-name          # Print the best matching path
zoxide query -l project            # List all matches with scores
zoxide query -ls project           # List matches sorted by score

# Add a directory to the database manually
zoxide add /home/user/repos/my-app

# Remove a directory from the database
zoxide remove /home/user/repos/old-project

# Interactive selection (requires fzf)
zi project                         # Opens fzf to pick from matches
```

### Agent-specific usage

For agents that don't maintain shell state across commands, `zoxide query` is more useful than `z` (which changes the shell's working directory):

```bash
# Get the path, then use it explicitly
PROJECT_DIR=$(zoxide query my-app)
rg 'TODO' "$PROJECT_DIR/src/"
fd -e ts . "$PROJECT_DIR/src/"

# List all tracked directories
zoxide query -l --all
```

### Flags reference

| Command                 | Purpose                      | Example                   |
| ----------------------- | ---------------------------- | ------------------------- |
| `z KEYWORDS`            | Navigate to best match       | `z my-proj`               |
| `zi KEYWORDS`           | Interactive selection (fzf)  | `zi proj`                 |
| `zoxide query KEYWORDS` | Print best match path        | `zoxide query proj`       |
| `zoxide query -l`       | List all matches             | `zoxide query -l proj`    |
| `zoxide query -ls`      | List matches sorted by score | `zoxide query -ls proj`   |
| `zoxide add PATH`       | Add directory to database    | `zoxide add /path/to/dir` |
| `zoxide remove PATH`    | Remove from database         | `zoxide remove /path`     |
| `zoxide query --all`    | List entire database         | `zoxide query -l --all`   |
