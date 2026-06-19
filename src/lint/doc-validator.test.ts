import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DocValidator } from './doc-validator';

const fixturesDir = path.join(import.meta.dirname, '__fixtures__');

describe('DocValidator', () => {
	it('reports no errors for a valid doc with current frontmatter and live links', async () => {
		const validator = new DocValidator({ stalenessThresholdDays: 365 });
		const result = await validator.validateFile(path.join(fixturesDir, 'valid.md'));

		expect(result.errors).toHaveLength(0);
		expect(result.scannedFiles).toBe(1);
	});

	it('reports missing-updated when frontmatter has no updated field', async () => {
		const validator = new DocValidator({ stalenessThresholdDays: 365 });
		const result = await validator.validateFile(path.join(fixturesDir, 'missing-updated.md'));

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.kind).toBe('missing-updated');
		expect(result.errors[0]?.remedy).toContain('updated:');
	});

	it('reports stale-updated when updated date exceeds the threshold', async () => {
		const validator = new DocValidator({ stalenessThresholdDays: 30 });
		const result = await validator.validateFile(path.join(fixturesDir, 'stale-updated.md'));

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.kind).toBe('stale-updated');
		expect(result.errors[0]?.remedy).toContain('updated:');
	});

	it('reports broken-link when a markdown link points to a non-existent file', async () => {
		const validator = new DocValidator({ stalenessThresholdDays: 365 });
		const result = await validator.validateFile(path.join(fixturesDir, 'broken-link.md'));

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.kind).toBe('broken-link');
		expect(result.errors[0]?.remedy).toContain('does-not-exist.md');
	});

	it('accumulates errors across a directory', async () => {
		const validator = new DocValidator({ stalenessThresholdDays: 30 });
		const result = await validator.validateDirectory(fixturesDir);

		expect(result.scannedFiles).toBe(4);
		expect(result.errors.length).toBeGreaterThanOrEqual(3);
	});
});
