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

import { LSPToolsService } from './lsp-tools.service';

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
