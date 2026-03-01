/**
 * Diagnostics service for system health checks
 */

import type { Config } from 'config/schema';
import type { DiagnosticResult, DiagnosticStatus } from 'types/diagnostics.types';

import { getConfigLoader } from 'config/loader';

// Re-export types for backward compatibility
export type { DiagnosticResult, DiagnosticStatus };

export class DiagnosticsService {
	/**
	 * Check if configuration file exists and is valid
	 */
	async checkConfigFile(): Promise<DiagnosticResult> {
		const configLoader = getConfigLoader();

		if (!configLoader.exists()) {
			return {
				autoFixable: true,
				message: 'Configuration file not found',
				status: 'fail',
				suggestion: 'Run: valora config setup'
			};
		}

		try {
			await configLoader.load();
			return {
				message: `Found at ${configLoader.getConfigPath()}`,
				status: 'pass'
			};
		} catch {
			return {
				autoFixable: true,
				message: 'Configuration file is invalid or corrupted',
				status: 'fail',
				suggestion: 'Run: valora config setup (to reconfigure)'
			};
		}
	}

	/**
	 * Check if at least one provider is configured
	 */
	async checkProviderAccess(): Promise<DiagnosticResult> {
		// In MCP/Cursor mode, always pass (Cursor provider available)
		if (process.env['AI_MCP_ENABLED'] === 'true') {
			return {
				message: 'Cursor provider available',
				status: 'pass'
			};
		}

		const configLoader = getConfigLoader();

		try {
			const config = await configLoader.load();

			// Check if any providers are configured
			if (!config.providers || typeof config.providers !== 'object') {
				return {
					autoFixable: true,
					message: 'No providers configured',
					status: 'warn',
					suggestion: 'Run: valora config setup (to add providers)'
				};
			}

			const hasAnyProvider = Object.keys(config.providers).some((key) => {
				const providerConfig = config.providers[key as keyof typeof config.providers];
				return providerConfig?.apiKey && typeof providerConfig.apiKey === 'string';
			});

			if (!hasAnyProvider) {
				return {
					autoFixable: true,
					message: 'No providers configured (Cursor provider can be used without config)',
					status: 'warn',
					suggestion: 'Run: valora config setup (to add API providers)'
				};
			}

			const providerCount = Object.keys(config.providers).length;
			return {
				message: `${providerCount} provider(s) configured`,
				status: 'pass'
			};
		} catch {
			return {
				autoFixable: true,
				message: 'Cannot verify provider configuration',
				status: 'fail',
				suggestion: 'Run: valora config setup'
			};
		}
	}

	/**
	 * Check if API keys are present in configuration
	 */
	async checkApiKeys(): Promise<DiagnosticResult> {
		// In MCP/Cursor mode, API keys are optional
		if (process.env['AI_MCP_ENABLED'] === 'true') {
			return {
				message: 'Not required (using Cursor provider)',
				status: 'pass'
			};
		}

		const configLoader = getConfigLoader();

		try {
			const config = await configLoader.load();

			if (!config.providers) {
				return {
					autoFixable: true,
					message: 'No API keys configured (optional with Cursor provider)',
					status: 'warn',
					suggestion: 'API keys are optional when using Cursor provider'
				};
			}

			const apiKeyCount = Object.values(config.providers).filter((p) => p?.apiKey).length;

			if (apiKeyCount === 0) {
				return {
					autoFixable: true,
					message: 'No API keys configured (optional with Cursor provider)',
					status: 'warn',
					suggestion: 'Run: valora config setup (to add API keys for other providers)'
				};
			}

			return {
				message: `${apiKeyCount} API key(s) configured`,
				status: 'pass'
			};
		} catch {
			return {
				message: 'Cannot verify API keys',
				status: 'warn',
				suggestion: 'Configuration file may be corrupted'
			};
		}
	}

	/**
	 * Check environment variables
	 */
	checkEnvironmentVariables(): DiagnosticResult {
		const requiredVars: string[] = [];
		const optionalVars = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY'];

		// Check required vars
		const missingRequired = requiredVars.filter((v) => !process.env[v]);
		if (missingRequired.length > 0) {
			return {
				message: `Missing required variables: ${missingRequired.join(', ')}`,
				status: 'fail',
				suggestion: 'Set required environment variables'
			};
		}

		// Check optional vars
		const presentOptional = optionalVars.filter((v) => process.env[v]);

		if (presentOptional.length > 0) {
			return {
				message: `${presentOptional.length} optional API key(s) found in environment`,
				status: 'pass'
			};
		}

		return {
			message: 'All required environment variables set',
			status: 'pass'
		};
	}

	/**
	 * Validate configuration schema
	 */
	async checkConfigValidation(): Promise<DiagnosticResult> {
		const configLoader = getConfigLoader();

		if (!configLoader.exists()) {
			return {
				message: 'Configuration file not found',
				status: 'fail',
				suggestion: 'Run: valora config setup'
			};
		}

		try {
			const config: Config = await configLoader.load();

			// Basic schema validation
			if (!config.defaults) {
				return {
					message: 'Configuration missing defaults section',
					status: 'fail',
					suggestion: 'Run: valora config setup (to repair configuration)'
				};
			}

			return {
				message: 'Schema valid',
				status: 'pass'
			};
		} catch {
			return {
				message: 'Schema validation failed',
				status: 'fail',
				suggestion: 'Configuration file may be corrupted. Run: valora config setup'
			};
		}
	}

	/**
	 * Run all diagnostic checks
	 */
	async runAllChecks(): Promise<DiagnosticResult[]> {
		const results: DiagnosticResult[] = [];

		// Run checks in parallel
		const checks = [
			this.checkConfigFile(),
			this.checkProviderAccess(),
			this.checkApiKeys(),
			this.checkConfigValidation(),
			Promise.resolve(this.checkEnvironmentVariables())
		];

		const checkResults = await Promise.allSettled(checks);

		checkResults.forEach((result) => {
			if (result.status === 'fulfilled') {
				results.push(result.value);
			} else {
				const errorMessage = this.extractErrorMessage(result.reason);
				results.push({
					message: 'Check failed unexpectedly',
					status: 'fail',
					suggestion: errorMessage
				});
			}
		});

		return results;
	}

	/**
	 * Attempt to auto-fix a diagnostic issue
	 */
	autoFix(diagnostic: DiagnosticResult): boolean {
		if (!diagnostic.autoFixable) {
			return false;
		}

		// Auto-fix logic would go here
		// For now, we just return false (user must manually fix)
		return false;
	}

	/**
	 * Extract error message from unknown error type
	 */
	private extractErrorMessage(error: unknown): string {
		if (error instanceof Error) {
			return error.message;
		}
		if (typeof error === 'string') {
			return error;
		}
		return 'Unknown error';
	}
}
