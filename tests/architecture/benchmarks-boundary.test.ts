/**
 * Architecture boundary tests for tests/benchmarks/compression/.
 *
 * The benchmark harness is allowed to import from:
 *   - executor/output-compression.service (the public compression surface)
 *   - packages/valora-plugin-compression-* index files (plugin registration)
 *   - plugins/plugin-api.types (type import only)
 *   - Node built-ins (node:fs, node:path, node:os, etc.)
 *   - Other files within tests/benchmarks/compression/ (relative ./ or ../)
 *
 * It must NOT import from executor internals beyond output-compression.service,
 * nor from cli, llm, mcp, services, or session.
 */

import { readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const BENCHMARKS_DIR = resolve(process.cwd(), 'tests/benchmarks/compression');

const FORBIDDEN_PATTERNS: RegExp[] = [
	/from ['"]cli\//,
	/from ['"]llm\//,
	/from ['"]mcp\//,
	/from ['"]services\//,
	/from ['"]session\//,
	// executor internals beyond the one allowed module
	/from ['"]executor\/(?!output-compression\.service['"])/,
	// absolute src imports to forbidden modules
	/from ['"].*\/src\/(?:cli|llm|mcp|services|session)\//
];

async function collectTsFiles(dir: string): Promise<string[]> {
	const { readdir, stat } = await import('node:fs/promises');
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectTsFiles(full)));
		} else if (entry.isFile() && entry.name.endsWith('.ts')) {
			files.push(full);
		}
	}
	return files;
}

describe('Benchmark harness module boundary', () => {
	it('benchmark files do not import from forbidden modules', async () => {
		const files = await collectTsFiles(BENCHMARKS_DIR);
		expect(files.length).toBeGreaterThan(0);

		const violations: string[] = [];

		for (const file of files) {
			const source = await readFile(file, 'utf-8');
			const relPath = relative(process.cwd(), file);

			for (const pattern of FORBIDDEN_PATTERNS) {
				const lines = source.split('\n');
				lines.forEach((line, idx) => {
					if (pattern.test(line)) {
						violations.push(`${relPath}:${idx + 1}: ${line.trim()}`);
					}
				});
			}
		}

		expect(violations, `Benchmark files import from forbidden modules:\n${violations.join('\n')}`).toHaveLength(0);
	});
});
