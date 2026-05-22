# Cross-Duplication Audit Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `valora-plugin-cross-duplication-audit` — a Valora plugin that detects N×M concern duplication across sibling directories and emits structured JSON for CI gating and LLM-generated refactoring narratives.

**Architecture:** A hybrid code+commands+prompts plugin. The `audit scan` CLI subcommand does a deterministic filesystem walk (import fingerprinting + keyword density), exits non-zero on violations, and writes JSON. The `audit-cross-duplication` pipeline command wraps it in two stages: scan then LLM narrative.

**Tech Stack:** TypeScript, Node.js 22, Zod, Vitest, esbuild, `@windagency/valora-plugin-api`

---

## File map

| File                                                                           | Responsibility                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `packages/valora-plugin-cross-duplication-audit/valora-plugin.json`            | Plugin manifest                                         |
| `packages/valora-plugin-cross-duplication-audit/package.json`                  | npm package config                                      |
| `packages/valora-plugin-cross-duplication-audit/tsconfig.json`                 | TypeScript config                                       |
| `packages/valora-plugin-cross-duplication-audit/vitest.config.ts`              | Vitest config                                           |
| `src/scanner.types.ts`                                                         | Zod schemas + TypeScript types shared by all modules    |
| `src/fingerprint.ts`                                                           | Pure functions: import extraction, keyword hit counting |
| `src/fingerprint.test.ts`                                                      | Unit tests for fingerprint functions                    |
| `src/scanner.ts`                                                               | Filesystem walk, sibling grouping, violation detection  |
| `src/scanner.test.ts`                                                          | Integration tests against real fixture dirs             |
| `src/index.ts`                                                                 | `register(api)` — wires CLI subcommand                  |
| `__tests__/fixtures/violations/infrastructure/{telegram,discord,llm,tts}/*.ts` | Fixture files with duplicated concern patterns          |
| `__tests__/fixtures/clean/services/{auth,users}/*.ts`                          | Fixture files with no violations                        |
| `commands/audit-cross-duplication.md`                                          | Two-stage pipeline command definition                   |
| `prompts/audit.run-scan.md`                                                    | Scan stage prompt                                       |
| `prompts/audit.generate-narrative.md`                                          | Narrative stage prompt                                  |

All paths below are relative to `packages/valora-plugin-cross-duplication-audit/` unless otherwise noted.

---

## Task 1: Package scaffold

**Files:**

- Create: `packages/valora-plugin-cross-duplication-audit/valora-plugin.json`
- Create: `packages/valora-plugin-cross-duplication-audit/package.json`
- Create: `packages/valora-plugin-cross-duplication-audit/tsconfig.json`
- Create: `packages/valora-plugin-cross-duplication-audit/vitest.config.ts`

- [ ] **Step 1: Create `valora-plugin.json`**

```json
{
	"name": "valora-plugin-cross-duplication-audit",
	"version": "1.0.0",
	"description": "Detects N×M concern accumulation across sibling directories before it becomes structural debt.",
	"engines": { "valora": ">=0.1.0" },
	"contributes": ["code", "commands", "prompts"],
	"permissions": ["code-exec", "fs-read"],
	"codeEntrypoint": "dist/index.js",
	"cli": [{ "name": "audit scan", "description": "Static cross-sibling duplication scan — outputs JSON, CI-safe" }]
}
```

- [ ] **Step 2: Create `package.json`**

