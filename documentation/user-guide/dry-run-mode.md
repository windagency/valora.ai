# Dry Run Mode

> Preview what commands would do without making any changes.

## Overview

Dry-run mode allows you to see exactly what changes a command would make before actually executing them. This is invaluable for:

- **Safety**: Preview file modifications before committing to them
- **Understanding**: See what tools the AI will use and what operations it will perform
- **Cost Estimation**: Get estimated token usage and API costs
- **Debugging**: Understand why a command behaves a certain way

## Usage

### Basic Usage

Add the `-n` or `--dry-run` flag to any command:

```bash
valora implement "Add user authentication" --dry-run
valora implement "Add user authentication" -n
```

### With Other Flags

Dry-run mode works with all other flags:

```bash
valora implement --dry-run --agent=@software-engineer-typescript-backend
valora plan "Refactor auth module" -n --model=claude-sonnet-4.5
```

## What Happens in Dry Run Mode

When dry-run mode is enabled:

1. **LLM Receives Tools**: The AI model receives all available tools and makes tool calls as normal
2. **Read-Only Tools Execute**: Tools that only read data execute normally:
   - `read_file`
   - `list_dir`
   - `glob_file_search`
   - `grep`
   - `codebase_search`
   - `query_session`
3. **State-Changing Tools Are Simulated**: Tools that modify state are intercepted:
   - `write` - Simulates file creation/modification with diff preview
   - `search_replace` - Simulates text replacement with diff preview
   - `delete_file` - Simulates file deletion
   - `run_terminal_cmd` - Shows command that would be executed
   - `web_search` - Shows search query that would be performed
   - `mcp_tool_call` - Shows MCP tool that would be called
4. **Comprehensive Summary Displayed**: After execution, you see a detailed preview

## Output Format

A typical dry-run output looks like this:

```plaintext
============================================================
DRY RUN SUMMARY - No changes made
============================================================

File Operations (3):
  + [CREATE] src/auth/user-service.ts (+45 lines)
  ~ [MODIFY] src/config/index.ts (+8 -2)
  - [DELETE] src/deprecated/old-auth.ts

Diff Preview:
------------------------------------------------------------
 src/config/index.ts
------------------------------------------------------------
--- a/src/config/index.ts
+++ b/src/config/index.ts
@@ -10,6 +10,14 @@
 export const config = {
   api: {
     baseUrl: process.env.API_URL,
+    auth: {
+      provider: 'jwt',
+      secret: process.env.JWT_SECRET,
+      expiresIn: '7d'
+    }
   }
 };

Terminal Commands (2):
  $ npm install jsonwebtoken
  $ npm run build

Estimated Token Usage:
  Prompt:     ~12,450
  Completion: ~3,200
  Total:      ~15,650
  Cost:       $0.47 USD

============================================================
Run without --dry-run to execute these changes.
============================================================
```

## Understanding the Output

### File Operations

| Icon | Label      | Description                                 |
| ---- | ---------- | ------------------------------------------- |
| `+`  | `[CREATE]` | New file would be created                   |
| `~`  | `[MODIFY]` | Existing file would be modified             |
| `-`  | `[DELETE]` | File would be deleted                       |
| `!`  | `[ERROR]`  | Operation would fail (e.g., file not found) |

### Diff Preview

The diff shows exactly what changes would be made to each file:

- Lines starting with `+` (green) are additions
- Lines starting with `-` (red) are deletions
- Lines starting with `@@` show the location in the file
- Context lines (no prefix) show surrounding code

### Terminal Commands

Lists shell commands that would be executed, shown with a `$` prefix:

```bash
pnpm add axios
pnpm run lint
```

### Token Estimates

Approximate token usage and cost estimates based on the model being used:

- **Prompt**: Tokens in the input (system prompt + messages + context)
- **Completion**: Estimated tokens in the response
- **Total**: Sum of prompt and completion
- **Cost**: Estimated API cost in USD

## Configuration

### Default Settings

Configure dry-run defaults in your config:

```bash
valora config set defaults.dry_run false            # Default dry-run mode (off)
valora config set defaults.dry_run_show_diffs true  # Show diff previews
valora config set defaults.dry_run_estimate_tokens true  # Show token estimates
```

### Environment Variables

You can also use environment variables:

```bash
export AI_DRY_RUN=true  # Enable dry-run by default
```

## Best Practices

### 1. Preview Before Implementation

Always preview implementation commands first:

```bash
# Preview what implement will do
valora implement "Add feature X" --dry-run

# If satisfied, run for real
valora implement "Add feature X"
```

### 2. Check Complex Operations

For multi-stage pipelines or complex commands:

```bash
valora generate-docs --domain=all --dry-run
```

### 3. Estimate Costs

Before running expensive operations with large contexts:

```bash
valora gather-knowledge --scope=project --depth=deep --dry-run
```

### 4. Debug Tool Calls

Understand what tools the AI is using:

```bash
valora plan "Complex task" --dry-run --verbose
```

## Limitations

1. **Token estimates are approximate**: Based on character count heuristics, not actual tokenisation
2. **Read-only tools execute**: File reads and searches still happen (but don't modify anything)
3. **External API calls are simulated**: Web searches and MCP calls show what would happen but don't execute
4. **AI behaviour may vary**: The actual execution may differ if the AI makes different decisions

## Troubleshooting

### No Operations Shown

If the summary shows no operations, the command may:

- Only perform read operations
- Have completed analysis without needing tools
- Be waiting for user input

### Unexpected Diffs

If diffs look incorrect:

- Ensure you're on the correct branch
- Check if files have uncommitted changes
- Verify the working directory

### High Token Estimates

If estimates seem high:

- The context window may include large files
- Consider using `--scope` or `--depth` flags to limit context

## Related Documentation

- [Commands Reference](./commands.md) - Full command reference
- [Workflows](./workflows.md) - Common workflow patterns
- [Quick Start](./quick-start.md) - Getting started guide
