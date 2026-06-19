import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DocGardenerService } from './doc-gardener.service';

vi.mock('src/lint/doc-validator', () => ({
	DocValidator: vi.fn().mockImplementation(() => ({
		validateDirectory: vi.fn()
	}))
}));

describe('DocGardenerService', () => {
	let validateDirectoryMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		validateDirectoryMock = vi.fn();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('classifies stale errors correctly', async () => {
		validateDirectoryMock.mockResolvedValue({
			errors: [{ file: 'doc.md', kind: 'stale-updated', message: 'stale', remedy: 'update it' }],
			scannedFiles: 1
		});

		const svc = new DocGardenerService({ validateDirectory: validateDirectoryMock } as never);
		const report = await svc.garden('/docs');
		expect(report.stale).toHaveLength(1);
		expect(report.broken).toHaveLength(0);
	});

	it('classifies missing-updated as stale', async () => {
		validateDirectoryMock.mockResolvedValue({
			errors: [{ file: 'doc.md', kind: 'missing-updated', message: 'missing', remedy: 'add it' }],
			scannedFiles: 1
		});

		const svc = new DocGardenerService({ validateDirectory: validateDirectoryMock } as never);
		const report = await svc.garden('/docs');
		expect(report.stale).toHaveLength(1);
	});

	it('classifies broken-link errors correctly', async () => {
		validateDirectoryMock.mockResolvedValue({
			errors: [{ file: 'doc.md', kind: 'broken-link', message: 'broken', remedy: 'fix link' }],
			scannedFiles: 1
		});

		const svc = new DocGardenerService({ validateDirectory: validateDirectoryMock } as never);
		const report = await svc.garden('/docs');
		expect(report.broken).toHaveLength(1);
		expect(report.stale).toHaveLength(0);
	});

	it('returns scanned file count', async () => {
		validateDirectoryMock.mockResolvedValue({ errors: [], scannedFiles: 5 });
		const svc = new DocGardenerService({ validateDirectory: validateDirectoryMock } as never);
		const report = await svc.garden('/docs');
		expect(report.scannedFiles).toBe(5);
	});
});
