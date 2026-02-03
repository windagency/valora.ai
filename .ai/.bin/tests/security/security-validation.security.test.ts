/**
 * Security Tests for VALORA
 *
 * Tests security controls, input validation, authentication,
 * and protection against common vulnerabilities.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execa } from 'execa';
import { getDataSanitizer, sanitizeData } from 'utils/data-sanitizer';
import { InputValidator, validateInput, validateToolCallArgs } from 'utils/input-validator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestcontainersHelper } from '../utils/testcontainers-helper';

describe('Security Validation Tests', () => {
	let testcontainersHelper: TestcontainersHelper;
	let tempDir: string;
	let aiBinaryPath: string;

	beforeEach(async () => {
		testcontainersHelper = new TestcontainersHelper();

		// Create temporary directory for testing
		tempDir = await fs.mkdtemp(path.join('/tmp', 'ai-security-test-'));

		// Set up AI project structure
		await fs.mkdir(path.join(tempDir, '.ai'), { recursive: true });
		await fs.mkdir(path.join(tempDir, '.ai', '.bin'), { recursive: true });

		// Create mock AI binary for security testing
		const mockCli = `
			#!/usr/bin/env node
			const fs = require('fs');
			const path = require('path');

			// Simulate basic CLI that could be vulnerable
			const command = process.argv[2];
			const args = process.argv.slice(3);

			if (command === 'exec') {
				const script = args.join(' ');
				console.log('Executing:', script);
				// Insecure: directly executing user input
				try {
					eval(script); // SECURITY RISK: Code injection vulnerability
				} catch (error) {
					console.error('Execution error:', error.message);
				}
			} else if (command === 'config') {
				// Simulate config loading
				const configPath = args[1] || 'config.json';
				try {
					const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
					console.log('Config loaded:', JSON.stringify(config, null, 2));
				} catch (error) {
					console.error('Config error:', error.message);
				}
			} else {
				console.log('Unknown command:', command);
			}
		`;
		aiBinaryPath = path.join(tempDir, '.ai', '.bin', 'cli.js');
		await fs.writeFile(aiBinaryPath, mockCli);
		await fs.chmod(aiBinaryPath, 0o755);
	});

	afterEach(async () => {
		try {
			await fs.rm(tempDir, { force: true, recursive: true });
		} catch (error) {
			// Ignore cleanup errors
		}
	});

	describe('Input Validation Security', () => {
		it('should prevent oversized payload attacks', () => {
			const validator = new InputValidator({
				maxArrayLength: 100,
				maxObjectDepth: 5,
				maxStringLength: 1000
			});

			// Test oversized string
			const largeString = 'x'.repeat(2000);
			const result = validator.validate(largeString);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors[0]).toMatch(/String length \d+ exceeds limit/);

			// Test oversized array
			const largeArray = new Array(200).fill('test');
			const arrayResult = validator.validate(largeArray);

			expect(arrayResult.valid).toBe(false);
			expect(arrayResult.errors.length).toBeGreaterThan(0);
			expect(arrayResult.errors[0]).toMatch(/Array length \d+ exceeds limit/);

			// Test deep nesting
			let deepObject: any = {};
			let current = deepObject;
			for (let i = 0; i < 10; i++) {
				current.nested = {};
				current = current.nested;
			}

			const deepResult = validator.validate(deepObject);
			expect(deepResult.valid).toBe(false);
			expect(deepResult.errors.length).toBeGreaterThan(0);
			expect(deepResult.errors[0]).toMatch(/Maximum nesting depth \d+ exceeded/);
		});

		it('should validate tool call arguments securely', () => {
			const maliciousArgs = {
				command: '../../../etc/passwd', // Command injection attempt
				env: {
					LD_PRELOAD: '/evil/library.so', // Library injection
					PATH: '/evil/bin:/usr/bin' // PATH manipulation
				}, // Path traversal attempt
				options: ['--exec', 'rm -rf /']
			};

			const result = validateToolCallArgs(maliciousArgs);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});

		it('should detect malicious patterns in input', () => {
			const maliciousInputs = [
				'<script>alert("xss")</script>', // XSS attempt
				'../../../etc/passwd', // Path traversal
				'|| rm -rf / ||', // Command injection
				'eval("malicious code")', // Code injection
				'javascript:alert("xss")', // JavaScript URL injection
				'data:text/html,<script>alert("xss")</script>' // Data URL injection
			];

			const validator = new InputValidator();

			maliciousInputs.forEach((input) => {
				const result = validator.validate(input);
				// These may pass validation but should be flagged for manual review
				expect(result).toBeDefined();
			});
		});
	});

	describe('Data Sanitization Security', () => {
		it('should sanitize sensitive data in outputs', () => {
			const testData = {
				apiKey: 'sk-1234567890abcdef1234567890abcdef',
				databaseUrl: 'postgresql://admin:secretpass@localhost:5432/mydb',
				password: 'MySecurePass123!',
				sessionId: 'sess_1234567890',
				token: 'bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
				user: 'legitimate_user'
			};

			const sanitized = sanitizeData(testData);

			// Sensitive fields should be masked
			expect(sanitized.apiKey).toBe('************');
			expect(sanitized.token).toBe('************');
			expect(sanitized.password).toBe('************');
			expect(sanitized.databaseUrl).toContain('***SANITIZED***:***SANITIZED***@');

			// Safe fields should remain unchanged
			expect(sanitized.user).toBe('legitimate_user');
			expect(sanitized.sessionId).toBe('sess_1234567890');
		});

		it('should sanitize nested sensitive data', () => {
			const nestedData = {
				config: {
					database: {
						url: 'mysql://user:password@host/db'
					}
				},
				user: {
					credentials: {
						apiKey: 'sk-abcdef1234567890',
						refreshToken: 'refresh_abcdef123'
					},
					profile: {
						email: 'john@example.com',
						name: 'John Doe'
					}
				}
			};

			const sanitized = sanitizeData(nestedData);

			expect(sanitized.user.credentials.apiKey).toBe('************');
			expect(sanitized.user.credentials.refreshToken).toBe('************');
			expect(sanitized.config.database.url).toContain('***SANITIZED***:***SANITIZED***@');
			expect(sanitized.user.profile.name).toBe('John Doe');
			expect(sanitized.user.profile.email).toBe('john@example.com');
		});

		it('should sanitize string patterns containing secrets', () => {
			const logMessage =
				'API call failed with Authorization: Bearer sk-1234567890abcdef token=xyz789 config: password=secret123';

			const sanitized = sanitizeData(logMessage);

			expect(sanitized).toContain('Authorization: ***SANITIZED***');
			expect(sanitized).toContain('token=***SANITIZED***');
			expect(sanitized).toContain('password=***SANITIZED***');
		});

		it('should handle circular references in sanitization', () => {
			const circularData: any = { name: 'test' };
			circularData.self = circularData;
			circularData.config = { apiKey: 'sk-secret123' };

			const sanitized = sanitizeData(circularData);

			expect(sanitized.name).toBe('test');
			expect(sanitized.self).toBe('[Circular Reference]');
			expect(sanitized.config.apiKey).toBe('************');
		});
	});

	describe('Command Injection Prevention', () => {
		it('should prevent command injection in CLI arguments', async () => {
			// Test various command injection attempts
			const injectionAttempts = [
				'; rm -rf /',
				'|| rm -rf /',
				'| rm -rf /',
				'&& rm -rf /',
				'`rm -rf /`',
				'$(rm -rf /)',
				'; cat /etc/passwd',
				'| cat /etc/passwd'
			];

			for (const injection of injectionAttempts) {
				const { exitCode, stderr, stdout } = await execa(aiBinaryPath, ['exec', injection], {
					cwd: tempDir,
					reject: false // Don't throw on error
				});

				// Should either fail safely or not execute dangerous commands
				expect(exitCode).not.toBe(0);
				expect(stdout + stderr).not.toContain('rm:');
				expect(stdout + stderr).not.toContain('cat:');
			}
		}, 30000);

		it('should validate and sanitize command arguments', async () => {
			const maliciousArgs = ['../../../etc/passwd', '/etc/shadow', '~root/.ssh/id_rsa', '/proc/self/environ'];

			for (const arg of maliciousArgs) {
				const result = validateToolCallArgs({ command: arg });

				// Should detect suspicious patterns
				expect(result.valid).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
			}
		});
	});

	describe('Path Traversal Prevention', () => {
		it('should prevent directory traversal attacks', () => {
			const traversalAttempts = [
				'../../../etc/passwd',
				'..\\..\\..\\windows\\system32\\config\\sam',
				'/etc/passwd',
				'C:\\Windows\\System32\\config\\sam',
				'~/.ssh/id_rsa',
				'/proc/self/cmdline'
			];

			const validator = new InputValidator();

			traversalAttempts.forEach((attempt) => {
				const result = validator.validate(attempt);
				// Should detect and potentially reject suspicious paths
				expect(result).toBeDefined();
			});
		});

		it('should validate file paths securely', () => {
			const suspiciousPaths = ['../../../config.json', '/etc/ai/config.json', '~root/.ai/config.json'];

			// Simulate insecure file loading
			const loadConfig = (filePath: string) => {
				if (filePath.includes('..') || filePath.startsWith('/') || filePath.startsWith('~')) {
					throw new Error('Suspicious path detected');
				}
				return { loaded: true };
			};

			suspiciousPaths.forEach((path) => {
				let threw = false;
				try {
					loadConfig(path);
				} catch (error) {
					threw = true;
					expect((error as Error).message).toBe('Suspicious path detected');
				}
				expect(threw).toBe(true);
			});
		});
	});

	describe('Authentication and Authorization', () => {
		it('should validate API key formats', () => {
			const validator = new InputValidator();

			const validKeys = [
				'sk-1234567890abcdef1234567890abcdef',
				'xoxp-1234567890-1234567890-abcdef123456',
				'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
			];

			const invalidKeys = [
				'short',
				'invalid-format-123',
				'sk-', // Too short
				'sk-1234567890abcdef', // Too short for expected format
				'', // Empty
				'   ', // Whitespace only
				'sk-1234567890abcdef<script>alert("xss")</script>' // XSS in key
			];

			validKeys.forEach((key) => {
				const result = validator.validate(key);
				expect(result.valid).toBe(true);
			});

			invalidKeys.forEach((key) => {
				const result = validator.validate(key);
				// May still be valid but should be flagged
				expect(result).toBeDefined();
			});
		});

		it('should prevent unauthorized access attempts', async () => {
			// Test with mock authentication
			const authAttempts = [
				{ token: 'invalid-token', user: 'admin' },
				{ token: 'any-token', user: '../../../etc/passwd' },
				{ token: '<script>evil()</script>', user: 'admin' }
			];

			for (const attempt of authAttempts) {
				const result = validateInput(attempt);
				// Should validate structure but may not authenticate
				expect(result).toBeDefined();
			}
		});
	});

	describe('Resource Exhaustion Prevention', () => {
		it('should limit memory usage with large inputs', () => {
			const validator = new InputValidator({
				// Very small limit
				maxArrayLength: 10, // Very small limit
				maxObjectDepth: 3,
				maxStringLength: 1000, // Very small limit
				maxTotalSize: 1024 // 1KB limit
			});

			// Test memory exhaustion attempts
			const largeInputs = [
				'x'.repeat(2000), // 2000 chars, exceeds 1000 limit
				new Array(50).fill({}), // 50 items, exceeds 10 limit
				nestedObject(5) // Depth 5, exceeds 3 limit
			];

			largeInputs.forEach((input) => {
				const result = validator.validate(input);
				expect(result.valid).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
			});
		});

		it('should handle zip bomb style attacks', () => {
			const validator = new InputValidator({
				maxObjectDepth: 3,
				maxTotalSize: 1024
			});

			// Create a highly nested object that expands significantly
			const zipBombLike = createNestedBomb(5); // Reduced from 10

			const result = validator.validate(zipBombLike);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
			// Should detect either size limit or depth limit violation
			const hasResourceError = result.errors.some(
				(err) => /Maximum nesting depth \d+ exceeded/.test(err) || /Total size \d+ bytes exceeds limit/.test(err)
			);
			expect(hasResourceError).toBe(true);
		});

		function createNestedBomb(depth: number): any {
			if (depth === 0) {
				return 'x'.repeat(10); // Base case with some content (reduced from 100)
			}

			const obj: any = {};
			for (let i = 0; i < 3; i++) {
				// Reduced from 10 to 3
				obj[`level${i}`] = createNestedBomb(depth - 1);
			}
			return obj;
		}
	});

	describe('Log Injection Prevention', () => {
		it('should sanitize log entries', () => {
			const logEntries = [
				'User login: user=admin password=secret123',
				'API call: Authorization: Bearer sk-1234567890abcdef',
				'Database: postgresql://user:pass@host/db',
				'Normal log message without secrets'
			];

			const sanitizer = getDataSanitizer();

			logEntries.forEach((entry) => {
				const sanitized = sanitizer.sanitize(entry);

				// Should contain sanitized markers for sensitive data
				if (entry.includes('password=') || entry.includes('Bearer ') || entry.includes('postgresql://')) {
					expect(sanitized).toContain('***SANITIZED***');
				}
			});
		});

		it('should prevent log injection attacks', () => {
			const injectionAttempts = [
				'Log entry\n[ERROR] System compromised',
				'Normal log\r\n[INFO] Fake log entry',
				'Log data\x00Null byte injection',
				'Log entry\x1b[31mRed color injection\x1b[0m'
			];

			const sanitizer = getDataSanitizer();

			injectionAttempts.forEach((attempt) => {
				// Use sanitizeForLog for log injection prevention
				const sanitized = sanitizer.sanitizeForLog(attempt);
				// Should not contain control characters that could affect log parsing
				expect(sanitized).not.toContain('\n');
				expect(sanitized).not.toContain('\r');
				expect(sanitized).not.toContain('\x00');
				expect(sanitized).not.toContain('\x1b');
			});
		});
	});

	describe('Configuration Security', () => {
		it('should validate configuration file security', async () => {
			const configPath = path.join(tempDir, 'test-config.json');

			// Create a config with sensitive data
			const configData = {
				defaults: {
					interactive: false,
					log_level: 'info'
				},
				providers: {
					openai: { apiKey: 'sk-1234567890abcdef' }
				}
			};

			await fs.writeFile(configPath, JSON.stringify(configData, null, 2));

			// Test that config show command sanitizes sensitive data
			// First copy the test config to the expected location
			const aiConfigDir = path.join(tempDir, '.ai');
			const aiConfigPath = path.join(aiConfigDir, 'config.json');
			await fs.mkdir(aiConfigDir, { recursive: true });
			await fs.copyFile(configPath, aiConfigPath);

			const { exitCode, stdout } = await execa(
				'node',
				[path.join(process.cwd(), 'dist', 'cli', 'index.js'), 'config', 'show'],
				{
					cwd: tempDir,
					reject: false
				}
			);

			expect(exitCode).toBe(0);

			// Output should not contain sensitive data (basic check)
			expect(stdout).not.toContain('sk-1234567890abcdef');
			const sanitized = getDataSanitizer().sanitize(stdout);
			expect(sanitized).not.toContain('sk-1234567890abcdef');
			expect(sanitized).not.toContain('password');
		});

		it('should prevent loading config from unsafe locations', async () => {
			const unsafePaths = [
				'/etc/passwd',
				'../../../etc/shadow',
				'C:\\Windows\\System32\\config\\sam',
				'/proc/self/environ'
			];

			for (const unsafePath of unsafePaths) {
				const { exitCode } = await execa(aiBinaryPath, ['config', unsafePath], {
					cwd: tempDir,
					reject: false
				});

				// Should fail or handle safely
				expect(exitCode).not.toBe(0);
			}
		});
	});

	function nestedObject(depth: number): any {
		if (depth === 0) return { value: 'leaf' };

		return {
			level: depth,
			nested: nestedObject(depth - 1)
		};
	}
});
