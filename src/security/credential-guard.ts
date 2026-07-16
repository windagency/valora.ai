/**
 * Credential Guard
 *
 * Prevents credential leakage through:
 * - Environment sanitisation for terminal commands
 * - Tool output credential scanning
 * - Sensitive file read blocking
 * - ENV variable filtering
 */

import { redactCredentials } from '@windagency/valora-runtime';
import { resolve } from 'path';

import { getLogger } from 'output/logger';

import { getAuditSink } from './audit-sink';
import { createSecurityEvent, type SecurityEvent } from './security-event.types';

/**
 * Glob-style patterns for sensitive environment variables.
 * Matched case-insensitively against variable names.
 */
const SENSITIVE_ENV_PATTERNS: RegExp[] = [
	/^ANTHROPIC_/i,
	/^OPENAI_/i,
	/^GOOGLE_/i,
	/^AWS_/i,
	/^AZURE_/i,
	/_API_KEY$/i,
	/_TOKEN$/i,
	/_SECRET$/i,
	/_PASSWORD$/i,
	/_CREDENTIAL$/i,
	/^DATABASE_URL$/i,
	/^REDIS_URL$/i,
	/^MONGO_URI$/i,
	/(?:^|_)PRIVATE_KEY$/i,
	/(?:^|_)ENCRYPTION_KEY$/i,
	// Explicit CI/CD and infrastructure credential variable names
	/^GITHUB_TOKEN$/i,
	/^GH_TOKEN$/i,
	/^NPM_TOKEN$/i,
	/^DOCKER_PASSWORD$/i,
	/^DOCKER_AUTH$/i,
	/^SLACK_TOKEN$/i,
	/^CIRCLE_TOKEN$/i,
	/^BUILDKITE_AGENT_TOKEN$/i,
	/^VAULT_TOKEN$/i,
	/^KUBECONFIG$/i
];

/**
 * File path patterns that indicate sensitive files.
 * Checked against the basename and resolved path.
 */
const SENSITIVE_FILE_PATTERNS: RegExp[] = [
	/^\.env$/,
	/^\.env\..+$/,
	/\.pem$/,
	/\.key$/,
	/^id_rsa$/,
	/^id_ed25519$/,
	/^id_ecdsa$/,
	/^id_dsa$/,
	/^credentials$/,
	/^credentials\.json$/,
	/^token\.json$/,
	/\.keystore$/,
	/\.jks$/,
	/^known_hosts$/,
	/^authorized_keys$/
];

/**
 * Directory paths that are always sensitive.
 * Checked against resolved absolute paths.
 */
const SENSITIVE_DIRECTORIES = ['/.ssh/', '/.aws/', '/.gnupg/', '/.config/gcloud/'];

const REDACTED = '[REDACTED]';

export class CredentialGuard {
	private events: SecurityEvent[] = [];

	/**
	 * Sanitise environment variables for subprocess execution.
	 * Returns a copy with sensitive values replaced by [REDACTED].
	 */
	sanitizeEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
		const sanitized: NodeJS.ProcessEnv = {};

		for (const [key, value] of Object.entries(env)) {
			if (this.isSensitiveEnvVar(key)) {
				sanitized[key] = REDACTED;
				this.logEvent('credential_redacted', 'medium', { source: 'environment', variable: key });
			} else {
				sanitized[key] = value;
			}
		}

		return sanitized;
	}

	/**
	 * Check if an environment variable name matches sensitive patterns.
	 */
	isSensitiveEnvVar(name: string): boolean {
		return SENSITIVE_ENV_PATTERNS.some((pattern) => pattern.test(name));
	}

	/**
	 * Scan tool output for credentials and redact them.
	 */
	scanOutput(content: string): string {
		const { redacted, result } = redactCredentials(content);

		if (redacted) {
			this.logEvent('credential_redacted', 'high', { source: 'tool_output' });
		}

		return result;
	}

	/**
	 * Check if a file path points to a sensitive file.
	 */
	isSensitiveFile(filePath: string): boolean {
		const normalised = filePath.replace(/\\/g, '/');
		const basename = normalised.split('/').pop() ?? '';

		// Check basename against sensitive file patterns
		if (SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(basename))) {
			return true;
		}

		// Check resolved path against sensitive directories
		const resolvedPath = resolve(filePath).replace(/\\/g, '/');
		return SENSITIVE_DIRECTORIES.some((dir) => resolvedPath.includes(dir));
	}

	/**
	 * Get recorded security events (for testing/monitoring).
	 */
	getEvents(): SecurityEvent[] {
		return [...this.events];
	}

	/**
	 * Clear recorded events.
	 */
	clearEvents(): void {
		this.events = [];
	}

	private logEvent(
		type: SecurityEvent['type'],
		severity: SecurityEvent['severity'],
		details: Record<string, unknown>
	): void {
		const event = createSecurityEvent(type, severity, details);
		this.events.push(event);
		getAuditSink().append(event);

		const logger = getLogger();
		logger.warn(`[Security] ${type}`, details);
	}
}

/**
 * Singleton instance
 */
let instance: CredentialGuard | null = null;

export function getCredentialGuard(): CredentialGuard {
	instance ??= new CredentialGuard();
	return instance;
}

export function resetCredentialGuard(): void {
	instance = null;
}