```json
{
	"name": "@windagency/valora-plugin-cross-duplication-audit",
	"version": "1.0.0",
	"description": "Detects N×M concern accumulation across sibling directories before it becomes structural debt.",
	"keywords": ["valora", "valora-plugin", "audit", "architecture", "duplication"],
	"author": "Damien TIVELET <damien@wind-agency.com>",
	"license": "MIT",
	"type": "module",
	"main": "./dist/index.js",
	"types": "./dist/index.d.ts",
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"import": "./dist/index.js"
		}
	},
	"engines": { "node": ">=22.0.0" },
	"packageManager": "pnpm@10.19.0",
	"volta": { "node": "22.21.0", "pnpm": "10.19.0" },
	"scripts": {
		"build": "tsc -b && esbuild src/index.ts --bundle --platform=node --format=esm --outfile=dist/index.js --external:@windagency/valora-plugin-api --banner:js=\"import { createRequire } from 'module'; const require = createRequire(import.meta.url);\"",
		"clean": "rm -rf ./dist",
		"lint": "eslint --color",
		"lint:fix": "eslint --color --fix",
		"beautify": "prettier --check \"**/*.+(js|jsx|ts|tsx|json|md|yml|yaml)\"",
		"beautify:fix": "prettier --write \"**/*.+(js|jsx|ts|tsx|json|md|yml|yaml)\"",
		"format": "pnpm beautify:fix && pnpm lint:fix",
		"test": "vitest run",
		"prepublishOnly": "pnpm clean && pnpm build && pnpm test"
	},
	"files": ["valora-plugin.json", "dist", "commands", "prompts"],
	"peerDependencies": {
		"@windagency/valora": ">=0.1.0",
		"@windagency/valora-plugin-api": "workspace:*"
	},
	"devDependencies": {
		"esbuild": "^0.28.0",
		"zod": "^3.22.4"
	}
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
	"compilerOptions": {
		"alwaysStrict": true,
		"composite": true,
		"declaration": true,
		"declarationMap": true,
		"esModuleInterop": true,
		"forceConsistentCasingInFileNames": true,
		"isolatedModules": true,
		"lib": ["ES2022"],
		"module": "ESNext",
		"moduleResolution": "bundler",
		"noFallthroughCasesInSwitch": true,
		"noImplicitAny": true,
		"noImplicitOverride": true,
		"noImplicitReturns": true,
		"noImplicitThis": true,
		"noPropertyAccessFromIndexSignature": true,
		"noUncheckedIndexedAccess": true,
		"noUnusedLocals": true,
		"noUnusedParameters": true,
		"outDir": "dist",
		"rootDir": "src",
		"skipLibCheck": true,
		"sourceMap": true,
		"strict": true,
		"strictBindCallApply": true,
		"strictFunctionTypes": true,
		"strictNullChecks": true,
		"strictPropertyInitialization": true,
		"target": "ES2022",
		"types": ["node"]
	},
	"references": [{ "path": "../valora-plugin-api" }],
	"include": ["src/**/*"],
	"exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import path from 'node:path';

import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export default defineConfig({
	resolve: {
		alias: {
			'@windagency/valora-plugin-api': path.resolve(__dirname, '../../packages/valora-plugin-api/src/index')
		}
	},
	test: {
		environment: 'node',
		testTimeout: 30000
	}
});
```

- [ ] **Step 5: Install workspace dependencies**

Run from `/workspaces/valora`:

```bash
pnpm install
```

Expected: No errors. `node_modules/@windagency/valora-plugin-cross-duplication-audit` symlink created.

---

## Task 2: Types

**Files:**

- Create: `src/scanner.types.ts`

- [ ] **Step 1: Create `src/scanner.types.ts`**

```typescript
import { z } from 'zod';

export const CONCERN_CATEGORIES = [
	'error-boundary',
	'retry',
	'circuit-breaker',
	'timeout',
	'logging',
	'metrics'
] as const;

export type ConcernCategory = (typeof CONCERN_CATEGORIES)[number];
export type ViolationConcern = ConcernCategory | 'import';
export type Severity = 'high' | 'medium' | 'low';

export const AUDIT_CONFIG_SCHEMA = z.object({
	concerns: z.array(z.enum(CONCERN_CATEGORIES)).default([...CONCERN_CATEGORIES]),
	densityFloor: z.number().min(0).default(1.0),
	depth: z.number().int().min(1).default(2),
	exclude: z.array(z.string()).default([]),
	threshold: z.number().int().min(2).default(3)
});

export type AuditConfig = z.infer<typeof AUDIT_CONFIG_SCHEMA>;

export interface Violation {
	affectedSiblings: string[];
	concern: ViolationConcern;
	severity: Severity;
	suggestedExtractionPath: string;
	topKeywords: string[];
}

export interface SiblingGroup {
	parentPath: string;
	siblings: string[];
	violations: Violation[];
}

export interface AuditReport {
	depth: number;
	rootPath: string;
	scannedAt: string;
	siblingGroups: SiblingGroup[];
	summary: {
		highSeverity: number;
		lowSeverity: number;
		mediumSeverity: number;
		totalViolations: number;
	};
	threshold: number;
	warnings: string[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run from `packages/valora-plugin-cross-duplication-audit`:

```bash
pnpm exec tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/valora-plugin-cross-duplication-audit/
git commit -m "feat(audit): scaffold package and types for cross-duplication audit plugin"
```

---

## Task 3: Fingerprint module (TDD)

**Files:**

- Create: `src/fingerprint.test.ts`
- Create: `src/fingerprint.ts`

- [ ] **Step 1: Write failing tests in `src/fingerprint.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';

import { CONCERN_PATTERNS, countConcernHits, extractImports } from './fingerprint.js';

