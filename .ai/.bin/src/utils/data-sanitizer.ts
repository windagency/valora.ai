/**
 * Data Sanitization Utility
 *
 * Centralized sanitization of sensitive data across all output paths.
 * Handles API keys, tokens, passwords, and other sensitive information.
 *
 * Security Features:
 * - Recursive object/array sanitization
 * - Multiple sensitive data patterns
 * - Configurable sanitization rules
 * - Type-safe implementation
 */

export interface SanitizationOptions {
	maskChar?: string;
	maskLength?: number;
	rules?: SanitizationRule[];
}

export interface SanitizationRule {
	description: string;
	pattern: RegExp;
	replacement: string;
}

/**
 * Default sanitization rules for common sensitive data patterns
 */
const DEFAULT_SANITIZATION_RULES: SanitizationRule[] = [
	// URLs with sensitive parameters (must come first to handle URL contexts)
	{
		description: 'URLs with sensitive query parameters',
		pattern: /(\?|&)(api[_-]?key|token|secret|password)=([^&\s]*)/gi,
		replacement: '$1$2=***SANITIZED***'
	},

	// Database connection strings
	{
		description: 'Database connection strings',
		pattern: /(mongodb|mysql|postgresql|redis):\/\/([^:]+):([^@]+)@/gi,
		replacement: '$1://***SANITIZED***:***SANITIZED***@'
	},

	// General token/key parameters in text (not in URLs)
	{
		description: 'Token/API key parameters in general text',
		pattern: /\b(token|apikey|api_key)\s*[:=]\s*["']?([^"'&\s]{4,})["']?/gi,
		replacement: '$1=***SANITIZED***'
	},

	// OpenAI API keys (sk-...)
	{
		description: 'OpenAI API keys',
		pattern: /\bsk-[a-zA-Z0-9]{16,}\b/g,
		replacement: '***SANITIZED***'
	},

	// API Keys and Tokens
	{
		description: 'API keys in key=value format',
		pattern: /(api[_-]?key|apikey)\s*[:=]\s*["']?(?!\*\*\*SANITIZED\*\*\*)([^"'\s]{8,})["']?/gi,
		replacement: '$1=***SANITIZED***'
	},
	{
		description: 'Authorization tokens',
		pattern: /(authorization|auth)\s*[:=]\s*(?:bearer\s+)?["']?([^"'\s]{8,})["']?/gi,
		replacement: '$1: ***SANITIZED***'
	},
	{
		description: 'Bearer tokens',
		pattern: /\bbearer\s+([^"'\s]{8,})/gi,
		replacement: 'Bearer ***SANITIZED***'
	},

	// Passwords
	{
		description: 'Passwords',
		pattern: /(password|pwd|pass)\s*[:=]\s*["']?([^"'\s]{3,})["']?/gi,
		replacement: '$1=***SANITIZED***'
	},

	// Secrets and Keys
	{
		description: 'Secrets and keys',
		pattern: /\b(?:secret|credential)\b\s*[:=]\s*["']?([^"'\s]{8,})["']?/gi,
		replacement: '$1=***SANITIZED***'
	},

	// Control characters and log injection prevention (exclude valid whitespace)
	{
		description: 'Control characters that could cause log injection',
		// eslint-disable-next-line no-control-regex
		pattern: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g,
		// Excludes: \x09 (tab), \x0A (newline), \x0D (carriage return)
		replacement: '[CTRL]'
	}
];

/**
 * Sensitive field names that should be masked in objects
 */
const SENSITIVE_FIELD_NAMES = new Set([
	'access_token',
	'accessToken',
	'api_key',
	'apiKey',
	'apikey',
	'auth',
	'authorization',
	'bearer',
	'conn_string',
	'connection_string',
	'connectionString',
	'connString',
	'credential',
	'database_url',
	'db_url',
	'dbUrl',
	'key',
	'pass',
	'password',
	'private_key',
	'privateKey',
	'pwd',
	'refresh_token',
	'refreshToken',
	'secret',
	'secret_key',
	'secretKey',
	'session_token',
	'sessionToken',
	'token'
]);

/**
 * Data Sanitization Utility Class
 *
 * Provides comprehensive sanitization of sensitive data in:
 * - Objects and nested structures
 * - Strings and text content
 * - Arrays and collections
 * - JSON-serializable data
 */
export class DataSanitizer {
	private maskChar: string;
	private maskLength: number;
	private rules: SanitizationRule[];
	private visitedObjects: WeakSet<object>;

	constructor(options: SanitizationOptions = {}) {
		this.rules = options.rules ? [...options.rules] : [...DEFAULT_SANITIZATION_RULES];
		this.maskChar = options.maskChar ?? '*';
		this.maskLength = options.maskLength ?? 12;
		this.visitedObjects = new WeakSet();
	}

	/**
	 * Sanitize any data structure recursively
	 */
	sanitize<T>(data: T): T {
		if (data === null || data === undefined) {
			return data;
		}

		if (typeof data === 'string') {
			return this.sanitizeString(data) as T;
		}

		if (Array.isArray(data)) {
			return data.map((item: unknown) => this.sanitize(item)) as T;
		}

		if (typeof data === 'object') {
			// Check for circular references
			if (this.visitedObjects.has(data)) {
				return '[Circular Reference]' as T;
			}

			if (data.constructor === Object) {
				this.visitedObjects.add(data);
				try {
					return this.sanitizeObject(data as Record<string, unknown>) as T;
				} finally {
					this.visitedObjects.delete(data);
				}
			}
		}

		// Return primitives and other types unchanged
		return data;
	}

	/**
	 * Sanitize a string value
	 */
	private sanitizeString(value: string): string {
		if (!value || typeof value !== 'string') {
			return value;
		}

		// Apply all sanitization rules
		return this.rules.reduce((sanitized, rule) => {
			return sanitized.replace(rule.pattern, rule.replacement);
		}, value);
	}

	/**
	 * Sanitize an object recursively
	 */
	private sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
		return Object.entries(obj).reduce(
			(sanitized, [key, value]) => {
				const sanitizedKey = this.sanitizeString(key);

				if (this.isSensitiveField(sanitizedKey) && value !== null && value !== undefined) {
					// Mask sensitive field values completely
					sanitized[sanitizedKey] = this.createMask();
				} else if (typeof value === 'string' && this.containsSensitiveData(value)) {
					// Sanitize string values that may contain sensitive data
					sanitized[sanitizedKey] = this.sanitizeString(value);
				} else if (typeof value === 'object' && value !== null) {
					// Recursively sanitize nested objects/arrays
					sanitized[sanitizedKey] = this.sanitize(value);
				} else {
					// Keep primitive values as-is
					sanitized[sanitizedKey] = value;
				}

				return sanitized;
			},
			{} as Record<string, unknown>
		);
	}

	/**
	 * Check if a field name indicates sensitive data
	 */
	private isSensitiveField(fieldName: string): boolean {
		const normalizedName = fieldName.toLowerCase().replace(/[_-]/g, '');
		return SENSITIVE_FIELD_NAMES.has(fieldName) || SENSITIVE_FIELD_NAMES.has(normalizedName);
	}

	/**
	 * Check if a string contains sensitive data patterns
	 */
	private containsSensitiveData(value: string): boolean {
		return this.rules.some((rule) => rule.pattern.test(value));
	}

	/**
	 * Create a mask string for sensitive values
	 */
	private createMask(): string {
		return this.maskChar.repeat(this.maskLength);
	}

	/**
	 * Add custom sanitization rules
	 */
	addRule(rule: SanitizationRule): void {
		this.rules.push(rule);
	}

	/**
	 * Remove a sanitization rule by description
	 */
	removeRule(description: string): void {
		this.rules = this.rules.filter((rule) => rule.description !== description);
	}

	/**
	 * Get current sanitization rules
	 */
	getRules(): readonly SanitizationRule[] {
		return [...this.rules];
	}

	/**
	 * Clear all custom rules (keep defaults)
	 */
	clearCustomRules(): void {
		this.rules = [...DEFAULT_SANITIZATION_RULES];
	}

	/**
	 * Sanitize a string for use in log entries
	 *
	 * Removes all control characters including newlines and carriage returns
	 * to prevent log injection attacks that could forge log entries
	 */
	sanitizeForLog(value: string): string {
		if (!value || typeof value !== 'string') {
			return value;
		}

		// First apply normal sanitization rules
		let sanitized = this.sanitize(value);

		// Then remove ALL control characters including newlines for log safety
		// eslint-disable-next-line no-control-regex
		sanitized = sanitized.replace(/[\x00-\x1F\x7F-\x9F]/g, '[CTRL]');

		return sanitized;
	}
}

// Singleton instance for global use
let globalSanitizer: DataSanitizer | null = null;

/**
 * Get the global data sanitizer instance
 */
export function getDataSanitizer(options?: SanitizationOptions): DataSanitizer {
	globalSanitizer ??= new DataSanitizer(options);
	return globalSanitizer;
}

/**
 * Set a custom global sanitizer instance
 */
export function setDataSanitizer(sanitizer: DataSanitizer): void {
	globalSanitizer = sanitizer;
}

/**
 * Sanitize data using the global sanitizer
 */
export function sanitizeData<T>(data: T): T {
	return getDataSanitizer().sanitize(data);
}

/**
 * Convenience function to sanitize objects for logging
 */
export function sanitizeForLogging(data: Record<string, unknown>): Record<string, unknown> {
	return sanitizeData(data);
}

/**
 * Convenience function to sanitize strings
 */
export function sanitizeString(value: string): string {
	return getDataSanitizer().sanitize(value);
}
