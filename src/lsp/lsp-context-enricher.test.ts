import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetClientForFile } = vi.hoisted(() => ({ mockGetClientForFile: vi.fn() }));

vi.mock('./lsp-client-manager.service', () => ({
	getLSPClientManager: vi.fn(() => ({ getClientForFile: mockGetClientForFile }))
}));

import { enrichContextWithDiagnostics, getFileDiagnosticSummary } from './lsp-context-enricher';

function makeClient(sendRequest: ReturnType<typeof vi.fn>): { sendRequest: ReturnType<typeof vi.fn> } {
	return { sendRequest };
}

describe('enrichContextWithDiagnostics', () => {
	beforeEach(() => {
		mockGetClientForFile.mockReset();
	});

	it('returns null when no file has a supported LSP client', async () => {
		mockGetClientForFile.mockResolvedValue(null);

		const result = await enrichContextWithDiagnostics(['foo.unknown'], '/repo');

		expect(result).toBeNull();
	});

	it('returns null when the client returns no error/warning diagnostics', async () => {
		mockGetClientForFile.mockResolvedValue(makeClient(vi.fn().mockResolvedValue({ items: [] })));

		const result = await enrichContextWithDiagnostics(['foo.ts'], '/repo');

		expect(result).toBeNull();
	});

	it('formats errors and warnings with 1-based line numbers under a per-file header', async () => {
		mockGetClientForFile.mockResolvedValue(
			makeClient(
				vi.fn().mockResolvedValue({
					items: [
						{ message: 'Type mismatch', range: { start: { line: 4 } }, severity: 1 },
						{ message: 'Unused variable', range: { start: { line: 9 } }, severity: 2 }
					]
				})
			)
		);

		const result = await enrichContextWithDiagnostics(['foo.ts'], '/repo');

		expect(result).toBe(
			'## Compiler Diagnostics\n\n### foo.ts\n  ERROR line 5: Type mismatch\n  WARN line 10: Unused variable'
		);
	});

	it('omits diagnostics with a severity other than error/warning (e.g. info/hint)', async () => {
		mockGetClientForFile.mockResolvedValue(
			makeClient(vi.fn().mockResolvedValue({ items: [{ message: 'FYI', severity: 3 }] }))
		);

		const result = await enrichContextWithDiagnostics(['foo.ts'], '/repo');

		expect(result).toBeNull();
	});

	it('caps diagnostics per file at 10 items, prioritising errors over warnings', async () => {
		const errors = Array.from({ length: 8 }, (_, i) => ({ message: `err${i}`, severity: 1 }));
		const warnings = Array.from({ length: 5 }, (_, i) => ({ message: `warn${i}`, severity: 2 }));
		mockGetClientForFile.mockResolvedValue(makeClient(vi.fn().mockResolvedValue({ items: [...errors, ...warnings] })));

		const result = await enrichContextWithDiagnostics(['foo.ts'], '/repo');
		const lines = result?.split('\n').filter((l) => l.startsWith('  '));

		expect(lines).toHaveLength(10);
		expect(lines?.filter((l) => l.includes('ERROR'))).toHaveLength(8);
		expect(lines?.filter((l) => l.includes('WARN'))).toHaveLength(2);
	});

	it('skips a file whose diagnostics request throws, without failing the whole batch', async () => {
		mockGetClientForFile.mockResolvedValueOnce(makeClient(vi.fn().mockRejectedValue(new Error('server crashed'))));
		mockGetClientForFile.mockResolvedValueOnce(
			makeClient(vi.fn().mockResolvedValue({ items: [{ message: 'real error', severity: 1 }] }))
		);

		const result = await enrichContextWithDiagnostics(['broken.ts', 'ok.ts'], '/repo');

		expect(result).toContain('### ok.ts');
		expect(result).not.toContain('broken.ts');
	});

	it('aggregates diagnostics across multiple files into a single report', async () => {
		mockGetClientForFile.mockResolvedValueOnce(
			makeClient(vi.fn().mockResolvedValue({ items: [{ message: 'e1', severity: 1 }] }))
		);
		mockGetClientForFile.mockResolvedValueOnce(
			makeClient(vi.fn().mockResolvedValue({ items: [{ message: 'e2', severity: 1 }] }))
		);

		const result = await enrichContextWithDiagnostics(['a.ts', 'b.ts'], '/repo');

		expect(result).toContain('### a.ts');
		expect(result).toContain('### b.ts');
	});
});

describe('getFileDiagnosticSummary', () => {
	beforeEach(() => {
		mockGetClientForFile.mockReset();
	});

	it('returns null when no LSP client is available for the file', async () => {
		mockGetClientForFile.mockResolvedValue(null);

		const result = await getFileDiagnosticSummary('foo.unknown', '/repo');

		expect(result).toBeNull();
	});

	it('returns null when the diagnostics request throws', async () => {
		mockGetClientForFile.mockResolvedValue(makeClient(vi.fn().mockRejectedValue(new Error('crashed'))));

		const result = await getFileDiagnosticSummary('foo.ts', '/repo');

		expect(result).toBeNull();
	});

	it('counts errors and warnings separately', async () => {
		mockGetClientForFile.mockResolvedValue(
			makeClient(
				vi.fn().mockResolvedValue({
					items: [{ severity: 1 }, { severity: 1 }, { severity: 2 }, { severity: 3 }]
				})
			)
		);

		const result = await getFileDiagnosticSummary('foo.ts', '/repo');

		expect(result).toEqual({ errors: 2, warnings: 1 });
	});

	it('returns zero counts when there are no diagnostic items', async () => {
		mockGetClientForFile.mockResolvedValue(makeClient(vi.fn().mockResolvedValue({ items: [] })));

		const result = await getFileDiagnosticSummary('foo.ts', '/repo');

		expect(result).toEqual({ errors: 0, warnings: 0 });
	});
});