describe('extractImports', () => {
	it('extracts bare module specifiers from ES import statements', () => {
		const content = `import { Client } from 'nats';
import { retry } from './local.js';
import path from 'node:path';`;
		const result = extractImports(content);
		expect(result.has('nats')).toBe(true);
		expect(result.has('node:path')).toBe(true);
		expect(result.has('./local.js')).toBe(false);
	});

	it('extracts only the root segment of deep import paths', () => {
		const result = extractImports("import x from 'nats/connection';");
		expect(result.has('nats')).toBe(true);
		expect(result.has('nats/connection')).toBe(false);
	});

	it('handles CommonJS require() calls', () => {
		const result = extractImports("const x = require('axios');");
		expect(result.has('axios')).toBe(true);
	});

	it('returns an empty set when content has no imports', () => {
		expect(extractImports('const x = 1 + 1;').size).toBe(0);
	});

	it('deduplicates the same module imported multiple times', () => {
		const content = "import a from 'lodash'; import b from 'lodash/fp';";
		const result = extractImports(content);
		expect(result.size).toBe(1);
		expect(result.has('lodash')).toBe(true);
	});
});

describe('countConcernHits', () => {
	it('counts occurrences of each keyword in the content', () => {
		const content = 'try { } catch (e) { throw new Error("fail"); }';
		const hits = countConcernHits(content, CONCERN_PATTERNS['error-boundary']);
		expect(hits).toBeGreaterThan(0);
	});

	it('returns 0 when no keywords are present', () => {
		expect(countConcernHits('const x = 1;', CONCERN_PATTERNS['retry'])).toBe(0);
	});

	it('counts multiple occurrences of the same keyword independently', () => {
		expect(countConcernHits('retry(); retry(); retry();', ['retry'])).toBe(3);
	});

	it('counts overlapping keywords separately', () => {
		const hits = countConcernHits('CircuitBreaker half-open breaker', CONCERN_PATTERNS['circuit-breaker']);
		expect(hits).toBe(3);
	});
});

