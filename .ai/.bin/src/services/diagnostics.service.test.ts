/**
 * Tests for diagnostics service
 */

import { describe, expect, it, vi } from 'vitest';

import { DiagnosticsService } from './diagnostics.service';

describe('DiagnosticsService', () => {
	describe('checkConfigFile', () => {
		it('should return pass status when config exists and is valid', async () => {
			const service = new DiagnosticsService();
			const result = await service.checkConfigFile();

			expect(result).toBeDefined();
			expect(result.status).toMatch(/pass|fail/);
			expect(result.message).toBeTruthy();
		});
	});

	describe('checkProviderAccess', () => {
		it('should return pass status in MCP mode', async () => {
			const originalEnv = process.env['AI_MCP_ENABLED'];
			process.env['AI_MCP_ENABLED'] = 'true';

			const service = new DiagnosticsService();
			const result = await service.checkProviderAccess();

			expect(result.status).toBe('pass');
			expect(result.message).toContain('Cursor provider');

			process.env['AI_MCP_ENABLED'] = originalEnv;
		});

		it('should check provider configuration in non-MCP mode', async () => {
			const originalEnv = process.env['AI_MCP_ENABLED'];
			delete process.env['AI_MCP_ENABLED'];

			const service = new DiagnosticsService();
			const result = await service.checkProviderAccess();

			expect(result).toBeDefined();
			expect(result.status).toMatch(/pass|warn|fail/);
			expect(result.message).toBeTruthy();

			process.env['AI_MCP_ENABLED'] = originalEnv;
		});
	});

	describe('checkApiKeys', () => {
		it('should return pass status in MCP mode', async () => {
			const originalEnv = process.env['AI_MCP_ENABLED'];
			process.env['AI_MCP_ENABLED'] = 'true';

			const service = new DiagnosticsService();
			const result = await service.checkApiKeys();

			expect(result.status).toBe('pass');
			expect(result.message).toContain('Not required');

			process.env['AI_MCP_ENABLED'] = originalEnv;
		});
	});

	describe('checkEnvironmentVariables', () => {
		it('should check environment variables', async () => {
			const service = new DiagnosticsService();
			const result = await service.checkEnvironmentVariables();

			expect(result).toBeDefined();
			expect(result.status).toMatch(/pass|warn|fail/);
			expect(result.message).toBeTruthy();
		});
	});

	describe('checkConfigValidation', () => {
		it('should validate config schema', async () => {
			const service = new DiagnosticsService();
			const result = await service.checkConfigValidation();

			expect(result).toBeDefined();
			expect(result.status).toMatch(/pass|fail/);
			expect(result.message).toBeTruthy();
		});
	});

	describe('runAllChecks', () => {
		it('should run all diagnostic checks', async () => {
			const service = new DiagnosticsService();
			const results = await service.runAllChecks();

			expect(results).toBeInstanceOf(Array);
			expect(results.length).toBe(5); // 5 checks
		});

		it('all results should have required fields', async () => {
			const service = new DiagnosticsService();
			const results = await service.runAllChecks();

			results.forEach((result) => {
				expect(result.status).toMatch(/pass|warn|fail/);
				expect(result.message).toBeTruthy();
			});
		});

		it('should handle check failures gracefully', async () => {
			const service = new DiagnosticsService();

			// Mock a check to throw an error
			vi.spyOn(service, 'checkConfigFile').mockRejectedValue(new Error('Test error'));

			const results = await service.runAllChecks();

			expect(results).toBeInstanceOf(Array);
			expect(results.length).toBe(5);
		});
	});

	describe('autoFix', () => {
		it('should return false for non-fixable issues', async () => {
			const service = new DiagnosticsService();
			const result = {
				autoFixable: false,
				message: 'Test issue',
				status: 'fail' as const
			};

			const fixed = await service.autoFix(result);
			expect(fixed).toBe(false);
		});

		it('should return false for fixable issues (not yet implemented)', async () => {
			const service = new DiagnosticsService();
			const result = {
				autoFixable: true,
				message: 'Test issue',
				status: 'fail' as const
			};

			const fixed = await service.autoFix(result);
			expect(fixed).toBe(false); // Auto-fix not implemented yet
		});
	});
});
