import * as fs from 'fs';
import * as path from 'path';

import { describe, it } from 'vitest';

const ROOT = path.join(__dirname, '../..');
const SRC_DIR = path.join(ROOT, 'src');
const MEMORY_DIR = path.join(ROOT, 'src/memory');
const EMBEDDINGS_DIR = path.join(ROOT, 'src/memory/embeddings');
const SERVICES_DIR = path.join(ROOT, 'src/services');
const VAULT_DIR = path.join(MEMORY_DIR, 'vault');
const MIGRATION_DIR = path.join(MEMORY_DIR, 'migration');

function getTypeScriptSources(dir: string): string[] {
	const files: string[] = [];
	if (!fs.existsSync(dir)) return files;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory() && entry.name !== 'node_modules') {
			files.push(...getTypeScriptSources(full));
		} else if (
			entry.isFile() &&
			entry.name.endsWith('.ts') &&
			!entry.name.includes('.test.') &&
			!entry.name.includes('.spec.')
		) {
			files.push(full);
		}
	}
	return files;
}

function importsFrom(content: string, modulePattern: string): boolean {
	return new RegExp(`from\\s+['"]${modulePattern}['"]`).test(content);
}

/**
 * Strip line and block comments before scanning for forbidden patterns. This
 * prevents false positives where the banned token only appears in JSDoc or
 * a code comment explaining the rule.
 */
function stripComments(content: string): string {
	return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
}

/**
 * Strip import statements before scanning for symbols, so that having
 * `import { writeFileSync } from 'node:fs'` does not falsely match a rule
 * that bans call sites of `writeFileSync`.
 */
function stripImports(content: string): string {
	return content.replace(/^\s*import\s+[^;]+;\s*$/gm, '');
}

