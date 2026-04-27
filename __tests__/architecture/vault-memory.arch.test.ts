import * as fs from 'fs';
import * as path from 'path';

import { describe, it } from 'vitest';

const ROOT = path.join(__dirname, '../..');
const MEMORY_DIR = path.join(ROOT, 'src/memory');
const EMBEDDINGS_DIR = path.join(ROOT, 'src/memory/embeddings');

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
	});
});