describe('CONCERN_PATTERNS', () => {
	it('defines patterns for all six built-in categories', () => {
		const expected = ['error-boundary', 'retry', 'circuit-breaker', 'timeout', 'logging', 'metrics'];
		for (const cat of expected) {
			expect(CONCERN_PATTERNS).toHaveProperty(cat);
		}
	});
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
pnpm test
```

Expected: FAIL — `Cannot find module './fingerprint.js'`

- [ ] **Step 3: Create `src/fingerprint.ts`**

```typescript
import type { ConcernCategory } from './scanner.types.js';

export const CONCERN_PATTERNS: Record<ConcernCategory, string[]> = {
	'circuit-breaker': ['CircuitBreaker', 'breaker', 'half-open'],
	'error-boundary': ['try', 'catch', 'throw', 'except', 'Error('],
	logging: ['logger.error', 'log.error', 'console.error', 'console.warn'],
	metrics: ['counter(', 'histogram(', 'gauge(', '.increment('],
	retry: ['retry', 'attempt', 'backoff', 'exponential'],
	timeout: ['AbortController', 'deadline', 'setTimeout', 'timeout']
};

const IMPORT_REGEX = /(?:import|require|from)\s+['"]([^'"./][^'"]*)['"]/g;

export function extractImports(content: string): Set<string> {
	const imports = new Set<string>();
	for (const match of content.matchAll(IMPORT_REGEX)) {
		const raw = match[1];
		if (raw) {
			imports.add(raw.split('/')[0] ?? raw);
		}
	}
	return imports;
}

export function countConcernHits(content: string, keywords: string[]): number {
	let hits = 0;
	for (const keyword of keywords) {
		let pos = 0;
		while ((pos = content.indexOf(keyword, pos)) !== -1) {
			hits++;
			pos += keyword.length;
		}
	}
	return hits;
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
pnpm test
```

Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/fingerprint.ts src/fingerprint.test.ts
git commit -m "feat(audit): fingerprint module — import extraction and keyword hit counting"
```

---

## Task 4: Test fixtures

**Files:**

- Create: `__tests__/fixtures/violations/infrastructure/telegram/telegram.client.ts`
- Create: `__tests__/fixtures/violations/infrastructure/discord/discord.client.ts`
- Create: `__tests__/fixtures/violations/infrastructure/llm/llm.client.ts`
- Create: `__tests__/fixtures/violations/infrastructure/tts/tts.client.ts`
- Create: `__tests__/fixtures/clean/services/auth/auth.service.ts`
- Create: `__tests__/fixtures/clean/services/users/users.service.ts`

- [ ] **Step 1: Create violation fixtures**

`__tests__/fixtures/violations/infrastructure/telegram/telegram.client.ts`:

```typescript
import { connect } from 'nats';

export async function handleTelegramMessage(payload: string): Promise<void> {
	try {
		const nc = await connect({ servers: 'nats://localhost:4222' });
		nc.publish('telegram.out', new TextEncoder().encode(payload));
	} catch (e) {
		console.error('telegram handler error', e);
		throw new Error(String(e));
	}
}
```

`__tests__/fixtures/violations/infrastructure/discord/discord.client.ts`:

```typescript
import { connect } from 'nats';

export async function handleDiscordMessage(payload: string): Promise<void> {
	try {
		const nc = await connect({ servers: 'nats://localhost:4222' });
		nc.publish('discord.out', new TextEncoder().encode(payload));
	} catch (e) {
		console.error('discord handler error', e);
		throw new Error(String(e));
	}
}
```

`__tests__/fixtures/violations/infrastructure/llm/llm.client.ts`:

```typescript
import { connect } from 'nats';

export async function dispatchLlmRequest(prompt: string): Promise<void> {
	try {
		const nc = await connect({ servers: 'nats://localhost:4222' });
		nc.publish('llm.request', new TextEncoder().encode(prompt));
	} catch (e) {
		console.error('llm dispatch error', e);
		throw new Error(String(e));
	}
}
```

`__tests__/fixtures/violations/infrastructure/tts/tts.client.ts`:

```typescript
import { connect } from 'nats';

export async function dispatchTtsRequest(text: string): Promise<void> {
	try {
		const nc = await connect({ servers: 'nats://localhost:4222' });
		nc.publish('tts.request', new TextEncoder().encode(text));
	} catch (e) {
		console.error('tts dispatch error', e);
		throw new Error(String(e));
	}
}
```

- [ ] **Step 2: Create clean fixtures**

`__tests__/fixtures/clean/services/auth/auth.service.ts`:

```typescript
export function authenticate(token: string): boolean {
	return token.length > 0;
}
```

`__tests__/fixtures/clean/services/users/users.service.ts`:

```typescript
export function getUser(id: string): { id: string } {
	return { id };
}
```

- [ ] **Step 3: Commit fixtures**

```bash
git add __tests__/
git commit -m "test(audit): add fixture trees for scanner integration tests"
```

---

## Task 5: Scanner module (TDD)

**Files:**

- Create: `src/scanner.test.ts`
- Create: `src/scanner.ts`

- [ ] **Step 1: Write failing tests in `src/scanner.test.ts`**

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scan } from './scanner.js';
import type { AuditConfig } from './scanner.types.js';

const FIXTURES = path.resolve(import.meta.dirname, '../__tests__/fixtures');

const baseConfig: AuditConfig = {
	concerns: ['error-boundary', 'retry', 'circuit-breaker', 'timeout', 'logging', 'metrics'],
	densityFloor: 1.0,
	depth: 2,
	exclude: [],
	threshold: 3
};

describe('scan — clean fixture', () => {
	it('returns totalViolations 0 and empty siblingGroups when no violations exist', async () => {
		const report = await scan(path.join(FIXTURES, 'clean'), baseConfig);
		expect(report.summary.totalViolations).toBe(0);
		expect(report.siblingGroups).toHaveLength(0);
	});
});

describe('scan — violations fixture', () => {
	it('detects a sibling group under infrastructure/', async () => {
		const report = await scan(path.join(FIXTURES, 'violations'), baseConfig);
		const group = report.siblingGroups.find((g) => g.parentPath.endsWith('infrastructure'));
		expect(group).toBeDefined();
	});

	it('flags concern patterns present in N >= threshold siblings', async () => {
		const report = await scan(path.join(FIXTURES, 'violations'), baseConfig);
		const group = report.siblingGroups.find((g) => g.parentPath.endsWith('infrastructure'));
		expect(group!.violations.length).toBeGreaterThan(0);
	});

	it('flags the shared nats import across all four siblings', async () => {
		const report = await scan(path.join(FIXTURES, 'violations'), baseConfig);
		const group = report.siblingGroups.find((g) => g.parentPath.endsWith('infrastructure'));
		const importViolation = group?.violations.find((v) => v.concern === 'import');
		expect(importViolation).toBeDefined();
		expect(importViolation!.affectedSiblings.length).toBeGreaterThanOrEqual(3);
	});

	it('assigns high severity when N >= threshold + 2', async () => {
		// threshold=2, 4 siblings → N(4) >= threshold+2(4) → high
		const report = await scan(path.join(FIXTURES, 'violations'), { ...baseConfig, threshold: 2 });
		const group = report.siblingGroups.find((g) => g.parentPath.endsWith('infrastructure'));
		expect(group?.violations.some((v) => v.severity === 'high')).toBe(true);
	});

	it('assigns medium severity when N === threshold + 1', async () => {
		// threshold=3, 4 siblings → N(4) === threshold+1(4) → medium
		const report = await scan(path.join(FIXTURES, 'violations'), { ...baseConfig, threshold: 3 });
		const group = report.siblingGroups.find((g) => g.parentPath.endsWith('infrastructure'));
		expect(group?.violations.some((v) => v.severity === 'medium')).toBe(true);
	});

	it('sets suggestedExtractionPath to {parentPath}/shared/{concern} for every violation', async () => {
		const report = await scan(path.join(FIXTURES, 'violations'), baseConfig);
		const group = report.siblingGroups.find((g) => g.parentPath.endsWith('infrastructure'));
		for (const v of group?.violations ?? []) {
			expect(v.suggestedExtractionPath).toBe(`${group!.parentPath}/shared/${v.concern}`);
		}
	});

	it('respects the exclude list and skips matching siblings', async () => {
		const report = await scan(path.join(FIXTURES, 'violations'), {
			...baseConfig,
			exclude: ['telegram', 'discord', 'llm', 'tts']
		});
		expect(report.summary.totalViolations).toBe(0);
	});
});

describe('scan — IO resilience', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync('/tmp/valora-audit-test-');
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { force: true, recursive: true });
	});

	it('adds a warning for an unreadable sibling directory and continues', async () => {
		if (process.getuid?.() === 0) return; // root bypasses chmod — skip

		const infraDir = path.join(tmpDir, 'infra');
		fs.mkdirSync(path.join(infraDir, 'a'), { recursive: true });
		fs.mkdirSync(path.join(infraDir, 'b'), { recursive: true });
		fs.mkdirSync(path.join(infraDir, 'c'), { recursive: true });
		fs.writeFileSync(path.join(infraDir, 'a', 'a.ts'), 'const x = 1;');
		fs.writeFileSync(path.join(infraDir, 'c', 'c.ts'), 'const z = 1;');
		fs.chmodSync(path.join(infraDir, 'b'), 0o000);

		const report = await scan(tmpDir, { ...baseConfig, depth: 1 });
		expect(report.warnings.length).toBeGreaterThan(0);

		fs.chmodSync(path.join(infraDir, 'b'), 0o755);
	});
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
pnpm test
```

Expected: FAIL — `Cannot find module './scanner.js'`

- [ ] **Step 3: Create `src/scanner.ts`**

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

import { CONCERN_PATTERNS, countConcernHits, extractImports } from './fingerprint.js';
import {
	CONCERN_CATEGORIES,
	type AuditConfig,
	type AuditReport,
	type ConcernCategory,
	type Severity,
	type SiblingGroup,
	type Violation
} from './scanner.types.js';

function computeSeverity(n: number, threshold: number): Severity {
	if (n >= threshold + 2) return 'high';
	if (n === threshold + 1) return 'medium';
	return 'low';
}

function matchesExclude(name: string, patterns: string[]): boolean {
	return patterns.some((p) => (p.startsWith('*') ? name.endsWith(p.slice(1)) : name === p));
}

function getSiblingNames(dirPath: string, exclude: string[]): string[] {
	try {
		return fs
			.readdirSync(dirPath, { withFileTypes: true })
			.filter((e) => e.isDirectory() && !matchesExclude(e.name, exclude))
			.map((e) => e.name);
	} catch {
		return [];
	}
}

function readDirContents(dirPath: string): { content: string; fileCount: number; warning?: string } {
	const parts: string[] = [];
	let fileCount = 0;

	const recurse = (p: string): string | undefined => {
		let warn: string | undefined;
		try {
			for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
				const full = path.join(p, entry.name);
				if (entry.isDirectory()) {
					warn ??= recurse(full);
				} else if (entry.isFile()) {
					try {
						parts.push(fs.readFileSync(full, 'utf-8'));
						fileCount++;
					} catch {
						/* skip unreadable file */
					}
				}
			}
		} catch (e) {
			return `Cannot read ${p}: ${String(e)}`;
		}
		return warn;
	};

	const warning = recurse(dirPath);
	return { content: parts.join('\n'), fileCount, warning };
}

function collectParentPaths(rootPath: string, config: AuditConfig): string[] {
	const parents: string[] = [];

	const recurse = (currentPath: string, currentDepth: number): void => {
		const siblings = getSiblingNames(currentPath, config.exclude);
		if (siblings.length >= 2) {
			parents.push(currentPath);
		}
		if (currentDepth < config.depth) {
			for (const sibling of siblings) {
				recurse(path.join(currentPath, sibling), currentDepth + 1);
			}
		}
	};

	recurse(rootPath, 0);
	return parents;
}

export async function scan(rootPath: string, config: AuditConfig): Promise<AuditReport> {
	const warnings: string[] = [];
	const siblingGroups: SiblingGroup[] = [];
	const parents = collectParentPaths(rootPath, config);

	for (const parentPath of parents) {
		const siblings = getSiblingNames(parentPath, config.exclude);

		type SiblingData = { concernHits: Map<ConcernCategory, number>; fileCount: number; imports: Set<string> };
		const siblingData = new Map<string, SiblingData>();

		for (const sibling of siblings) {
			const { content, fileCount, warning } = readDirContents(path.join(parentPath, sibling));
			if (warning) warnings.push(warning);
			if (fileCount === 0) continue;

			const imports = extractImports(content);
			const concernHits = new Map<ConcernCategory, number>();
			for (const category of config.concerns) {
				concernHits.set(category, countConcernHits(content, CONCERN_PATTERNS[category]));
			}
			siblingData.set(sibling, { concernHits, fileCount, imports });
		}

		const violations: Violation[] = [];
		const relParent = path.relative(rootPath, parentPath) || '.';

		// Concern violations
		for (const category of config.concerns) {
			const flagged = [...siblingData.entries()].filter(([, d]) => {
				const hits = d.concernHits.get(category) ?? 0;
				return hits / d.fileCount >= config.densityFloor;
			});
			if (flagged.length >= config.threshold) {
				violations.push({
					affectedSiblings: flagged.map(([name]) => name),
					concern: category,
					severity: computeSeverity(flagged.length, config.threshold),
					suggestedExtractionPath: `${relParent}/shared/${category}`,
					topKeywords: (CONCERN_PATTERNS[category] ?? []).slice(0, 3)
				});
			}
		}

		// Import violations — modules shared across >= threshold siblings
		const importCounts = new Map<string, string[]>();
		for (const [sibling, data] of siblingData) {
			for (const mod of data.imports) {
				const list = importCounts.get(mod) ?? [];
				list.push(sibling);
				importCounts.set(mod, list);
			}
		}
		const sharedModules = [...importCounts.entries()]
			.filter(([, names]) => names.length >= config.threshold)
			.map(([mod]) => mod);

		if (sharedModules.length > 0) {
			const affectedSiblings = [...new Set(sharedModules.flatMap((m) => importCounts.get(m) ?? []))];
			violations.push({
				affectedSiblings,
				concern: 'import',
				severity: computeSeverity(affectedSiblings.length, config.threshold),
				suggestedExtractionPath: `${relParent}/shared/import`,
				topKeywords: sharedModules.slice(0, 3)
			});
		}

		if (violations.length > 0) {
			siblingGroups.push({ parentPath: relParent, siblings, violations });
		}
	}

	const allViolations = siblingGroups.flatMap((g) => g.violations);
	return {
		depth: config.depth,
		rootPath,
		scannedAt: new Date().toISOString(),
		siblingGroups,
		summary: {
			highSeverity: allViolations.filter((v) => v.severity === 'high').length,
			lowSeverity: allViolations.filter((v) => v.severity === 'low').length,
			mediumSeverity: allViolations.filter((v) => v.severity === 'medium').length,
			totalViolations: allViolations.length
		},
		threshold: config.threshold,
		warnings
	};
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
pnpm test
```

