# Dry Run Mode

Preview what a command would do without making any changes.

## Usage

Add `-n` or `--dry-run` to any command:

```bash
valora implement "Add user authentication" --dry-run
valora implement "Add user authentication" -n
valora plan "Refactor auth module" -n --model=claude-sonnet-4.6
```

## Output

```
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

## File operation icons

| Icon | Label      | Description                                 |
| ---- | ---------- | ------------------------------------------- |
| `+`  | `[CREATE]` | New file would be created                   |
| `~`  | `[MODIFY]` | Existing file would be modified             |
| `-`  | `[DELETE]` | File would be deleted                       |
| `!`  | `[ERROR]`  | Operation would fail (e.g., file not found) |

## Configuration

```bash
valora config set defaults.dry_run false
valora config set defaults.dry_run_show_diffs true
valora config set defaults.dry_run_estimate_tokens true

# Or via environment variable
export AI_DRY_RUN=true
```

---

<details>
<summary><strong>How dry run works internally</strong></summary>

When dry-run mode is enabled:

1. **LLM receives tools** — the model receives all available tools and makes tool calls as normal
2. **Read-only tools execute** — `read_file`, `list_dir`, `glob_file_search`, `grep`, `codebase_search`, `query_session` run normally
3. **State-changing tools are simulated** — `write`, `search_replace`, `delete_file`, `run_terminal_cmd`, `web_search`, `mcp_tool_call` are intercepted and shown but not executed
4. **Summary displayed** — after execution, a detailed preview is shown

**Limitations**:

- Token estimates are approximate (based on character count heuristics, not actual tokenisation)
- Read-only tools still execute — file reads and searches still happen
- External API calls are simulated — they show what would happen but don't execute
- AI behaviour may vary — actual execution may differ if the model makes different decisions on a second run

</details>

<details>
<summary><strong>Common dry run scenarios</strong></summary>

**Preview before implementation**:

```bash
valora implement "Add feature X" --dry-run
# If satisfied, run for real:
valora implement "Add feature X"
```

**Estimate costs before large context operations**:

```bash
valora gather-knowledge --scope=project --depth=deep --dry-run
```

**Debug tool call behaviour**:

```bash
valora plan "Complex task" --dry-run --verbose
```

**Check multi-stage pipelines**:

```bash
valora generate-docs --domain=all --dry-run
```

</details>
