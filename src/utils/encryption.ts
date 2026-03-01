/**
 * Encryption Utility
 *
 * Provides AES-256-GCM encryption/decryption for sensitive data.
 * Used for securing session data and other sensitive information.
 *
 * Security Features:
 * - AES-256-GCM encryption with authentication
 * - PBKDF2 key derivation with salt
 * - Secure random IV generation
 * - Tamper detection with authentication tags
 * - Configurable key management
 */

import * as crypto from 'crypto';

/**
 * Extended cipher interface with GCM-specific methods
 */
interface CipherGCM extends crypto.Cipher {
	getAuthTag(): Buffer;
}

/**
 * Extended decipher interface with GCM-specific methods
 */
export interface DecryptionResult {
	data?: string;
	error?: string;
	success: boolean;
}

export interface EncryptedData {
	encrypted: string; // Base64 encoded encrypted data
	iv: string; // Base64 encoded initialization vector
	salt: string; // Base64 encoded salt
	tag?: string; // Base64 encoded authentication tag (GCM mode)
	version: number; // Encryption version for future compatibility
}

export interface EncryptionOptions {
	algorithm?: string;
	iterations?: number;
	ivLength?: number;
	keyLength?: number;
	saltLength?: number;
}

interface DecipherGCM extends crypto.Decipher {
	setAuthTag(buffer: Buffer): this;
}

/**
 * Default encryption configuration
 */
const DEFAULT_ENCRYPTION_OPTIONS: Required<EncryptionOptions> = {
	algorithm: 'aes-256-gcm',
	// 256 bits salt
	iterations: 100000, // 256 bits
	ivLength: 12,
	keyLength: 32, // 96 bits (GCM standard, can be any length)
	saltLength: 32 // PBKDF2 iterations
};

/**
 * Encryption Utility Class
 *
 * Handles encryption/decryption of sensitive data with strong cryptographic practices.
 */
export class EncryptionUtil {
	private masterKey?: string;
	private options: Required<EncryptionOptions>;

	constructor(options: EncryptionOptions = {}, masterKey?: string) {
		this.options = { ...DEFAULT_ENCRYPTION_OPTIONS, ...options };
		this.masterKey = masterKey;
	}

	/**
	 * Encrypt data using AES-256-GCM
	 */
	encrypt(data: string, password?: string): EncryptedData {
		try {
			// Generate salt for key derivation
			const salt = crypto.randomBytes(this.options.saltLength);

			// Derive key from password using PBKDF2
			const key = crypto.pbkdf2Sync(
				password ?? this.getMasterKey(),
				salt,
				this.options.iterations,
				this.options.keyLength,
				'sha256'
			);

			// Generate initialization vector (nonce for GCM)
			const iv = crypto.randomBytes(this.options.ivLength);

			// Create cipher in GCM mode
			const cipher = crypto.createCipheriv(this.options.algorithm, key, iv) as CipherGCM;

			// Encrypt data
			let encrypted = cipher.update(data, 'utf8', 'base64');
			encrypted += cipher.final('base64');

			// Get the authentication tag
			const tag = cipher.getAuthTag();

			return {
				encrypted,
				iv: iv.toString('base64'),
				salt: salt.toString('base64'),
				tag: tag.toString('base64'),
				version: 2 // Updated version for GCM
			};
		} catch (error) {
			throw new Error(`Encryption failed: ${(error as Error).message}`);
		}
	}

	/**
	 * Decrypt data using AES-256-GCM (v2+) or AES-256-CBC (v1) for backward compatibility
	 */
	decrypt(encryptedData: EncryptedData, password?: string): DecryptionResult {
		try {
			// Decode encrypted components
			const encrypted = Buffer.from(encryptedData.encrypted, 'base64');
			const salt = Buffer.from(encryptedData.salt, 'base64');
			const iv = Buffer.from(encryptedData.iv, 'base64');

			// Derive key from password using PBKDF2
			const key = crypto.pbkdf2Sync(
				password ?? this.getMasterKey(),
				salt,
				this.options.iterations,
				this.options.keyLength,
				'sha256'
			);

			// Handle backward compatibility: v1 uses CBC, v2+ uses GCM
			if (this.isGCMData(encryptedData)) {
				// GCM mode (current)
				const decipher = crypto.createDecipheriv(this.options.algorithm, key, iv) as DecipherGCM;

				// Set authentication tag for integrity verification
				const tag = Buffer.from(encryptedData.tag!, 'base64');
				decipher.setAuthTag(tag);

				// Decrypt data
				let decrypted = decipher.update(encrypted).toString('utf8');
				decrypted += decipher.final('utf8');

				return {
					data: decrypted,
					success: true
				};
			} else {
				// CBC mode (legacy v1) - maintain backward compatibility
				const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

				// Decrypt data
				let decrypted = decipher.update(encrypted).toString('utf8');
				decrypted += decipher.final('utf8');

				return {
					data: decrypted,
					success: true
				};
			}
		} catch (error) {
			return {
				error: `Decryption failed: ${(error as Error).message}`,
				success: false
			};
		}
	}

	/**
	 * Encrypt sensitive fields in an object
	 */
	encryptObjectFields<T extends Record<string, unknown>>(obj: T, sensitiveFields: string[], password?: string): T {
		const encrypted: Record<string, unknown> = { ...obj };

		sensitiveFields.forEach((field) => {
			if (field in encrypted && typeof encrypted[field] === 'string') {
				const value = encrypted[field] as string;
				if (value) {
					encrypted[field] = this.encrypt(value, password);
				}
			}
		});

		return encrypted as T;
	}