describe('Memory Vault Architecture', () => {
	describe('Embedder isolation', () => {
		it('only src/memory/embeddings/ may import from types/llm.types within the memory module', () => {
			const violations = getTypeScriptSources(MEMORY_DIR)
				.filter((file) => !file.startsWith(EMBEDDINGS_DIR))
				.filter((file) => importsFrom(fs.readFileSync(file, 'utf-8'), 'types/llm\\.types'))
				.map((file) => path.relative(ROOT, file));

			if (violations.length > 0) {
				throw new Error(
					`Only src/memory/embeddings/ files may import from 'types/llm.types'.\n` +
						`Violations:\n  - ${violations.join('\n  - ')}\n\n` +
						`Use EmbedderPort from 'memory/embeddings/embedder.port' instead.`
				);
			}
		});

		it('MemoryManager does not directly import any concrete embedder implementation', () => {
			const managerPath = path.join(MEMORY_DIR, 'manager.ts');
			if (!fs.existsSync(managerPath)) return;

			const content = fs.readFileSync(managerPath, 'utf-8');
			const concreteImport = /from\s+['"].*llm-provider-embedder['"]/;

			if (concreteImport.test(content)) {
				throw new Error(
					`MemoryManager must not import a concrete embedder implementation.\n` +
						`Inject EmbedderPort via the DI container instead.`
				);
			}
		});

		it('no memory file outside embeddings/ imports directly from the llm/ module', () => {
			const violations = getTypeScriptSources(MEMORY_DIR)
				.filter((file) => !file.startsWith(EMBEDDINGS_DIR))
				.filter((file) => /from\s+['"]llm\//.test(fs.readFileSync(file, 'utf-8')))
				.map((file) => path.relative(ROOT, file));

			if (violations.length > 0) {
				throw new Error(
					`Direct llm/ import in memory/ outside embeddings/:\n  - ${violations.join('\n  - ')}\n\n` +
						`Memory must reach embedders via EmbedderPort, never via concrete LLM modules.`
				);
			}
		});
	});

	describe('Vault is the only backend', () => {
		it('MemoryStore is not instantiated outside the migration module or its own definition file', () => {
			const allowed = [/src\/memory\/store\.ts$/, /src\/memory\/migration\//];
			const violations = getTypeScriptSources(SRC_DIR)
				.filter((file) => !allowed.some((p) => p.test(file)))
				.filter((file) => /\bnew\s+MemoryStore\s*\(/.test(stripComments(fs.readFileSync(file, 'utf-8'))))
				.map((file) => path.relative(ROOT, file));

			if (violations.length > 0) {
				throw new Error(
					`new MemoryStore() may only appear in src/memory/store.ts or src/memory/migration/.\n` +
						`Violations:\n  - ${violations.join('\n  - ')}\n\n` +
						`Use VaultStore (resolved via DI) for production code paths.`
				);
			}
		});

		it('non-memory modules do not import the legacy MemoryStore class', () => {
			const violations = getTypeScriptSources(SRC_DIR)
				.filter((file) => !file.startsWith(MEMORY_DIR))
				.filter((file) => /from\s+['"]memory\/store['"]/.test(fs.readFileSync(file, 'utf-8')))
				.map((file) => path.relative(ROOT, file));

			if (violations.length > 0) {
				throw new Error(
					`Files outside src/memory/ must not import from 'memory/store' (legacy JSON backend).\n` +
						`Violations:\n  - ${violations.join('\n  - ')}\n\n` +
						`Inject the singleton VaultStore via the DI container instead.`
				);
			}
		});
	});

	describe('Atomic writes only', () => {
		it('vault, embeddings, and migration source files do not call writeFileSync directly', () => {
			const targetDirs = [VAULT_DIR, EMBEDDINGS_DIR, MIGRATION_DIR];
			const allowedFiles = [/src\/memory\/vault\/file-format\.ts$/];
			const violations: string[] = [];

			for (const dir of targetDirs) {
				for (const file of getTypeScriptSources(dir)) {
					if (allowedFiles.some((p) => p.test(file))) continue;
					const raw = fs.readFileSync(file, 'utf-8');
					const code = stripComments(stripImports(raw));
					if (/\bwriteFileSync\s*\(/.test(code)) {
						violations.push(path.relative(ROOT, file));
					}
				}
			}

			if (violations.length > 0) {
				throw new Error(
					`Raw writeFileSync call in memory/vault, memory/embeddings, or memory/migration:\n  - ${violations.join('\n  - ')}\n\n` +
						`Use atomicWriteFile (or atomicWriteBuffer) from memory/vault/file-format.`
				);
			}
		});
	});

	describe('No placeholder model literals', () => {
		it('production memory and memory-service files contain no placeholder/stub embedding model strings', () => {
			const banned = /['"](?:stub|placeholder|fake|dummy)['"]/i;
			const candidates = [
				...getTypeScriptSources(MEMORY_DIR),
				...getTypeScriptSources(SERVICES_DIR).filter((f) => /memory-/.test(path.basename(f)))
			];
			const violations = candidates
				.filter((file) => banned.test(stripComments(fs.readFileSync(file, 'utf-8'))))
				.map((file) => path.relative(ROOT, file));

			if (violations.length > 0) {
				throw new Error(
					`Placeholder model literal found in production memory code:\n  - ${violations.join('\n  - ')}\n\n` +
						`Embedding model and dim must come from configuration or on-disk metadata, not literals.`
				);
			}
		});
	});

	describe('No native binaries', () => {
		it('memory module contains no native binary requires or node-gyp references', () => {
			const nativePattern = /require\s*\(\s*['"][^'"]+\.node['"]\s*\)|node-gyp|\bbindings\s*\(/;
			const violations = getTypeScriptSources(MEMORY_DIR)
				.filter((file) => nativePattern.test(stripComments(fs.readFileSync(file, 'utf-8'))))
				.map((file) => path.relative(ROOT, file));

			if (violations.length > 0) {
				throw new Error(
					`Native binary dependency in memory/:\n  - ${violations.join('\n  - ')}\n\n` +
						`ADR-013 mandates pure TypeScript with file I/O only.`
				);
			}
		});
	});

	describe('External code uses public memory API', () => {
		it('non-memory modules only import from memory/ via top-level paths, not internals', () => {
			const allowedTopLevel = new Set(['index', 'manager', 'store']);
			const violations: string[] = [];

			for (const file of getTypeScriptSources(SRC_DIR)) {
				if (file.startsWith(MEMORY_DIR)) continue;
				const content = fs.readFileSync(file, 'utf-8');
				const matches = [...content.matchAll(/from\s+['"]memory\/([^'"\n]+)['"]/g)];
				for (const match of matches) {
					const relative = match[1] ?? '';
					const segments = relative.split('/');
					const head = segments[0] ?? '';
					if (segments.length > 1 && !allowedTopLevel.has(head)) {
						violations.push(`${path.relative(ROOT, file)} -> memory/${relative}`);
					}
				}
			}

			if (violations.length > 0) {
				throw new Error(
					`External files reach memory internals (use the public surface from memory/index instead):\n  - ${violations.join('\n  - ')}`
				);
			}
		});
	});

	describe('Function length cap', () => {
		it('no top-level function in src/memory/ exceeds 50 lines', () => {
			const limit = 50;
			const violations: string[] = [];

			for (const file of getTypeScriptSources(MEMORY_DIR)) {
				const lines = fs.readFileSync(file, 'utf-8').split('\n');
				let depth = 0;
				let start = -1;
				let label = '';
				const opener = /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+\w+|\w+\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{)/;

				lines.forEach((line, i) => {
					if (depth === 0 && start === -1 && opener.test(line)) {
						start = i;
						label = line.trim().slice(0, 80);
					}
					depth += (line.match(/\{/g) ?? []).length;
					depth -= (line.match(/\}/g) ?? []).length;
					if (depth <= 0 && start !== -1) {
						const length = i - start + 1;
						if (length > limit) {
							violations.push(`${path.relative(ROOT, file)}:${start + 1} (${length} lines) — ${label}`);
						}
						start = -1;
						depth = 0;
					}
				});
			}

			if (violations.length > 0) {
				throw new Error(`Function exceeds the ${limit}-line cap in src/memory/:\n  - ${violations.join('\n  - ')}`);
			}
		});
	});

	describe('Embedder adapter exists', () => {
		it('LlmProviderEmbedder is defined under src/memory/embeddings/ and implements EmbedderPort', () => {
			const adapterPath = path.join(EMBEDDINGS_DIR, 'llm-provider-embedder.ts');
			if (!fs.existsSync(adapterPath)) {
				throw new Error(`Expected src/memory/embeddings/llm-provider-embedder.ts to exist (ADR-013 §4 adapter).`);
			}
			const content = fs.readFileSync(adapterPath, 'utf-8');
			if (!/implements\s+EmbedderPort/.test(content)) {
				throw new Error(`LlmProviderEmbedder must declare 'implements EmbedderPort'.`);
			}
		});
	});

	describe('CLI completeness', () => {
		it('valora memory reembed subcommand is registered', () => {
			const cmdPath = path.join(ROOT, 'src/cli/commands/memory.command.ts');
			if (!fs.existsSync(cmdPath)) {
				throw new Error(`memory.command.ts not found at ${cmdPath}`);
			}
			const content = fs.readFileSync(cmdPath, 'utf-8');
			if (!/['"]reembed['"]/.test(content)) {
				throw new Error(`'reembed' subcommand must be registered in memory.command.ts (ADR-013 §4 remediation path).`);
			}
		});
	});

	describe('Documentation status', () => {
		it('ADR-013 status is Accepted (implementation is complete)', () => {
			const adrPath = path.join(ROOT, 'documentation/adr/013-vault-and-embeddings.md');
			if (!fs.existsSync(adrPath)) return;
			const content = fs.readFileSync(adrPath, 'utf-8');
			const match = content.match(/^##\s+Status\s*\n+(\w+)/m);
			const status = match?.[1]?.trim();
			if (status !== 'Accepted') {
				throw new Error(
					`ADR-013 status must be 'Accepted' once the vault implementation has shipped.\nFound: '${status ?? 'missing'}'.`
				);
			}
		});
	});
});