Expected: PASS — all tests green. If any fail, check that fixture paths resolve correctly (`import.meta.dirname` is available in Node 22 + Vitest).

- [ ] **Step 5: Commit**

```bash
git add src/scanner.ts src/scanner.test.ts
git commit -m "feat(audit): scanner — sibling group detection, concern density, import fingerprinting"
```

---

## Task 6: CLI entry point

**Files:**

- Create: `src/index.ts`

- [ ] **Step 1: Create `src/index.ts`**

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { PluginAPI } from '@windagency/valora-plugin-api';

import { scan } from './scanner.js';
import { AUDIT_CONFIG_SCHEMA } from './scanner.types.js';

export function register(api: PluginAPI): void {
	const getConfig = api.config.extend(AUDIT_CONFIG_SCHEMA);

	api.cli.addSubcommand('audit scan', 'Static cross-sibling duplication scan — outputs JSON, CI-safe', async () => {
		// process.argv: ['node', '<bin>', 'audit', 'scan', ...user-args]
		const userArgs = process.argv.slice(4);
		const rootArg = userArgs.find((a) => !a.startsWith('-')) ?? '.';

		const getFlag = (name: string): string | undefined =>
			userArgs
				.find((a) => a.startsWith(`--${name}=`))
				?.split('=')
				.slice(1)
				.join('=');

		const baseConfig = getConfig();
		const config = AUDIT_CONFIG_SCHEMA.parse({
			...baseConfig,
			...(getFlag('depth') !== undefined && { depth: parseInt(getFlag('depth')!, 10) }),
			...(getFlag('threshold') !== undefined && { threshold: parseInt(getFlag('threshold')!, 10) }),
			...(getFlag('exclude') !== undefined && { exclude: getFlag('exclude')!.split(',') }),
			...(getFlag('concerns') !== undefined && { concerns: getFlag('concerns')!.split(',') })
		});

		try {
			const report = await scan(path.resolve(rootArg), config);
			const json = JSON.stringify(report, null, 2);
			const outputPath = getFlag('output');

			if (outputPath) {
				fs.writeFileSync(path.resolve(outputPath), json, 'utf-8');
				api.logger.info('Audit report written', { path: outputPath });
			} else {
				process.stdout.write(json + '\n');
			}

			process.exit(report.summary.totalViolations > 0 ? 1 : 0);
		} catch (e) {
			api.logger.error('Audit scan failed', e instanceof Error ? e : new Error(String(e)));
			process.exit(2);
		}
	});
}
```

- [ ] **Step 2: Build the plugin**

```bash
pnpm build
```

Expected: `dist/index.js` created, no TypeScript errors.

- [ ] **Step 3: Smoke-test the subcommand against violations fixture**

From `/workspaces/valora`:

```bash
node -e "
import('./packages/valora-plugin-cross-duplication-audit/dist/index.js').then(m => {
  const mockApi = {
    cli: { addSubcommand: (name, desc, handler) => { global.__handler = handler; } },
    config: { extend: () => () => ({}) },
    logger: { info: console.log, error: console.error }
  };
  m.register(mockApi);
  process.argv = ['node', 'valora', 'audit', 'scan',
    'packages/valora-plugin-cross-duplication-audit/__tests__/fixtures/violations',
    '--threshold=3'
  ];
  global.__handler();
})
" 2>&1 | head -40
```

Expected: JSON output with `summary.totalViolations > 0` and exit code 1.

- [ ] **Step 4: Smoke-test against clean fixture**

```bash
node -e "
import('./packages/valora-plugin-cross-duplication-audit/dist/index.js').then(m => {
  const mockApi = {
    cli: { addSubcommand: (name, desc, handler) => { global.__handler = handler; } },
    config: { extend: () => () => ({}) },
    logger: { info: console.log, error: console.error }
  };
  m.register(mockApi);
  process.argv = ['node', 'valora', 'audit', 'scan',
    'packages/valora-plugin-cross-duplication-audit/__tests__/fixtures/clean'
  ];
  global.__handler();
})
" 2>&1; echo "exit: $?"
```

Expected: JSON with `summary.totalViolations: 0`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(audit): CLI subcommand wiring — audit scan with flag parsing and JSON output"
```