	/**
	 * Decrypt sensitive fields in an object
	 */
	decryptObjectFields<T extends Record<string, unknown>>(obj: T, sensitiveFields: string[], password?: string): T {
		const decrypted: Record<string, unknown> = { ...obj };

		sensitiveFields.forEach((field) => {
			if (field in decrypted) {
				const value = decrypted[field];
				if (this.isEncryptedData(value)) {
					const result = this.decrypt(value as EncryptedData, password);
					if (result.success && result.data) {
						decrypted[field] = result.data;
					} else {
						throw new Error(`Failed to decrypt field ${field}: ${result.error ?? 'Unknown error'}`);
					}
				}
			}
		});

		return decrypted as T;
	}

	/**
	 * Check if data looks like encrypted data
	 */
	private isEncryptedData(data: unknown): data is EncryptedData {
		return (
			typeof data === 'object' &&
			data !== null &&
			'encrypted' in data &&
			'iv' in data &&
			'salt' in data &&
			'version' in data &&
			typeof (data as EncryptedData).encrypted === 'string' &&
			typeof (data as EncryptedData).iv === 'string' &&
			typeof (data as EncryptedData).salt === 'string' &&
			typeof (data as EncryptedData).version === 'number'
		);
	}

	/**
	 * Check if encrypted data uses GCM (version 2+) or legacy CBC (version 1)
	 */
	private isGCMData(encryptedData: EncryptedData): boolean {
		return encryptedData.version >= 2 && !!encryptedData.tag;
	}

	/**
	 * Get or generate master key
	 * In production, this should be loaded from secure key management
	 */
	private getMasterKey(): string {
		if (this.masterKey) {
			return this.masterKey;
		}

		// Generate a master key from environment or fallback
		// In production, use a proper KMS or secure key storage
		const envKey = process.env['AI_ENCRYPTION_KEY'];
		if (envKey && envKey.length >= 32) {
			this.masterKey = envKey;
			return this.masterKey;
		}

		// Fallback: derive from machine-specific data (not secure for production!)
		const machineId = process.env['COMPUTERNAME'] ?? process.env['HOSTNAME'] ?? 'localhost';
		const appId = 'ai-orchestrator-session-encryption';
		const combined = `${machineId}:${appId}:${Date.now()}`;

		// Use PBKDF2 to derive a consistent key from machine data
		this.masterKey = crypto
			.pbkdf2Sync(combined, 'ai-orchestrator-salt', 10000, this.options.keyLength, 'sha256')
			.toString('hex');

		return this.masterKey;
	}

	/**
	 * Generate a secure random password/key
	 */
	static generateSecureKey(length: number = 32): string {
		return crypto.randomBytes(length).toString('hex');
	}

	/**
	 * Validate encryption configuration
	 */
	validateConfig(): { errors: string[]; valid: boolean } {
		const errors: string[] = [];

		try {
			// Test encryption/decryption cycle
			const testData = 'test encryption data';
			const encrypted = this.encrypt(testData);
			const decrypted = this.decrypt(encrypted);

			if (!decrypted.success || decrypted.data !== testData) {
				errors.push('Encryption/decryption cycle failed');
			}

			// Test with master key
			const masterKey = this.getMasterKey();
			if (masterKey.length < this.options.keyLength * 2) {
				// Hex encoded
				errors.push('Master key is too short');
			}
		} catch (error) {
			errors.push(`Encryption configuration error: ${(error as Error).message}`);
		}

		return {
			errors,
			valid: errors.length === 0
		};
	}
}

// Sensitive fields that should be encrypted in sessions
export const SENSITIVE_SESSION_FIELDS = [
	'apiKey',
	'apikey',
	'api_key',
	'token',
	'bearer',
	'authorization',
	'auth',
	'password',
	'pwd',
	'pass',
	'secret',
	'key',
	'credential',
	'credentials',
	'privateKey',
	'private_key',
	'secretKey',
	'secret_key',
	'accessToken',
	'access_token',
	'refreshToken',
	'refresh_token',
	'sessionToken',
	'session_token',
	'databaseUrl',
	'database_url',
	'dbUrl',
	'db_url',
	'connectionString',
	'connection_string',
	'connString',
	'conn_string'
];

// Singleton instance for global use
let globalEncryptionUtil: EncryptionUtil | null = null;

/**
 * Get the global encryption utility instance
 */
export function getEncryptionUtil(options?: EncryptionOptions, masterKey?: string): EncryptionUtil {
	globalEncryptionUtil ??= new EncryptionUtil(options, masterKey);
	return globalEncryptionUtil;
}

/**
 * Set a custom global encryption utility instance
 */
export function setEncryptionUtil(util: EncryptionUtil): void {
	globalEncryptionUtil = util;
}

/**
 * Encrypt sensitive session data
 */
export function encryptSessionData<T extends Record<string, unknown>>(sessionData: T): T {
	return getEncryptionUtil().encryptObjectFields(sessionData, SENSITIVE_SESSION_FIELDS);
}

/**
 * Decrypt sensitive session data
 */
export function decryptSessionData<T extends Record<string, unknown>>(sessionData: T): T {
	return getEncryptionUtil().decryptObjectFields(sessionData, SENSITIVE_SESSION_FIELDS);
}

/**
 * Encrypt a single value
 */
export function encryptValue(value: string): EncryptedData {
	return getEncryptionUtil().encrypt(value);
}

/**
 * Decrypt a single value
 */
export function decryptValue(encryptedData: EncryptedData): DecryptionResult {
	return getEncryptionUtil().decrypt(encryptedData);
}
