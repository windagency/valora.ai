import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('output/logger', () => ({
	getLogger: () => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	})
}));

import { DocumentPathResolverService } from './document-path-resolver.service';
import { DocumentWriterService } from './document-writer.service';

describe('DocumentWriterService — writeToPath containment', () => {
	// writeToPath only called validateNotForbiddenPath's small `.valora/`/
	// `data/` denylist, no root-containment check — reachable via
	// --document-path/documentPath on `exec`/shortcut CLI commands.
	let originalCwd: string;
	let cwdDir: string;
	let writer: DocumentWriterService;

	beforeEach(() => {
		originalCwd = process.cwd();
		cwdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-docwriter-'));
		process.chdir(cwdDir);
		writer = new DocumentWriterService(new DocumentPathResolverService());
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(cwdDir, { force: true, recursive: true });
	});

	it('blocks writing to an absolute path outside the working directory', () => {
		const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-docwriter-outside-'));
		const target = path.join(outsideDir, 'pwned.md');

		const result = writer.writeToPath('pwned content', target);

		expect(result.success).toBe(false);
		expect(fs.existsSync(target)).toBe(false);

		fs.rmSync(outsideDir, { recursive: true, force: true });
	});

	it('blocks writing via ../ traversal escaping the working directory', () => {
		const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-docwriter-outside-'));
		const escapedName = `escaped-${Date.now()}.md`;
		const relative = path.relative(cwdDir, path.join(outsideDir, escapedName));

		const result = writer.writeToPath('pwned content', relative);

		expect(result.success).toBe(false);
		expect(fs.existsSync(path.join(outsideDir, escapedName))).toBe(false);

		fs.rmSync(outsideDir, { recursive: true, force: true });
	});

	it('still allows writing to a path inside the working directory', () => {
		const result = writer.writeToPath('hello', 'nested/doc.md');

		expect(result.success).toBe(true);
		expect(fs.readFileSync(path.join(cwdDir, 'nested', 'doc.md'), 'utf-8')).toBe('hello');
	});
});
