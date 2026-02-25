# lazygit reference

## Why lazygit for agents

lazygit is a terminal UI for Git. For agents, its primary value is reducing multi-command Git workflows to fewer operations. However, being a TUI (terminal user interface), it is most useful in interactive contexts. For non-interactive agent workflows, lazygit's CLI flags and the underlying Git commands with structured output are often more practical.

**Agent guidance**: Prefer `lazygit` when the task involves complex, multi-step Git operations that would otherwise require 5+ individual Git commands. For simple operations (status, diff, log), direct Git commands with structured output are more token-efficient.

## When to use lazygit vs direct Git

| Scenario                          | Recommendation          |
| --------------------------------- | ----------------------- |
| Quick status check                | `git status -s`         |
| View recent commits               | `git log --oneline -20` |
| Simple diff                       | `git diff --stat`       |
| Interactive rebase                | `lazygit`               |
| Cherry-pick across branches       | `lazygit`               |
| Complex merge conflict resolution | `lazygit`               |
| Staging specific hunks            | `lazygit`               |
| Managing multiple stashes         | `lazygit`               |
| Reviewing and amending commits    | `lazygit`               |

## CLI usage (non-interactive)

```bash
# Open lazygit in a specific repo
lazygit -p /path/to/repo

# Open with a specific log filter
lazygit log

# Open with specific subcommand
lazygit branch
lazygit stash

# Use a specific config
lazygit -ucf /path/to/config.yml
```

## Structured Git alternatives for agents

When lazygit's TUI isn't appropriate, these Git commands provide structured output that agents can process efficiently:

```bash
# Status (machine-readable)
git status --porcelain=v2

# Log with structured format
git log --oneline --graph --decorate -20
git log --format='%H|%an|%ae|%s|%ci' -20  # Pipe-delimited for parsing
git log --format='{%n  "hash": "%H",%n  "author": "%an",%n  "subject": "%s",%n  "date": "%ci"%n},' -10  # JSON-ish

# Diff statistics
git diff --stat
git diff --numstat                          # Machine-readable: added, deleted, file
git diff --name-status                      # Status per file: M/A/D/R

# Branch info
git branch -vv --format='%(refname:short)|%(upstream:short)|%(upstream:track)'
git for-each-ref --sort=-committerdate --format='%(refname:short) %(committerdate:relative) %(subject)' refs/heads/ | head -10

# Stash list
git stash list --format='%gd|%gs|%ci'

# File history
git log --follow --oneline -- path/to/file
git log --follow --format='%H|%s|%ci' -- path/to/file

# Blame (structured)
git blame --line-porcelain path/to/file | grep -E '^(author |summary |filename )'
```

## lazygit configuration for agent workflows

If using lazygit in an automated context, a minimal config can disable confirmations:

```yaml
# ~/.config/lazygit/config.yml
gui:
  showCommandLog: true
  showIcons: false
git:
  autoFetch: false
  paging:
    useConfig: false
confirmOnQuit: false
```

## Common Git workflow recipes (no TUI needed)

```bash
# Interactive-style staging without TUI
git add -p                                  # Hunk-by-hunk staging

# Amend last commit message
git commit --amend -m "new message"

# Squash last N commits
git rebase -i HEAD~N

# Cherry-pick a range
git cherry-pick start_hash..end_hash

# Find which commit introduced a bug
git bisect start
git bisect bad HEAD
git bisect good v1.0.0
# Then: git bisect run ./test-script.sh

# Clean up merged branches
git branch --merged main | grep -v main | xargs git branch -d
```
