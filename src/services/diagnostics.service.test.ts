/**
 * Tests for diagnostics service
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Config } from 'config/schema';

const mockExists = vi.fn();
const mockLoad = vi.fn();
const mockGetConfigPath = vi.fn();

vi.mock('config/loader', () => ({
	getConfigLoader: vi.fn(() => ({
		exists: mockExists,
		getConfigPath: mockGetConfigPath,
		load: mockLoad
	}))
}));

import { DiagnosticsService } from './diagnostics.service';

function makeConfig(overrides: Partial<Config> = {}): Config {
	return {
		defaults: {
			dry_run: false,
			dry_run_estimate_tokens: true,
			dry_run_show_diffs: true,
			interactive: true,
			log_level: 'info',
			output_format: 'markdown',
			session_mode: true
		},
		providers: {},
		...overrides
	} as Config;
}

describe('DiagnosticsService', () => {
	let service: DiagnosticsService;
	const originalMcpEnv = process.env['AI_MCP_ENABLED'];

	beforeEach(() => {
		mockExists.mockReset();
		mockLoad.mockReset();
		mockGetConfigPath.mockReset();
		delete process.env['AI_MCP_ENABLED'];
		service = new DiagnosticsService();
	});

	afterEach(() => {
		if (originalMcpEnv === undefined) delete process.env['AI_MCP_ENABLED'];
		else process.env['AI_MCP_ENABLED'] = originalMcpEnv;
	});

	describe('checkConfigFile', () => {
		it('passes with the resolved config path when the file exists and loads successfully', async () => {
			mockExists.mockReturnValue(true);
			mockLoad.mockResolvedValue(makeConfig());
			mockGetConfigPath.mockReturnValue('/home/user/.valora/config.json');

			const result = await service.checkConfigFile();

			expect(result).toEqual({ message: 'Found at /home/user/.valora/config.json', status: 'pass' });
		});

		it('fails, auto-fixable, when the config file does not exist', async () => {
			mockExists.mockReturnValue(false);

			const result = await service.checkConfigFile();

			expect(result).toEqual({
				autoFixable: true,
				message: 'Configuration file not found',
				status: 'fail',
				suggestion: 'Run: valora config setup'
			});
			expect(mockLoad).not.toHaveBeenCalled();
		});

		it('fails, auto-fixable, when the config file exists but fails to load (corrupted)', async () => {
			mockExists.mockReturnValue(true);
			mockLoad.mockRejectedValue(new Error('invalid JSON'));

			const result = await service.checkConfigFile();

			expect(result).toEqual({
				autoFixable: true,
				message: 'Configuration file is invalid or corrupted',
				status: 'fail',
				suggestion: 'Run: valora config setup (to reconfigure)'
			});
		});
	});

	describe('checkProviderAccess', () => {
		it('passes without loading config in MCP mode (Cursor provider assumed available)', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';

			const result = await service.checkProviderAccess();

			expect(result).toEqual({ message: 'Cursor provider available', status: 'pass' });
			expect(mockLoad).not.toHaveBeenCalled();
		});

		it('warns, auto-fixable, when providers is missing entirely from the loaded config', async () => {
			mockLoad.mockResolvedValue(makeConfig({ providers: undefined as never }));

			const result = await service.checkProviderAccess();

			expect(result).toEqual({
				autoFixable: true,
				message: 'No providers configured',
				status: 'warn',
				suggestion: 'Run: valora config setup (to add providers)'
			});
		});

		it('warns, auto-fixable, when providers is present but none carry an apiKey', async () => {
			mockLoad.mockResolvedValue(makeConfig({ providers: { anthropic: {} } }));

			const result = await service.checkProviderAccess();

			expect(result).toEqual({
				autoFixable: true,
				message: 'No providers configured (Cursor provider can be used without config)',
				status: 'warn',
				suggestion: 'Run: valora config setup (to add API providers)'
			});
		});

		it('passes with a count when at least one provider carries an apiKey', async () => {
			mockLoad.mockResolvedValue(makeConfig({ providers: { anthropic: { apiKey: 'sk-ant-test' }, openai: {} } }));

			const result = await service.checkProviderAccess();

			expect(result).toEqual({ message: '2 provider(s) configured', status: 'pass' });
		});

		it('fails, auto-fixable, when config loading throws', async () => {
			mockLoad.mockRejectedValue(new Error('disk read error'));

			const result = await service.checkProviderAccess();

			expect(result).toEqual({
				autoFixable: true,
				message: 'Cannot verify provider configuration',
				status: 'fail',
				suggestion: 'Run: valora config setup'
			});
		});
	});

	describe('checkApiKeys', () => {
		it('passes without loading config in MCP mode (API keys optional)', async () => {
			process.env['AI_MCP_ENABLED'] = 'true';

			const result = await service.checkApiKeys();

			expect(result).toEqual({ message: 'Not required (using Cursor provider)', status: 'pass' });
			expect(mockLoad).not.toHaveBeenCalled();
		});

		it('warns, auto-fixable, when providers is missing entirely', async () => {
			mockLoad.mockResolvedValue(makeConfig({ providers: undefined as never }));

			const result = await service.checkApiKeys();

			expect(result).toEqual({
				autoFixable: true,
				message: 'No API keys configured (optional with Cursor provider)',
				status: 'warn',
				suggestion: 'API keys are optional when using Cursor provider'
			});
		});

		it('warns, auto-fixable, when providers exist but none carry an apiKey', async () => {
			mockLoad.mockResolvedValue(makeConfig({ providers: { anthropic: {} } }));

			const result = await service.checkApiKeys();

			expect(result).toEqual({
				autoFixable: true,
				message: 'No API keys configured (optional with Cursor provider)',
				status: 'warn',
				suggestion: 'Run: valora config setup (to add API keys for other providers)'
			});
		});

		it('passes with a count when at least one apiKey is present', async () => {
			mockLoad.mockResolvedValue(
				makeConfig({ providers: { anthropic: { apiKey: 'sk-ant-test' }, openai: { apiKey: 'sk-oai-test' } } })
			);

			const result = await service.checkApiKeys();

			expect(result).toEqual({ message: '2 API key(s) configured', status: 'pass' });
		});

		it('warns (not fails) when config loading throws — API keys are optional, so a load error should not block startup', async () => {
			mockLoad.mockRejectedValue(new Error('disk read error'));

			const result = await service.checkApiKeys();

			expect(result).toEqual({
				message: 'Cannot verify API keys',
				status: 'warn',
				suggestion: 'Configuration file may be corrupted'
			});
		});
	});

	describe('checkEnvironmentVariables', () => {
		it('passes and reports the count when an optional provider API key is present in the environment', () => {
			const original = process.env['ANTHROPIC_API_KEY'];
			process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';

			const result = service.checkEnvironmentVariables();

			expect(result).toEqual({ message: '1 optional API key(s) found in environment', status: 'pass' });

			if (original === undefined) delete process.env['ANTHROPIC_API_KEY'];
			else process.env['ANTHROPIC_API_KEY'] = original;
		});

		it('passes with the generic message when no optional API keys are present', () => {
			const savedKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY'].map(
				(k) => [k, process.env[k]] as const
			);
			for (const [k] of savedKeys) delete process.env[k];

			const result = service.checkEnvironmentVariables();

			expect(result).toEqual({ message: 'All required environment variables set', status: 'pass' });

			for (const [k, v] of savedKeys) if (v !== undefined) process.env[k] = v;
		});

		it('KNOWN GAP: the "missing required variables" fail branch is dead code — requiredVars is hardcoded to an empty array, so missingRequired can never be non-empty', () => {
			// Documented rather than "fixed" here: there is no indication elsewhere in the
			// codebase of which env vars (if any) are actually meant to be required, so
			// populating requiredVars would be guessing at intended behaviour rather than
			// following an obvious fix.
			const result = service.checkEnvironmentVariables();

			expect(result.status).not.toBe('fail');
		});
	});

	describe('checkConfigValidation', () => {
		it('fails when the config file does not exist', async () => {
			mockExists.mockReturnValue(false);

			const result = await service.checkConfigValidation();

			expect(result).toEqual({
				message: 'Configuration file not found',
				status: 'fail',
				suggestion: 'Run: valora config setup'
			});
			expect(mockLoad).not.toHaveBeenCalled();
		});

		it('passes when the config file exists and has a defaults section', async () => {
			mockExists.mockReturnValue(true);
			mockLoad.mockResolvedValue(makeConfig());

			const result = await service.checkConfigValidation();

			expect(result).toEqual({ message: 'Schema valid', status: 'pass' });
		});

		it('fails when the loaded config is missing its defaults section', async () => {
			mockExists.mockReturnValue(true);
			mockLoad.mockResolvedValue(makeConfig({ defaults: undefined as never }));

			const result = await service.checkConfigValidation();

			expect(result).toEqual({
				message: 'Configuration missing defaults section',
				status: 'fail',
				suggestion: 'Run: valora config setup (to repair configuration)'
			});
		});

		it('fails with a corruption message when loading throws', async () => {
			mockExists.mockReturnValue(true);
			mockLoad.mockRejectedValue(new Error('parse error'));

			const result = await service.checkConfigValidation();

			expect(result).toEqual({
				message: 'Schema validation failed',
				status: 'fail',
				suggestion: 'Configuration file may be corrupted. Run: valora config setup'
			});
		});
	});

	describe('runAllChecks', () => {
		beforeEach(() => {
			mockExists.mockReturnValue(true);
			mockLoad.mockResolvedValue(makeConfig({ providers: { anthropic: { apiKey: 'sk-ant-test' } } }));
			mockGetConfigPath.mockReturnValue('/home/user/.valora/config.json');
		});

		it('runs exactly the 5 declared checks and returns one result each', async () => {
			const results = await service.runAllChecks();

			expect(results).toHaveLength(5);
			expect(results.every((r) => r.status === 'pass')).toBe(true);
		});

		it('converts a rejected check into a "fail" result carrying the error message as the suggestion, without losing the other checks', async () => {
			vi.spyOn(service, 'checkConfigFile').mockRejectedValue(new Error('Test error'));

			const results = await service.runAllChecks();

			expect(results).toHaveLength(5);
			expect(results).toContainEqual({
				message: 'Check failed unexpectedly',
				status: 'fail',
				suggestion: 'Test error'
			});
			expect(results.filter((r) => r.status === 'pass')).toHaveLength(4);
		});

		it('falls back to a generic message when the rejection reason is not an Error or a string', async () => {
			vi.spyOn(service, 'checkApiKeys').mockRejectedValue({ some: 'object' });

			const results = await service.runAllChecks();

			expect(results).toContainEqual({
				message: 'Check failed unexpectedly',
				status: 'fail',
				suggestion: 'Unknown error'
			});
		});
	});

	describe('autoFix', () => {
		it('returns false for non-fixable issues', () => {
			const result = { autoFixable: false, message: 'Test issue', status: 'fail' as const };

			expect(service.autoFix(result)).toBe(false);
		});

		it('returns false for fixable issues (auto-fix logic is not yet implemented)', () => {
			const result = { autoFixable: true, message: 'Test issue', status: 'fail' as const };

			expect(service.autoFix(result)).toBe(false);
		});
	});
});