---

## Task 7: Command and prompt files

**Files:**

- Create: `commands/audit-cross-duplication.md`
- Create: `prompts/audit.run-scan.md`
- Create: `prompts/audit.generate-narrative.md`

- [ ] **Step 1: Create `commands/audit-cross-duplication.md`**

```markdown
---
name: audit-cross-duplication
description: Detect N×M concern duplication across sibling directories and generate a prioritised refactoring narrative
experimental: true
argument-hint: '[<path>] [--depth=<N>] [--threshold=<N>] [--concerns=<csv>] [--exclude=<glob>]'
allowed-tools:
  - run_terminal_cmd
  - read_file
model: claude-opus-4.6
agent: lead
prompts:
  pipeline:
    - stage: scan
      prompt: audit.run-scan
      required: true
      inputs:
        path: $ARG_1
        depth: $ARG_depth
        threshold: $ARG_threshold
        concerns: $ARG_concerns
        exclude: $ARG_exclude
      outputs:
        - scan_json
        - total_violations
    - stage: narrative
      prompt: audit.generate-narrative
      required: true
      inputs:
        scan_json: $STAGE_scan.scan_json
        total_violations: $STAGE_scan.total_violations
      outputs:
        - narrative_markdown
        - report_path
---
```

- [ ] **Step 2: Create `prompts/audit.run-scan.md`**

