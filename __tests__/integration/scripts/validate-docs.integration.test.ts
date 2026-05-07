import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const REPO_ROOT = join(import.meta.dirname ?? __dirname, '..', '..', '..');
const SCRIPT_PATH = join(REPO_ROOT, 'scripts', 'validate-docs.ts');

interface ScriptResult {
	exitCode: number;
	stderr: string;
	stdout: string;
}

function runValidator(targetDir: string): ScriptResult {
	try {
		const stdout = execFileSync('pnpm', ['exec', 'tsx', SCRIPT_PATH, targetDir], {
			cwd: REPO_ROOT,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		});
		return { exitCode: 0, stdout, stderr: '' };
	} catch (error) {
		const e = error as { status: number; stdout: Buffer | string; stderr: Buffer | string };
		return {
			exitCode: e.status ?? 1,
			stdout: typeof e.stdout === 'string' ? e.stdout : (e.stdout?.toString() ?? ''),
			stderr: typeof e.stderr === 'string' ? e.stderr : (e.stderr?.toString() ?? '')
		};
	}
}

describe('scripts/validate-docs', () => {
	let fixtureRoot: string;

	beforeEach(() => {
		fixtureRoot = mkdtempSync(join(tmpdir(), 'valora-docs-validate-'));
	});

	afterEach(() => {
		rmSync(fixtureRoot, { recursive: true, force: true });
	});

	it('exits 0 with success message when every doc has fresh frontmatter', () => {
		const docsDir = join(fixtureRoot, 'docs');
		mkdirSync(docsDir, { recursive: true });
		writeFileSync(
			join(docsDir, 'good.md'),
			`---\nupdated: ${new Date().toISOString().slice(0, 10)}\n---\n\n# Doc\n`,
			'utf8'
		);

		const result = runValidator(docsDir);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toMatch(/1 docs scanned/);
	});

	it('exits 1 and reports missing-updated when a doc lacks frontmatter', () => {
		const docsDir = join(fixtureRoot, 'docs');
		mkdirSync(docsDir, { recursive: true });
		writeFileSync(join(docsDir, 'bad.md'), `# Doc with no frontmatter\n`, 'utf8');

		const result = runValidator(docsDir);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch(/MISSING-UPDATED/);
		expect(result.stderr).toMatch(/bad\.md/);
	});

	it('exits non-zero with a clear message when the target directory does not exist', () => {
		const missing = join(fixtureRoot, 'does-not-exist');

		const result = runValidator(missing);

		expect(result.exitCode).not.toBe(0);
		expect(`${result.stdout}${result.stderr}`).toMatch(/does not exist|ENOENT/);
	});
});
