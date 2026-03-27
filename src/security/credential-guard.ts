/**
 * Credential Guard
 *
 * Prevents credential leakage through:
 * - Environment sanitisation for terminal commands
 * - Tool output credential scanning
 * - Sensitive file read blocking
 * - ENV variable filtering
 */

import { resolve } from 'path';

import { getLogger } from 'output/logger';

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
	/^PRIVATE_KEY$/i,
	/^ENCRYPTION_KEY$/i
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

/**
 * Patterns for detecting credentials in tool output text.
 */
const OUTPUT_CREDENTIAL_PATTERNS: RegExp[] = [
	// API keys with common prefixes (sk-ant-api03-..., sk-proj-..., etc.)
	/sk-[a-zA-Z0-9_-]{20,}/g,
	/pk-[a-zA-Z0-9_-]{20,}/g,
	/api[_-]?key[=:]\s*["']?[a-zA-Z0-9_-]{16,}/gi,
	// AWS access keys
	/AKIA[0-9A-Z]{16}/g,
	// Bearer tokens
	/Bearer\s+[a-zA-Z0-9_\-.]{20,}/g,
	// Generic long secrets (base64-ish with prefix)
	/(?:token|secret|password|credential)[=:]\s*["']?[a-zA-Z0-9+/=_-]{20,}/gi,
	// Private key blocks
	/-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
	// Connection strings with credentials
	/(?:mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/gi
];

const REDACTED = '[REDACTED]';

export class CredentialGuard {
	private events: SecurityEvent[] = [];

	/**
	 * Sanitise environment variables for subprocess execution.
	 * Returns a copy with sensitive values replaced by [REDACTED].
	 */
	sanitiseEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
		const sanitised: NodeJS.ProcessEnv = {};

		for (const [key, value] of Object.entries(env)) {
			if (this.isSensitiveEnvVar(key)) {
				sanitised[key] = REDACTED;
				this.logEvent('credential_redacted', 'medium', { source: 'environment', variable: key });
			} else {
				sanitised[key] = value;
			}
		}

		return sanitised;
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
		if (!content || typeof content !== 'string') return content;

		let result = content;
		let redacted = false;

		for (const pattern of OUTPUT_CREDENTIAL_PATTERNS) {
			// Reset lastIndex for global patterns
			const regex = new RegExp(pattern.source, pattern.flags);
			if (regex.test(result)) {
				redacted = true;
				result = result.replace(new RegExp(pattern.source, pattern.flags), REDACTED);
			}
		}

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
		const homedir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
		const normalisedHome = homedir.replace(/\\/g, '/');

		for (const dir of SENSITIVE_DIRECTORIES) {
			if (resolvedPath.includes(`${normalisedHome}${dir}`)) {
				return true;
			}
			// Also match the directory pattern without home prefix
			if (resolvedPath.includes(dir)) {
				return true;
			}
		}

		return false;
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