```markdown
---
id: audit.run-scan
version: 1.0.0
category: audit
experimental: true
name: Run Cross-Duplication Scan
description: Execute the audit scan CLI subcommand and capture the structured JSON output
tags:
  - audit
  - architecture
inputs:
  - name: path
    description: Root path to scan
    type: string
    required: false
    default: .
  - name: depth
    description: Directory depth to scan
    type: number
    required: false
  - name: threshold
    description: Minimum sibling count to flag a concern
    type: number
    required: false
  - name: concerns
    description: Comma-separated concern categories to check
    type: string
    required: false
  - name: exclude
    description: Glob pattern to exclude sibling directories
    type: string
    required: false
outputs:
  - scan_json
  - total_violations
---

Run the cross-duplication audit scan against the project.

## Instructions

1. Build the scan command from the inputs:
   - Base command: `valora audit scan`
   - Append `{path}` if provided (default: `.`)
   - Append `--depth={depth}` if provided
   - Append `--threshold={threshold}` if provided
   - Append `--concerns={concerns}` if provided
   - Append `--exclude={exclude}` if provided

2. Execute the command using `run_terminal_cmd`. Capture stdout as the JSON report.

3. Check the exit code:
   - Exit code `0`: output a message "No cross-duplication violations found." and set `total_violations` to `0`.
   - Exit code `1`: proceed — set `scan_json` to the captured stdout, parse `summary.totalViolations` from the JSON and set `total_violations`.
   - Exit code `2`: halt with the error message from stderr.

4. Output `scan_json` (the raw JSON string) and `total_violations` (integer).
```

