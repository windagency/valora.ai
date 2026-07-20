import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `valora plugin add` extracts this package's tarball into a bare directory
 * (e.g. `.valora/plugins/valora-plugin-memory-vault/`) with no node_modules
 * of its own and no dependency installation step — unlike this monorepo,
 * where workspace symlinks make every `@windagency/*` package resolvable
 * from anywhere. Any bare import esbuild leaves external in dist/index.js
 * must therefore be satisfied some other way at runtime, or loading the
 * plugin fails outside this repo with "Cannot find package".
 *
 * `@windagency/valora-plugin-api` is safe to leave external: every import of
 * it in this package's source is `import type`, so tsc/esbuild erase it
 * entirely — there's no runtime import statement left to resolve. Anything
 * imported for its *value* (like @windagency/valora-runtime's SafeExecutor,
 * generateMemoryId, getLogger, redactCredentials) must be bundled in.
 *
 * This test proves dist/index.js loads with no ancestor node_modules at all
 * by copying it to a fresh tmp directory outside this repo and importing it
 * in a separate Node process from there.
 */
const DIST_INDEX = join(__dirname, '../dist/index.js');

describe('dist/index.js loads standalone (as `valora plugin add` installs it)', () => {
	it('has no unresolved external runtime import when loaded with no ancestor node_modules', () => {
		if (!existsSync(DIST_INDEX)) {
			throw new Error(`${DIST_INDEX} does not exist — run 'pnpm build' before this test.`);
		}

		const tmp = mkdtempSync(join(tmpdir(), 'valora-plugin-standalone-'));
		try {
			cpSync(join(__dirname, '../dist'), join(tmp, 'dist'), { recursive: true });

			const result = spawnSync(
				process.execPath,
				['--input-type=module', '-e', `await import(${JSON.stringify(join(tmp, 'dist', 'index.js'))});`],
				{ encoding: 'utf-8' }
			);

			expect(result.status, `dist/index.js failed to load standalone:\n${result.stderr}`).toBe(0);
		} finally {
			rmSync(tmp, { force: true, recursive: true });
		}
	});
});
