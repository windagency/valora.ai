/**
 * LSPToolsService — credential-guard parity tests.
 *
 * `read_file`/`run_terminal_cmd` both route through CredentialGuard
 * (`isSensitiveFile` for reads, `scanOutput` for captured output) — LSP's
 * four tool handlers (`goto_definition`/`get_type_info`/`get_diagnostics`/
 * `hover_info`) shared the exact same `file_path`-argument/LLM-visible-output
 * shape but bypassed CredentialGuard entirely, an inconsistent trust
 * boundary: the same argument refused by one tool was accepted verbatim by
 * four others.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetClientForFile = vi.fn();
vi.mock('./lsp-client-manager.service', () => ({
	getLSPClientManager: () => ({ getClientForFile: mockGetClientForFile })
}));

import { LSPToolsService, resetLSPToolsService } from './lsp-tools.service';

describe('LSPToolsService — CredentialGuard parity', () => {
	let projectRoot: string;

	beforeEach(async () => {
		projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-lsp-tools-'));
		mockGetClientForFile.mockReset();
	});

	afterEach(async () => {
		await fs.rm(projectRoot, { force: true, recursive: true });
	});

	function mockWorkingClient(): void {
		mockGetClientForFile.mockResolvedValue({
			sendNotification: vi.fn(),
			sendRequest: vi.fn().mockResolvedValue(null)
		});
	}

	it("refuses to read a sensitive file (.env) for goto_definition, matching read_file's own refusal", async () => {
		await fs.writeFile(path.join(projectRoot, '.env'), 'ANTHROPIC_API_KEY=sk-ant-real-secret-value');
		mockWorkingClient();
		const service = new LSPToolsService(projectRoot);

		const result = await service.executeGotoDefinition({ character: 0, file_path: '.env', line: 0 });

		expect(result).toContain('sensitive');
	});

	it('refuses to read a sensitive file (id_rsa) for hover_info', async () => {
		await fs.writeFile(
			path.join(projectRoot, 'id_rsa'),
			'-----BEGIN RSA PRIVATE KEY-----\nsecret\n-----END RSA PRIVATE KEY-----'
		);
		mockWorkingClient();
		const service = new LSPToolsService(projectRoot);

		const result = await service.executeHoverInfo({ character: 0, file_path: 'id_rsa', line: 0 });

		expect(result).toContain('sensitive');
	});

	it('refuses to read a sensitive file (id_rsa) for get_diagnostics', async () => {
		await fs.writeFile(path.join(projectRoot, 'id_rsa'), 'fake key content');
		mockWorkingClient();
		const service = new LSPToolsService(projectRoot);

		const result = await service.executeGetDiagnostics({ file_path: 'id_rsa' });

		expect(result).toContain('sensitive');
	});

	it('still reads and returns hover info for an ordinary source file with no client available', async () => {
		await fs.writeFile(path.join(projectRoot, 'index.ts'), 'export const x = 1;\n');
		mockGetClientForFile.mockResolvedValue(null);
		const service = new LSPToolsService(projectRoot);

		const result = await service.executeHoverInfo({ character: 0, file_path: 'index.ts', line: 0 });

		expect(result).toBe('No language server available.');
	});

	it('redacts a credential leaked into a hover tooltip before returning it to the caller', async () => {
		await fs.writeFile(
			path.join(projectRoot, 'index.ts'),
			'const x = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890";\n'
		);
		mockGetClientForFile.mockResolvedValue({
			sendNotification: vi.fn(),
			sendRequest: vi.fn().mockResolvedValue({
				contents: 'const x: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890"'
			})
		});
		const service = new LSPToolsService(projectRoot);

		const result = await service.executeHoverInfo({ character: 0, file_path: 'index.ts', line: 0 });

		expect(result).not.toContain('sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890');
	});
});

describe('LSPToolsService — real behaviour', () => {
	let projectRoot: string;

	beforeEach(async () => {
		projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-lsp-tools-'));
		mockGetClientForFile.mockReset();
	});

	afterEach(async () => {
		await fs.rm(projectRoot, { force: true, recursive: true });
		resetLSPToolsService();
	});

	describe('executeGotoDefinition', () => {
		it('formats a found definition as "Definition found at: <path>:<1-based-line>"', async () => {
			await fs.writeFile(path.join(projectRoot, 'index.ts'), 'export function foo() {}\n');
			mockGetClientForFile.mockResolvedValue({
				sendNotification: vi.fn(),
				sendRequest: vi.fn().mockResolvedValue({
					range: { end: { character: 10, line: 4 }, start: { character: 0, line: 4 } },
					uri: 'file:///repo/other.ts'
				})
			});
			const service = new LSPToolsService(projectRoot);

			const result = await service.executeGotoDefinition({ character: 0, file_path: 'index.ts', line: 0 });

			expect(result).toBe('Definition found at: /repo/other.ts:5');
		});

		it('opens the document with the correct LSP languageId inferred from the file extension', async () => {
			await fs.writeFile(path.join(projectRoot, 'main.py'), 'def foo(): pass\n');
			const sendNotification = vi.fn();
			mockGetClientForFile.mockResolvedValue({
				sendNotification,
				sendRequest: vi.fn().mockResolvedValue(null)
			});
			const service = new LSPToolsService(projectRoot);

			await service.executeGotoDefinition({ character: 0, file_path: 'main.py', line: 0 });

			expect(sendNotification).toHaveBeenCalledWith(
				'textDocument/didOpen',
				expect.objectContaining({ textDocument: expect.objectContaining({ languageId: 'python' }) })
			);
		});

		it('returns "No definition found" when the language server returns an empty result', async () => {
			await fs.writeFile(path.join(projectRoot, 'index.ts'), 'export const x = 1;\n');
			mockGetClientForFile.mockResolvedValue({
				sendNotification: vi.fn(),
				sendRequest: vi.fn().mockResolvedValue(null)
			});
			const service = new LSPToolsService(projectRoot);

			const result = await service.executeGotoDefinition({ character: 0, file_path: 'index.ts', line: 0 });

			expect(result).toBe('No definition found');
		});

		it('resolves a position by symbol name when no explicit line/character is given', async () => {
			await fs.writeFile(projectRoot + '/index.ts', 'const a = 1;\nfunction targetSymbol() {}\n');
			const sendRequest = vi.fn().mockResolvedValue(null);
			mockGetClientForFile.mockResolvedValue({ sendNotification: vi.fn(), sendRequest });
			const service = new LSPToolsService(projectRoot);

			await service.executeGotoDefinition({ file_path: 'index.ts', symbol: 'targetSymbol' });

			expect(sendRequest).toHaveBeenCalledWith(
				'textDocument/definition',
				expect.objectContaining({ position: { character: 9, line: 1 } })
			);
		});

		it('returns a resolution error when neither line/character nor a matching symbol is given', async () => {
			await fs.writeFile(path.join(projectRoot, 'index.ts'), 'export const x = 1;\n');
			mockGetClientForFile.mockResolvedValue({ sendNotification: vi.fn(), sendRequest: vi.fn() });
			const service = new LSPToolsService(projectRoot);

			const result = await service.executeGotoDefinition({ file_path: 'index.ts', symbol: 'doesNotExist' });

			expect(result).toBe('Could not resolve position. Provide either symbol name or line/character.');
		});

		it('serves a cache hit without calling the language server a second time', async () => {
			await fs.writeFile(path.join(projectRoot, 'index.ts'), 'export function foo() {}\n');
			const sendRequest = vi.fn().mockResolvedValue({
				range: { end: { character: 10, line: 4 }, start: { character: 0, line: 4 } },
				uri: 'file:///repo/other.ts'
			});
			mockGetClientForFile.mockResolvedValue({ sendNotification: vi.fn(), sendRequest });
			const service = new LSPToolsService(projectRoot);
			await service.executeGotoDefinition({ character: 0, file_path: 'index.ts', line: 0 });

			const result = await service.executeGotoDefinition({ character: 0, file_path: 'index.ts', line: 0 });

			expect(result).toBe('Definition found at: /repo/other.ts:5');
			expect(sendRequest).toHaveBeenCalledTimes(1);
		});

		it('falls back to a grep suggestion when the language server request throws', async () => {
			await fs.writeFile(path.join(projectRoot, 'index.ts'), 'export const x = 1;\n');
			mockGetClientForFile.mockResolvedValue({
				sendNotification: vi.fn(),
				sendRequest: vi.fn().mockRejectedValue(new Error('server crashed'))
			});
			const service = new LSPToolsService(projectRoot);

			const result = await service.executeGotoDefinition({ character: 0, file_path: 'index.ts', line: 0 });

			expect(result).toContain('Use grep');
		});
	});

	describe('executeGetDiagnostics', () => {
		// Deliberately no fake timers here: executeGetDiagnostics() awaits a real
		// fs.readFile() before its internal 2s setTimeout, and interleaving real
		// filesystem I/O completion with a faked clock is a known deadlock risk
		// (the I/O callback lands on the real event loop, not the faked one, so
		// advanceTimersByTimeAsync can return before the timer is even scheduled).
		// Each test below pays the real 2s wait instead.
		async function runGetDiagnostics(service: LSPToolsService, args: Record<string, unknown>): Promise<string> {
			return service.executeGetDiagnostics(args);
		}

		it('formats diagnostics with severity labels and 1-based line numbers', async () => {
			await fs.writeFile(path.join(projectRoot, 'index.ts'), 'export const x = 1;\n');
			mockGetClientForFile.mockResolvedValue({
				sendNotification: vi.fn(),
				sendRequest: vi.fn().mockResolvedValue({
					items: [
						{ message: 'Type mismatch', range: { start: { line: 4 } }, severity: 1 },
						{ message: 'Unused variable', range: { start: { line: 9 } }, severity: 2 }
					]
				})
			});
			const service = new LSPToolsService(projectRoot);

			const result = await runGetDiagnostics(service, { file_path: 'index.ts' });

			expect(result).toBe('index.ts:5 [error] Type mismatch\nindex.ts:10 [warning] Unused variable');
		});

		it('reports no diagnostics when the language server returns an empty item list', async () => {
			await fs.writeFile(path.join(projectRoot, 'index.ts'), 'export const x = 1;\n');
			mockGetClientForFile.mockResolvedValue({
				sendNotification: vi.fn(),
				sendRequest: vi.fn().mockResolvedValue({ items: [] })
			});
			const service = new LSPToolsService(projectRoot);

			const result = await runGetDiagnostics(service, { file_path: 'index.ts' });

			expect(result).toBe(`No diagnostics for index.ts`);
		});

		it('caps displayed diagnostics at 20 items', async () => {
			await fs.writeFile(path.join(projectRoot, 'index.ts'), 'export const x = 1;\n');
			const items = Array.from({ length: 30 }, (_, i) => ({ message: `issue ${i}`, severity: 1 }));
			mockGetClientForFile.mockResolvedValue({
				sendNotification: vi.fn(),
				sendRequest: vi.fn().mockResolvedValue({ items })
			});
			const service = new LSPToolsService(projectRoot);

			const result = await runGetDiagnostics(service, { file_path: 'index.ts' });

			expect(result.split('\n')).toHaveLength(20);
		});

		it('falls back to a compiler-based suggestion when the diagnostics request itself throws', async () => {
			await fs.writeFile(path.join(projectRoot, 'index.ts'), 'export const x = 1;\n');
			mockGetClientForFile.mockResolvedValue({
				sendNotification: vi.fn(),
				sendRequest: vi.fn().mockRejectedValue(new Error('not supported'))
			});
			const service = new LSPToolsService(projectRoot);

			const result = await runGetDiagnostics(service, { file_path: 'index.ts' });

			expect(result).toContain('Diagnostics not available');
		});

		it('reports the file could not be read when the file does not exist on disk', async () => {
			mockGetClientForFile.mockResolvedValue({ sendNotification: vi.fn(), sendRequest: vi.fn() });
			const service = new LSPToolsService(projectRoot);

			const result = await service.executeGetDiagnostics({ file_path: 'missing.ts' });

			expect(result).toContain('Could not read file');
		});
	});

	describe('executeGetTypeInfo', () => {
		it('returns hover-style contents for the resolved position', async () => {
			await fs.writeFile(path.join(projectRoot, 'index.ts'), 'export const x = 1;\n');
			mockGetClientForFile.mockResolvedValue({
				sendNotification: vi.fn(),
				sendRequest: vi.fn().mockResolvedValue({ contents: 'const x: number' })
			});
			const service = new LSPToolsService(projectRoot);

			const result = await service.executeGetTypeInfo({ character: 13, file_path: 'index.ts', line: 0 });

			expect(result).toBe('const x: number');
		});

		it('returns a resolution error when position resolution fails', async () => {
			await fs.writeFile(path.join(projectRoot, 'index.ts'), 'export const x = 1;\n');
			mockGetClientForFile.mockResolvedValue({ sendNotification: vi.fn(), sendRequest: vi.fn() });
			const service = new LSPToolsService(projectRoot);

			const result = await service.executeGetTypeInfo({ file_path: 'index.ts', symbol: 'doesNotExist' });

			expect(result).toBe('Could not resolve position.');
		});
	});

	describe('argument validation', () => {
		it.each([
			['executeGotoDefinition', 'goto_definition'],
			['executeGetTypeInfo', 'get_type_info'],
			['executeGetDiagnostics', 'get_diagnostics'],
			['executeHoverInfo', 'hover_info']
		] as const)('%s requires a file_path argument', async (method, toolName) => {
			const service = new LSPToolsService(projectRoot);

			const result = await service[method]({});

			expect(result).toBe(`${toolName} requires a file_path argument`);
		});
	});
});
