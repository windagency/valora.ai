# `@windagency/valora-runtime`

Pure-leaf runtime utilities shared across Valora plugins. Has no host dependencies — safe to consume from any plugin package without pulling in config loading, logger bootstrapping, or other host internals.

This package is itself a built-in Valora plugin (`valora-plugin.json` included) and is declared as a dependency via the `requires` field in other plugins' manifests. When you list it in `requires`, the host wires a `node_modules` symlink so your code can import it directly without any npm install step.

## Installation

```bash
pnpm add @windagency/valora-runtime
```

Or, in your plugin manifest:

```json
{
	"name": "my-plugin",
	"requires": ["valora-runtime"]
}
```

---

## Errors — `BaseError` and `ProviderError`

Use these instead of plain `Error` so the host can inspect error codes and apply the right recovery strategy.

```typescript
import { BaseError, ProviderError } from '@windagency/valora-runtime';

// General plugin error — supply a unique code string
throw new BaseError(
	'Configuration file is missing required field',
	'MISSING_CONFIG_FIELD',
	{ field: 'apiKey' }, // details (optional)
	{ component: 'MyPlugin', operation: 'load' }, // context (optional)
	{ type: 'fail-fast' } // recovery (optional, default: 'manual')
);

// LLM provider error — defaults to retry with 3 attempts, 1 s backoff
throw new ProviderError(
	'Upstream API returned 429 Too Many Requests',
	{ statusCode: 429, retryAfter: 60 },
	{ component: 'MyProvider', operation: 'complete' }
);
```

### `RecoveryStrategy`

| `type`                   | Meaning                                               |
| ------------------------ | ----------------------------------------------------- |
| `'fail-fast'`            | Surface the error immediately; do not retry           |
| `'retry'`                | Retry up to `maxRetries` times with `backoffMs` delay |
| `'graceful-degradation'` | Continue with reduced functionality                   |
| `'manual'`               | Default — no automatic recovery                       |

`ProviderError` defaults to `{ type: 'retry', maxRetries: 3, backoffMs: 1000 }`.

---

## ID generation

All functions use Node.js built-in `crypto.randomBytes` with a URL-safe 64-character alphabet identical to nanoid's default. No external dependencies.

```typescript
import { generateId, generateMemoryId, generateSessionId, generateShortId } from '@windagency/valora-runtime';

generateId(); // 21-character random ID
generateId(8); // 8-character random ID
generateShortId(); // 6-character random ID
generateSessionId(); // 12-character random ID
generateMemoryId(); // 'mem-' + 12-character random ID
generateDecisionId(); // 'decision-' + 12-character random ID
generateInsightId(); // 'insight-' + 12-character random ID
generateExplorationId(); // 'exp-' + 10-character random ID
```

IDs are cryptographically random and URL-safe. They are **not** monotonically increasing and **not** sortable by creation time.

Use `generateMemoryId()` when constructing `MemoryEntry` objects in a custom memory backend.

---

## Logger

```typescript
import { getLogger } from '@windagency/valora-runtime';

const logger = getLogger();

logger.debug('cache populated', { entries: 42 });
logger.info('provider ready');
logger.warn('rate limit approaching', { remaining: 3 });
logger.error('request failed', new Error('timeout'), { url });
```

Before the host boots, `getLogger()` returns a console-based fallback. After boot it returns the host's production logger, which writes structured JSON to a rotating file. You do not need to manage this transition — it is transparent.

> **Do not call `setLoggerImpl()` or `resetLogger()`** from plugin code. These are host-internal functions for bootstrap and test teardown.

---

## Path utilities

Use these instead of hardcoding `~/.valora` so that the `VALORA_GLOBAL_CONFIG_DIR` override works correctly in CI and non-standard installations.

```typescript
import {
	getGlobalConfigDir,
	getProjectConfigDir,
	getProjectPluginsDir,
	getRuntimeDataDir
} from '@windagency/valora-runtime';

// Where to persist plugin-owned data files
const dataDir = getRuntimeDataDir();
// → project's .valora/ if inside a project, otherwise ~/.valora/

// Explicitly project or global
const projectDir = getProjectConfigDir(); // null if not in a Valora project
const globalDir = getGlobalConfigDir(); // ~/.valora  (or VALORA_GLOBAL_CONFIG_DIR)

// The .valora/plugins/ dir for the current project, or null
const pluginsDir = getProjectPluginsDir();
```

### Path functions for plugin authors

| Function                 | Returns                                   | Notes                                       |
| ------------------------ | ----------------------------------------- | ------------------------------------------- |
| `getRuntimeDataDir()`    | Project `.valora/` or global `~/.valora/` | Use this for data files                     |
| `getGlobalConfigDir()`   | `~/.valora/`                              | Respects `VALORA_GLOBAL_CONFIG_DIR` env var |
| `getProjectConfigDir()`  | `.valora/` in project root, or `null`     | `null` outside a project                    |
| `getProjectPluginsDir()` | `.valora/plugins/`, or `null`             | `null` outside a project                    |

> Functions not listed here (`getPackageRoot`, `getPackageDataDir`, `getSystemPluginsDir`, `getValoraVersion`, etc.) are host-internal. Plugin code should not call them.

---

## Safe process execution

Use `SafeExecutor` to shell out to external binaries. Never build shell strings manually — `SafeExecutor` uses `shell: false` to prevent injection.

```typescript
import { CommandExecutionError, SafeExecutor } from '@windagency/valora-runtime';

// General command
const result = await SafeExecutor.execute('ffmpeg', ['-i', inputPath, outputPath], {
	cwd: workDir,
	timeout: 60_000 // milliseconds; default is 30 000
});
console.log(result.stdout);

// Git shortcuts
const log = await SafeExecutor.executeGitSimple(['log', '--oneline', '-5']);

// Check a binary exists before using it
const hasRipgrep = await SafeExecutor.commandExists('rg');
```

`SafeExecutor.execute` rejects with `CommandExecutionError` on non-zero exit:

```typescript
try {
	await SafeExecutor.execute('my-tool', ['--check']);
} catch (err) {
	if (err instanceof CommandExecutionError) {
		console.error(`Exit ${err.exitCode}: ${err.stderr}`);
	}
}
```

### Retry with exponential backoff

```typescript
import { RetryExecutor } from '@windagency/valora-runtime';

const result = await RetryExecutor.withRetry(
	() => callExternalApi(),
	3, // maxRetries (default 3)
	1000 // baseDelay ms (default 1000)
);
```

The backoff formula is `baseDelay × 2^attempt + random(0..1000)` ms. Errors whose message contains `'validation'`, `'invalid'`, `'not found'`, `'already exists'`, `'permission denied'`, or `'access denied'` are treated as non-retriable and surface immediately.

---

## Exports summary

| Module         | Exports                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `error`        | `BaseError`, `ProviderError`, `ErrorContext`, `RecoveryStrategy`                                                                             |
| `id-generator` | `generateId`, `generateShortId`, `generateSessionId`, `generateMemoryId`, `generateDecisionId`, `generateInsightId`, `generateExplorationId` |
| `logger`       | `getLogger`, `Logger` (type)                                                                                                                 |
| `paths`        | `getRuntimeDataDir`, `getGlobalConfigDir`, `getProjectConfigDir`, `getProjectPluginsDir`                                                     |
| `safe-exec`    | `SafeExecutor`, `RetryExecutor`, `CommandExecutionError`, `ExecResult`, `SpawnOptions`                                                       |

All of the above are re-exported from the package root: `import { ... } from '@windagency/valora-runtime'`.
