# Plugin Authoring Guide

This guide walks through creating a Valora plugin from scratch, covering every contribution type and the utility packages available to plugin authors.

---

## Contents

1. [Plugin types](#plugin-types)
2. [Plugin scopes and discovery](#plugin-scopes-and-discovery)
3. [The manifest — `valora-plugin.json`](#the-manifest)
4. [Creating a data plugin](#creating-a-data-plugin)
5. [Creating a code plugin](#creating-a-code-plugin)
6. [Contribution types reference](#contribution-types-reference)
   - [CLI subcommands](#cli-subcommands-code--code-exec)
   - [LLM providers](#llm-providers-code--code-exec)
   - [Memory backends](#memory-backends-code--code-exec)
   - [Compression strategies](#compression-strategies-code--code-exec)
   - [Configuration extensions](#configuration-extensions-code--code-exec)
   - [Shell hooks](#shell-hooks-hooks--shell-hooks)
   - [MCP servers](#mcp-servers-mcps--mcp-connect)
   - [Prompts](#prompts-prompts)
   - [Commands](#commands-commands)
   - [Agents](#agents-agents)
   - [Templates](#templates-templates)
   - [Validators](#validators-validators--code-exec)
7. [Plugin dependencies — `requires`](#plugin-dependencies)
8. [Binary requirements — `requiresBinary`](#binary-requirements)
9. [Overriding built-in providers](#overriding-built-in-providers)
10. [Utility packages](#utility-packages)
11. [Testing your plugin](#testing-your-plugin)
12. [Installing and publishing](#installing-and-publishing)
13. [Manifest schema reference](#manifest-schema-reference)

---

## Plugin types

There are two kinds of Valora plugin:

**Data plugins** contribute static assets — JSON configuration files, Markdown prompts, command definitions, agent definitions, template files. They have no TypeScript code and no build step.

**Code plugins** additionally export a `register(api)` function that runs at startup. They install as npm packages, build to `dist/`, and can register CLI subcommands, LLM providers, memory backends, compression strategies, and lifecycle hooks.

Any plugin can mix both: a plugin might contribute prompts (data) _and_ a CLI subcommand (code).

---

## Plugin scopes and discovery

Valora discovers plugins from five locations, listed here in order of loading (last wins on conflicts):

| Scope      | Location                                    | Typical use                                                                 |
| ---------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| `built-in` | `<valora>/data/plugins/`                    | Shipped with Valora itself                                                  |
| `system`   | `/usr/local/share/valora/plugins/`          | Org-wide installation (`VALORA_SYSTEM_PLUGINS_DIR` to override)             |
| `user`     | `~/.valora/plugins/`                        | Personal tools across all projects (`VALORA_GLOBAL_CONFIG_DIR` to override) |
| `project`  | `.valora/plugins/`                          | Project-specific, checked into the repository                               |
| `npm`      | `node_modules/@windagency/valora-plugin-*/` | npm-installed, package name starts with `valora-plugin-` or `valora-core-`  |

A subdirectory is treated as a plugin only when it contains a valid `valora-plugin.json`. Directories without one are silently skipped.

---

## The manifest

Every plugin must have a `valora-plugin.json` at its root. This is the only mandatory file.

```json
{
	"name": "my-plugin",
	"version": "1.0.0",
	"description": "One-line description shown in valora plugin list",
	"engines": { "valora": ">=0.1.0" },
	"contributes": ["code", "commands"],
	"permissions": ["code-exec"],
	"requires": ["valora-runtime"],
	"codeEntrypoint": "dist/index.js"
}
```

### Required fields

| Field     | Format                 | Notes                                                        |
| --------- | ---------------------- | ------------------------------------------------------------ |
| `name`    | `^[a-z0-9][a-z0-9-]*$` | Lowercase kebab-case. Used as the directory name on install. |
| `version` | `major.minor.patch`    | Semver.                                                      |

### Optional fields

| Field            | Type          | Notes                                                                                                                    |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `description`    | string        | Shown in `valora plugin list`.                                                                                           |
| `engines.valora` | semver range  | e.g. `">=0.1.0"`. Plugins that don't satisfy the host version are skipped.                                               |
| `homepage`       | URL           | Shown in `valora plugin info`.                                                                                           |
| `contributes`    | string[]      | Declares what this plugin provides. See [Contribution types](#contribution-types-reference).                             |
| `permissions`    | string[]      | Gates that unlock the corresponding contribution. See below.                                                             |
| `requires`       | string[]      | Plugin names that must be loaded first. The host wires `node_modules` symlinks so code can `import` them.                |
| `requiresBinary` | object[]      | External binaries the plugin needs. See [Binary requirements](#binary-requirements).                                     |
| `codeEntrypoint` | relative path | Entry module for code plugins, e.g. `"dist/index.js"`.                                                                   |
| `cli`            | object[]      | Declares `{ name, description }` entries for `valora --help` (informational; actual registration happens in `register`). |
| `overrides`      | string[]      | Names of built-in providers or backends this plugin replaces.                                                            |
| `validators`     | object[]      | `{ module, stage }` pairs for pre-commit/pre-publish validators.                                                         |

### Permissions

Each `contributes` entry that involves security-sensitive behaviour requires a matching permission:

| Permission    | Required for                                                       |
| ------------- | ------------------------------------------------------------------ |
| `code-exec`   | `contributes: ["code"]` and `contributes: ["validators"]`          |
| `shell-hooks` | `contributes: ["hooks"]`                                           |
| `mcp-connect` | `contributes: ["mcps"]`                                            |
| `fs-read`     | Informational — declare it when your plugin reads files            |
| `fs-write`    | Informational — declare it when your plugin writes files           |
| `network`     | Informational — declare it when your plugin makes network requests |

> `fs-read`, `fs-write`, and `network` are not currently enforced at runtime (see ADR-014), but declaring them is recommended for documentation and forward compatibility.

---

## Creating a data plugin

A data plugin needs only a manifest and its asset files:

```
my-plugin/
├── valora-plugin.json
├── prompts/
│   └── my-prompt.md
└── commands/
    └── my-command.md
```

```json
{
	"name": "my-plugin",
	"version": "1.0.0",
	"contributes": ["prompts", "commands"]
}
```

No npm package, no build step, no permissions. Drop the directory into the appropriate scope directory and Valora picks it up on next startup.

---

## Creating a code plugin

A code plugin is an npm package that exports `register(api)`.

### Minimal file structure

```
my-plugin/
├── valora-plugin.json
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```

### `valora-plugin.json`

```json
{
	"name": "my-plugin",
	"version": "1.0.0",
	"description": "My plugin",
	"engines": { "valora": ">=0.1.0" },
	"contributes": ["code"],
	"permissions": ["code-exec"],
	"codeEntrypoint": "dist/index.js"
}
```

### `package.json`

```json
{
	"name": "@windagency/my-plugin",
	"version": "1.0.0",
	"type": "module",
	"main": "./dist/index.js",
	"types": "./dist/index.d.ts",
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"import": "./dist/index.js"
		}
	},
	"files": ["dist", "valora-plugin.json"],
	"scripts": {
		"build": "tsc -b",
		"clean": "rm -rf ./dist"
	},
	"peerDependencies": {
		"@windagency/valora": ">=0.1.0"
	},
	"devDependencies": {
		"@windagency/valora-plugin-api": "^1.0.0"
	}
}
```

`valora-plugin-api` is a `devDependency` — it ships no runtime code. If you also use `valora-runtime`, add it to `dependencies` (or to `requires` in the manifest to get it wired without installing it separately).

### `src/index.ts`

```typescript
import type { PluginAPI } from '@windagency/valora-plugin-api';

export function register(api: PluginAPI): void {
	api.logger.info('my-plugin loaded');
}
```

### Build and install locally

```bash
pnpm build

# Install into the user scope for testing
valora plugin add ./path/to/my-plugin --scope user
```

---

## Contribution types reference

### CLI subcommands (`code` + `code-exec`)

```typescript
export function register(api: PluginAPI): void {
	api.cli.addSubcommand(
		'my-plugin run', // one or two lowercase kebab-case words
		'Run my plugin against the current project',
		async () => {
			api.logger.info('running');
		}
	);
}
```

Declare the name in the manifest's `cli` array for `valora --help` to show it before `register` runs:

```json
{
	"cli": [{ "name": "my-plugin run", "description": "Run my plugin against the current project" }]
}
```

See [`@windagency/valora-plugin-api` — `api.cli`](../packages/valora-plugin-api/README.md#apicli--adding-subcommands) for name constraints and override semantics.

---

### LLM providers (`code` + `code-exec`)

Implement `LLMProviderContract` from `@windagency/valora-plugin-api`:

```typescript
import type { LLMProviderContract, PluginAPI, ProviderDescriptor } from '@windagency/valora-plugin-api';

class MyProvider implements LLMProviderContract {
	name = 'my-provider';
	constructor(private config: Record<string, unknown>) {}
	isConfigured() {
		return Boolean(this.config['apiKey']);
	}
	getAlternativeModels() {
		return ['model-a'];
	}
	async validateModel(name: string) {
		return name === 'model-a';
	}
	async complete(options) {
		/* ... */
	}
	async streamComplete(options, onChunk) {
		/* ... */
	}
}

const descriptor: ProviderDescriptor = {
	label: 'My Provider',
	defaultModel: 'model-a',
	modelModes: [{ mode: 'default', model: 'model-a' }],
	requiresApiKey: true,
	envVars: { apiKey: 'MY_PROVIDER_API_KEY' }
};

export function register(api: PluginAPI): void {
	api.providers.register('my-provider', MyProvider, descriptor);
}
```

See [`@windagency/valora-plugin-api` — `api.providers`](../packages/valora-plugin-api/README.md#apiproviders--registering-an-llm-provider) for the full interface and `ProviderDescriptor` field reference.

---

### Memory backends (`code` + `code-exec`)

Implement `MemoryProvider` from `@windagency/valora-plugin-api`:

```typescript
import type { MemoryProvider, MemoryProviderDescriptor, PluginAPI } from '@windagency/valora-plugin-api';

class MyMemoryBackend implements MemoryProvider {
	constructor(private config: Record<string, unknown>) {}
	// implement all required methods...
}

const descriptor: MemoryProviderDescriptor = {
	label: 'My Backend',
	capabilities: ['consolidation']
};

export function register(api: PluginAPI): void {
	api.memory.register('my-backend', MyMemoryBackend, descriptor);
}
```

To replace the default `vault` backend, add `"overrides": ["vault"]` to the manifest. See [Overriding built-in providers](#overriding-built-in-providers).

See [`@windagency/valora-plugin-api` — `api.memory`](../packages/valora-plugin-api/README.md#apimemory--registering-a-memory-provider) for the complete interface.

---

### Compression strategies (`code` + `code-exec`)

A compression strategy reduces verbose tool output before it enters the context window:

```typescript
import type { CompressionStrategy, PluginAPI } from '@windagency/valora-plugin-api';

const filterMyTool: CompressionStrategy = (output, command) =>
	output
		.split('\n')
		.filter((l) => l.includes('error'))
		.join('\n');

export function register(api: PluginAPI): void {
	api.compression.registerStrategy('my-tool', filterMyTool);
}
```

ANSI codes are stripped before the strategy receives the output. The strategy must not throw.

---

### Configuration extensions (`code` + `code-exec`)

```typescript
import { z } from 'zod';
import type { PluginAPI } from '@windagency/valora-plugin-api';

const schema = z.object({
	endpoint: z.string().url().default('http://localhost:11434'),
	timeout: z.number().int().positive().default(30_000)
});

export function register(api: PluginAPI): void {
	const getConfig = api.config.extend(schema);

	// Call getConfig() at use-time, not at register-time
	api.lifecycle.onActivate(async () => {
		const { endpoint } = getConfig();
		await connectToService(endpoint);
	});
}
```

The accessor reads from `.valora/config.json` or `~/.valora/config.json` under a key matching your plugin name.

---

### Shell hooks (`hooks` + `shell-hooks`)

Hooks intercept tool calls before they execute. They live in a `hooks.json` file in the plugin directory.

```
my-plugin/
├── valora-plugin.json
├── hooks.json
└── hooks/
    └── my-check.sh
```

**`valora-plugin.json`**

```json
{
	"name": "my-plugin",
	"version": "1.0.0",
	"contributes": ["hooks"],
	"permissions": ["shell-hooks"]
}
```

**`hooks.json`**

```json
{
	"hooks": {
		"PreToolUse": [
			{
				"matcher": "^run_terminal_cmd$",
				"hooks": [
					{
						"type": "command",
						"command": "bash '{pluginDir}/hooks/my-check.sh'",
						"timeout": 5000
					}
				]
			}
		]
	}
}
```

`{pluginDir}` is replaced with the single-quoted absolute path to the plugin directory at load time.

**`hooks/my-check.sh`**

The hook script receives the full tool-call JSON on stdin. Exit codes:

| Exit code | Effect                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `0`       | Allow the tool call                                                                                                                 |
| `2`       | Deny the tool call; write `{ "hookSpecificOutput": { "permissionDecision": "deny", "permissionDecisionReason": "..." } }` to stdout |

```bash
#!/bin/bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if echo "$COMMAND" | grep -qE '\bdrop table\b'; then
  echo '{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":"Refusing destructive SQL — use a migration instead."}}'
  exit 2
fi
exit 0
```

---

### MCP servers (`mcps` + `mcp-connect`)

Register one or more MCP servers via an `mcps.json` file:

```
my-plugin/
├── valora-plugin.json
└── mcps.json
```

**`valora-plugin.json`**

```json
{
	"name": "my-plugin",
	"version": "1.0.0",
	"contributes": ["mcps"],
	"permissions": ["mcp-connect"]
}
```

**`mcps.json`**

```json
{
	"schemaVersion": "1.0.0",
	"servers": [
		{
			"id": "my-server",
			"name": "My MCP Server",
			"description": "Provides access to internal tooling",
			"package": "@my-org/my-mcp-server",
			"risk": "medium",
			"requires_approval": true,
			"remember_approval": "session",
			"security": {
				"max_execution_ms": 30000,
				"tool_blocklist": []
			}
		}
	]
}
```

`remember_approval` values: `"session"` (approve once per session), `"always_ask"` (re-prompt every use). High-risk servers should use `"always_ask"`.

---

### Prompts (`prompts`)

Prompts require no permission and no code:

```
my-plugin/
├── valora-plugin.json
└── prompts/
    └── my-prompt.md
```

```json
{
	"name": "my-plugin",
	"version": "1.0.0",
	"contributes": ["prompts"]
}
```

Prompt files use YAML front-matter:

```markdown
---
id: my-plugin.my-prompt
version: 1.0.0
category: analysis
name: My Prompt
description: Does something useful
inputs:
  - name: target
    description: The target to analyse
    type: string
    required: true
---

Analyse {{target}} and provide a structured report.
```

Use `_template.md` from `valora-core-generators` as a scaffold, or generate a prompt with `valora generate command`.

---

### Commands (`commands`)

Command definition files describe compound AI workflows:

```
my-plugin/
├── valora-plugin.json
└── commands/
    └── my-workflow.md
```

```json
{
	"name": "my-plugin",
	"version": "1.0.0",
	"contributes": ["commands"]
}
```

Generate a command definition from a natural-language description:

```
valora generate command "
  purpose: Run a full quality gate — lint, type-check, test, and security scan
  output: pass/fail summary with actionable next steps
"
```

---

### Agents (`agents`)

Agent definition files configure specialised AI sub-agents:

```
my-plugin/
├── valora-plugin.json
└── agents/
    └── my-agent.md
```

```json
{
	"name": "my-plugin",
	"version": "1.0.0",
	"contributes": ["agents"]
}
```

Generate an agent definition:

```
valora generate agent "
  name: code-reviewer
  purpose: Review pull requests for correctness, security, and style
"
```

---

### Templates (`templates`)

Arbitrary template files (Mustache, Handlebars, plain text):

```
my-plugin/
├── valora-plugin.json
└── templates/
    └── component.tsx.hbs
```

```json
{
	"name": "my-plugin",
	"version": "1.0.0",
	"contributes": ["templates"]
}
```

---

### Validators (`validators` + `code-exec`)

Validators run at a declared pipeline stage and can block the workflow:

```json
{
	"name": "my-plugin",
	"version": "1.0.0",
	"contributes": ["validators"],
	"permissions": ["code-exec"],
	"validators": [{ "module": "dist/validators/pre-commit.js", "stage": "pre-commit" }]
}
```

The module is resolved relative to the plugin directory. Each validator module must export a function compatible with the validator contract expected by the host.

---

## Plugin dependencies

Use `requires` to declare that your plugin needs another plugin to be loaded first:

```json
{
	"name": "my-plugin",
	"requires": ["valora-runtime"]
}
```

The host:

1. Topologically sorts plugins by their `requires` graph before activation, so dependencies activate first.
2. Creates a `node_modules/@windagency/<depName>` symlink inside your plugin directory at load time, so your code can `import '@windagency/valora-runtime'` without an explicit `npm install`.

Circular dependencies are detected and logged as a warning; affected plugins are still loaded in an undefined order.

---

## Binary requirements

Declare external binaries your plugin needs. The host surfaces these to `valora doctor` and can auto-install them when `autoInstall: true`:

```json
{
	"requiresBinary": [
		{
			"name": "ollama",
			"version": ">=0.1.0",
			"checkCommand": "ollama --version",
			"install": "https://ollama.ai/download",
			"installCommand": "curl -fsSL https://ollama.ai/install.sh | sh",
			"autoInstall": false
		}
	]
}
```

| Field                | Notes                                                               |
| -------------------- | ------------------------------------------------------------------- |
| `name`               | Binary name as it appears on `PATH`                                 |
| `version`            | Expected version string (informational)                             |
| `checkCommand`       | Command to verify the binary is available                           |
| `install`            | Human-readable install instructions                                 |
| `installCommand`     | Shell command to install the binary automatically                   |
| `autoInstall`        | When `true`, the host runs `installCommand` if the binary is absent |
| `postInstallCommand` | Run after installation (e.g. to pull a default model)               |

---

## Overriding built-in providers

To replace a built-in provider or memory backend, declare it in `overrides`:

```json
{
	"name": "my-memory-backend",
	"contributes": ["code"],
	"permissions": ["code-exec"],
	"overrides": ["vault"]
}
```

Without this, registering an already-taken name logs a warning and is rejected. With it, your registration silently wins.

---

## Utility packages

### `@windagency/valora-plugin-api`

The single package a code plugin installs. Type-only — adds nothing to bundle size. Provides every type needed to implement `LLMProviderContract`, `MemoryProvider`, `CompressionStrategy`, and the full `PluginAPI` surface.

→ See the [full reference](../packages/valora-plugin-api/README.md).

### `@windagency/valora-runtime`

Pure-leaf utilities: error classes (`BaseError`, `ProviderError`), ID generators, `getLogger()`, path helpers (`getRuntimeDataDir()`, `getGlobalConfigDir()`), and safe process execution (`SafeExecutor`, `RetryExecutor`).

Has no host dependencies — safe to import from any plugin. Declare it in `requires` in your manifest to get it wired without a separate npm install.

→ See the [full reference](../packages/valora-runtime/README.md).

### `valora-defaults` (built-in)

Always active. Enforces modern CLI tooling (blocks `grep`/`find`/`ls`/`npm` in favour of `rg`/`fd`/`eza`/`pnpm`) and provides a catalogue of 15 pre-wired MCP servers.

→ See the [full reference](../data/plugins/valora-defaults/README.md).

### `valora-core-generators` (built-in)

Always active. Provides the `valora generate agent` and `valora generate command` prompts used to scaffold new plugin assets.

→ See the [full reference](../data/plugins/valora-core-generators/README.md).

---

## Testing your plugin

Test code plugins as TypeScript modules — no full Valora install required. The `register` function is just a function that accepts a plain object.

```typescript
import { describe, it, expect, vi } from 'vitest';
import { register } from '../src/index.js';

function makeApi(overrides = {}) {
	return {
		cli: { addSubcommand: vi.fn() },
		compression: { registerStrategy: vi.fn() },
		config: { extend: vi.fn().mockReturnValue(() => ({ timeout: 30_000 })) },
		lifecycle: { onActivate: vi.fn(), onDeactivate: vi.fn() },
		logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		memory: { register: vi.fn() },
		providers: { register: vi.fn() },
		...overrides
	};
}

describe('my-plugin', () => {
	it('registers a CLI subcommand', () => {
		const api = makeApi();
		register(api);
		expect(api.cli.addSubcommand).toHaveBeenCalledWith('my-plugin run', expect.any(String), expect.any(Function));
	});
});
```

Test `LLMProviderContract` implementations directly — pass a mock config object to the constructor and call the methods:

```typescript
it('returns false from isConfigured when apiKey is absent', () => {
	const provider = new MyProvider({});
	expect(provider.isConfigured()).toBe(false);
});
```

---

## Installing and publishing

### Local development

```bash
# Build
pnpm build

# Install into user scope (persists across projects)
valora plugin add ./dist --scope user

# Install into project scope (checked into .valora/plugins/)
valora plugin add ./dist --scope project

# Verify it loaded
valora plugin list
```

### From npm

```bash
# Publish to an npm registry
pnpm publish --registry https://registry.npmjs.org

# Anyone can then install it by short name
valora plugin add my-plugin
# or by full package name
valora plugin add @my-org/valora-plugin-my-plugin
```

For local development against a private Verdaccio registry, use `publish-local.sh`:

```bash
bash scripts/publish-local.sh
# Follow the printed instructions to point the demo container at the local registry
```

### Name resolution

When you run `valora plugin add <name>`, Valora resolves the package name as follows:

| Input                        | Resolved package                         |
| ---------------------------- | ---------------------------------------- |
| `memory-vault`               | `@windagency/valora-plugin-memory-vault` |
| `valora-plugin-memory-vault` | `@windagency/valora-plugin-memory-vault` |
| `@my-org/my-plugin`          | `@my-org/my-plugin` (verbatim)           |

---

## Manifest schema reference

```typescript
interface PluginManifest {
	// Required
	name: string; // /^[a-z0-9][a-z0-9-]*$/
	version: string; // /^\d+\.\d+\.\d+$/

	// Descriptive
	description?: string;
	homepage?: string; // valid URL

	// Compatibility
	engines?: { valora?: string }; // semver range, e.g. ">=0.1.0"

	// Contributions
	contributes?: Array<
		'agent-context' | 'agents' | 'code' | 'commands' | 'hooks' | 'mcps' | 'prompts' | 'templates' | 'validators'
	>;
	permissions?: Array<
		| 'code-exec' // required for 'code' and 'validators'
		| 'fs-read' // informational
		| 'fs-write' // informational
		| 'mcp-connect' // required for 'mcps'
		| 'network' // informational
		| 'shell-hooks' // required for 'hooks'
	>;

	// Code plugin
	codeEntrypoint?: string; // relative path, e.g. "dist/index.js"
	cli?: Array<{ name: string; description: string }>;

	// Dependencies
	requires?: string[]; // other plugin names
	requiresBinary?: PluginBinaryRequirement[]; // external tools

	// Advanced
	overrides?: string[]; // built-in names this plugin replaces
	validators?: Array<{ module: string; stage: string }>;
}
```

### `contributes` → file system mapping

| Value        | What the host looks for            |
| ------------ | ---------------------------------- |
| `agents`     | `<pluginDir>/agents/`              |
| `code`       | path specified in `codeEntrypoint` |
| `commands`   | `<pluginDir>/commands/`            |
| `hooks`      | `<pluginDir>/hooks.json`           |
| `mcps`       | `<pluginDir>/mcps.json`            |
| `prompts`    | `<pluginDir>/prompts/`             |
| `templates`  | `<pluginDir>/templates/`           |
| `validators` | paths in the `validators` array    |