- [ ] **Step 3: Create `prompts/audit.generate-narrative.md`**

```markdown
---
id: audit.generate-narrative
version: 1.0.0
category: audit
experimental: true
name: Generate Cross-Duplication Narrative
description: Transform the structured audit JSON into a prioritised refactoring narrative
tags:
  - audit
  - architecture
  - refactoring
inputs:
  - name: scan_json
    description: JSON string produced by the audit scan stage
    type: string
    required: true
  - name: total_violations
    description: Total violation count from summary
    type: number
    required: true
outputs:
  - narrative_markdown
  - report_path
---

Generate a prioritised refactoring narrative from the cross-duplication audit results.

## Instructions

If `total_violations` is `0`, output:
```

## Cross-Duplication Audit — {date}

No violations found. The project's sibling directories do not share duplicated concerns above the configured threshold.

````

Set `report_path` to empty string and stop.

---

Otherwise, parse `scan_json` and produce the following Markdown report. Follow these constraints exactly:

- Interface sketches must be ≤ 5 lines each.
- Suggested extraction path comes directly from `violation.suggestedExtractionPath` in the JSON — do not invent paths.
- Order violations by `affectedSiblings.length` descending (highest first).
- Order prioritised actions by `affectedSiblings.length` descending.

## Report format

```markdown
## Cross-Duplication Audit — {date}

### Executive summary

{2–3 sentences covering: total violation count, number of sibling groups affected, worst offender (highest N), and the primary concern category.}

### Violations

{For each violation in each sibling group, ordered by affectedSiblings.length descending:}

#### [{SEVERITY}] {concern} — {parentPath}/{affectedSiblings joined with commas}

**Pattern:** {describe what the topKeywords indicate, e.g. "try/catch + Error() repeated in N of M siblings"}
**Affected siblings:** {affectedSiblings.length} of {total siblings in group}
**Suggested extraction:** `{suggestedExtractionPath}`
**Interface sketch:**
{≤5 lines of TypeScript showing the extracted abstraction's public surface}

### Prioritised actions

{Numbered list ordered by affectedSiblings.length descending. Each action names the extraction, the suggested path, and the number of siblings it unblocks.}
````

## After generating the narrative

1. Write the Markdown to `.valora/reports/cross-duplication-{YYYY-MM-DD}.md` using `run_terminal_cmd` with `mkdir -p .valora/reports && cat > .valora/reports/cross-duplication-{date}.md`.
2. Set `report_path` to `.valora/reports/cross-duplication-{date}.md`.
3. Output the full narrative as `narrative_markdown`.

````

- [ ] **Step 4: Verify the plugin is discovered**

From `/workspaces/valora`:
```bash
node -e "
const { readFileSync } = await import('fs');
const manifest = JSON.parse(readFileSync('packages/valora-plugin-cross-duplication-audit/valora-plugin.json', 'utf-8'));
console.log('name:', manifest.name);
console.log('contributes:', manifest.contributes);
console.log('commands dir exists:', require('fs').existsSync('packages/valora-plugin-cross-duplication-audit/commands/audit-cross-duplication.md'));
" --input-type=module
````

Expected:

```
name: valora-plugin-cross-duplication-audit
contributes: [ 'code', 'commands', 'prompts' ]
commands dir exists: true
```

- [ ] **Step 5: Commit**

```bash
git add commands/ prompts/
git commit -m "feat(audit): pipeline command and LLM narrative prompt"
```

---

## Task 8: Register plugin in built-in registry

**Files:**

- Modify: `data/plugins/registry.json` (root of repo)

- [ ] **Step 1: Add entry to `data/plugins/registry.json`**

Open `data/plugins/registry.json` and append to the JSON array (keep alphabetical order by `name`):

```json
{
	"contributes": ["code", "commands", "prompts"],
	"description": "Detects N×M concern accumulation across sibling directories before it becomes structural debt.",
	"integrity": "sha256-PLACEHOLDER",
	"name": "valora-plugin-cross-duplication-audit",
	"package": "@windagency/valora-plugin-cross-duplication-audit",
	"path": "../../packages/valora-plugin-cross-duplication-audit",
	"version": "1.0.0"
}
```

Note: `integrity` is `sha256-PLACEHOLDER` for local workspace plugins — the integrity check applies to published npm tarballs, not workspace symlinks. Verify this assumption by checking how other workspace entries handle `integrity` in the existing registry.

- [ ] **Step 2: Run the full test suite**

From `/workspaces/valora`:

```bash
pnpm --filter @windagency/valora-plugin-cross-duplication-audit test
```

Expected: All tests pass.

- [ ] **Step 3: Final commit**

```bash
git add data/plugins/registry.json
git commit -m "feat(audit): register valora-plugin-cross-duplication-audit in built-in plugin registry"
```
