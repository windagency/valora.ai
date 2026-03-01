/**
 * Unit tests for data-sanitizer.ts
 *
 * Tests sanitization of sensitive data, security patterns, and edge cases
 * to ensure no credentials or secrets are leaked in logs or outputs.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	DataSanitizer,
	SanitizationRule,
	getDataSanitizer,
	sanitizeData,
	sanitizeForLogging,
	sanitizeString,
	setDataSanitizer
} from './data-sanitizer';

describe('DataSanitizer', () => {
	let sanitizer: DataSanitizer;

	beforeEach(() => {
		sanitizer = new DataSanitizer();
	});

	afterEach(() => {
		// Reset global sanitizer between tests
		setDataSanitizer(new DataSanitizer());
	});

	describe('constructor', () => {
		it('should create sanitizer with default options', () => {
			const sanitizer = new DataSanitizer();

			expect(sanitizer).toBeDefined();
			expect(sanitizer.getRules()).toHaveLength(10); // Default rules
		});

		it('should create sanitizer with custom options', () => {
			const customRules: SanitizationRule[] = [
				{
					description: 'Custom rule',
					pattern: /custom/gi,
					replacement: '[CUSTOM]'
				}
			];

			const sanitizer = new DataSanitizer({
				maskChar: '#',
				maskLength: 8,
				rules: customRules
			});

			expect(sanitizer.getRules()).toEqual(customRules);
		});
	});

	describe('sanitize - primitive types', () => {
		it('should return null and undefined unchanged', () => {
			expect(sanitizer.sanitize(null)).toBe(null);
			expect(sanitizer.sanitize(undefined)).toBe(undefined);
		});

		it('should return numbers and booleans unchanged', () => {
			expect(sanitizer.sanitize(42)).toBe(42);
			expect(sanitizer.sanitize(3.14)).toBe(3.14);
			expect(sanitizer.sanitize(true)).toBe(true);
			expect(sanitizer.sanitize(false)).toBe(false);
		});

		it('should sanitize strings with sensitive data', () => {
			const input = 'api_key=sk-1234567890abcdef';
			const result = sanitizer.sanitize(input);

			expect(result).toBe('api_key=***SANITIZED***');
		});

		it('should return clean strings unchanged', () => {
			const input = 'Hello, World!';
			const result = sanitizer.sanitize(input);

			expect(result).toBe(input);
		});
	});

	describe('sanitize - arrays', () => {
		it('should sanitize arrays recursively', () => {
			const input = ['normal string', 'api_key=secret123', { clean: 'value', token: 'abc123' }];

			const result = sanitizer.sanitize(input);

			expect(result[0]).toBe('normal string');
			expect(result[1]).toBe('api_key=***SANITIZED***');
			expect(result[2].token).toBe('************'); // Masked
			expect(result[2].clean).toBe('value');
		});

		it('should handle empty arrays', () => {
			const result = sanitizer.sanitize([]);

			expect(result).toEqual([]);
		});
	});

	describe('sanitize - objects', () => {
		it('should sanitize sensitive field names', () => {
			const input = {
				apiKey: 'sk-1234567890abcdef',
				clean: 'safe value',
				normalField: 'normal value',
				password: 'mypassword123',
				token: 'bearer abc123'
			};

			const result = sanitizer.sanitize(input);

			expect(result.apiKey).toBe('************'); // Masked
			expect(result.password).toBe('************'); // Masked
			expect(result.token).toBe('************'); // Masked
			expect(result.normalField).toBe('normal value'); // Unchanged
			expect(result.clean).toBe('safe value'); // Unchanged
		});

		it('should handle nested objects', () => {
			const input = {
				settings: {
					theme: 'dark',
					token: 'abc123'
				},
				user: {
					apiKey: 'sk-1234567890abcdef',
					profile: {
						email: 'user@example.com',
						password: 'secret123'
					}
				}
			};

			const result = sanitizer.sanitize(input);

			expect(result.user.apiKey).toBe('************');
			expect(result.user.profile.password).toBe('************');
			expect(result.user.profile.email).toBe('user@example.com');
			expect(result.settings.token).toBe('************');
			expect(result.settings.theme).toBe('dark');
		});

		it('should handle case-insensitive field matching', () => {
			const input = {
				API_KEY: 'sk-1234567890abcdef',
				api_key: 'sk-7890abcdef123456',
				ApiKey: 'sk-abcdef1234567890',
				password: 'secret123'
			};

			const result = sanitizer.sanitize(input);

			expect(result.API_KEY).toBe('************');
			expect(result.ApiKey).toBe('************');
			expect(result.api_key).toBe('************');
			expect(result.password).toBe('************');
		});

		it('should sanitize strings containing sensitive patterns', () => {
			const input = {
				message: 'The API key is api_key=sk-1234567890abcdef and the password is password=secret123',
				url: 'https://api.example.com?token=abc123&other=value'
			};

			const result = sanitizer.sanitize(input);

			expect(result.message).toContain('api_key=***SANITIZED***');
			expect(result.message).toContain('password=***SANITIZED***');
			expect(result.url).toContain('token=***SANITIZED***');
		});

		it('should handle empty objects', () => {
			const result = sanitizer.sanitize({});

			expect(result).toEqual({});
		});
	});

	describe('sanitize - circular references', () => {
		it('should handle circular references', () => {
			const obj: any = { name: 'test' };
			obj.self = obj;

			const result = sanitizer.sanitize(obj);

			expect(result.name).toBe('test');
			expect(result.self).toBe('[Circular Reference]');
		});

		it('should handle complex circular structures', () => {
			const obj1: any = { name: 'obj1' };
			const obj2: any = { name: 'obj2' };

			obj1.ref = obj2;
			obj2.ref = obj1;

			const result = sanitizer.sanitize(obj1);

			expect(result.name).toBe('obj1');
			expect(result.ref.name).toBe('obj2');
			expect(result.ref.ref).toBe('[Circular Reference]');
		});
	});

	describe('sanitize - custom types', () => {
		it('should handle Date objects', () => {
			const date = new Date('2023-01-01');
			const result = sanitizer.sanitize(date);

			expect(result).toBe(date);
		});

		it('should handle custom class instances', () => {
			class CustomClass {
				constructor(public value: string) {}
			}

			const instance = new CustomClass('test');
			const result = sanitizer.sanitize(instance);

			expect(result).toBe(instance);
		});
	});

	describe('string sanitization patterns', () => {
		it('should sanitize API keys', () => {
			const patterns = ['api_key=sk-1234567890abcdef', 'apikey: sk-abcdef1234567890', 'api-key = sk-7890abcdef123456'];

			patterns.forEach((pattern) => {
				const result = sanitizer.sanitize(pattern);
				expect(result).toContain('***SANITIZED***');
				expect(result).not.toContain('sk-');
			});
		});

		it('should sanitize authorization tokens', () => {
			const patterns = ['authorization: Bearer abc123def456', 'Authorization=bearer xyz789uvw123', 'auth = token123'];

			patterns.forEach((pattern) => {
				const result = sanitizer.sanitize(pattern);
				expect(result).toContain('***SANITIZED***');
			});
		});

		it('should sanitize passwords', () => {
			const patterns = ['password=secret123', 'pwd: mypassword', 'pass = "secure456"'];

			patterns.forEach((pattern) => {
				const result = sanitizer.sanitize(pattern);
				expect(result).toContain('***SANITIZED***');
			});
		});

		it('should sanitize database URLs', () => {
			const patterns = [
				'mongodb://user:password@localhost:27017/db',
				'mysql://admin:secret@db.example.com:3306/app',
				'postgresql://user:pass@host:5432/database'
			];

			patterns.forEach((pattern) => {
				const result = sanitizer.sanitize(pattern);
				expect(result).toContain('***SANITIZED***:***SANITIZED***@');
				expect(result).not.toContain('user:');
				expect(result).not.toContain(':password');
				expect(result).not.toContain(':secret');
			});
		});

		it('should sanitize URL query parameters', () => {
			const testCases = [
				{
					expectations: ['?api_key=***SANITIZED***', '&token=***SANITIZED***'],
					input: 'https://api.example.com?api_key=sk-123&token=abc123def&other=value'
				},
				{
					expectations: ['password=***SANITIZED***'],
					input: 'http://service.com?password=secret&key=xyz789abc' // Only password is sensitive, key is generic
				}
			];

			testCases.forEach(({ expectations, input }) => {
				const result = sanitizer.sanitize(input);
				expectations.forEach((expectation) => {
					expect(result).toContain(expectation);
				});
			});
		});
	});

	describe('rule management', () => {
		it('should allow adding custom rules', () => {
			const customRule: SanitizationRule = {
				description: 'Custom rule',
				pattern: /custom/gi,
				replacement: '[CUSTOM]'
			};

			sanitizer.addRule(customRule);

			expect(sanitizer.getRules()).toContain(customRule);
		});

		it('should allow removing rules by description', () => {
			const initialCount = sanitizer.getRules().length;

			sanitizer.removeRule('API keys in key=value format');

			expect(sanitizer.getRules()).toHaveLength(initialCount - 1);
			expect(sanitizer.getRules().find((r) => r.description === 'API keys in key=value format')).toBeUndefined();
		});

		it('should clear custom rules', () => {
			const defaultRulesCount = 10; // DEFAULT_SANITIZATION_RULES.length
			sanitizer.addRule({
				description: 'Test rule',
				pattern: /test/gi,
				replacement: '[TEST]'
			});

			const beforeClear = sanitizer.getRules().length;
			sanitizer.clearCustomRules();
			const afterClear = sanitizer.getRules().length;

			expect(beforeClear).toBe(defaultRulesCount + 1); // Should have added one rule to default 10
			expect(afterClear).toBe(defaultRulesCount); // Should be back to default 10 rules
		});

		it('should apply custom rules', () => {
			const customSanitizer = new DataSanitizer({
				rules: [
					{
						description: 'Custom rule',
						pattern: /custom/gi,
						replacement: '[CUSTOM]'
					}
				]
			});

			const result = customSanitizer.sanitize('This is a custom string');

			expect(result).toBe('This is a [CUSTOM] string');
		});
	});

	describe('masking options', () => {
		it('should use custom mask character and length', () => {
			const customSanitizer = new DataSanitizer({
				maskChar: '#',
				maskLength: 8
			});

			const result = customSanitizer.sanitize({ apiKey: 'secret123' });

			expect(result.apiKey).toBe('########');
		});
	});

	describe('security regression tests', () => {
		it('should not leak sensitive data in various formats', () => {
			const testCases = [
				// Object with sensitive fields
				{ apiKey: 'sk-1234567890abcdef' },
				// String with embedded secrets
				'Config: api_key=sk-abcdef password=secret123',
				// Nested objects
				{ config: { auth: { token: 'abc123' } } },
				// Arrays with sensitive data
				['normal', { apiKey: 'secret' }, 'api_key=token123']
			];

			testCases.forEach((testCase) => {
				const result = sanitizer.sanitize(testCase);
				const resultStr = JSON.stringify(result);

				// Ensure no actual secrets are present
				expect(resultStr).not.toContain('sk-1234567890abcdef');
				expect(resultStr).not.toContain('sk-abcdef');
				expect(resultStr).not.toContain('secret123');
				expect(resultStr).not.toContain('secret');
				expect(resultStr).not.toContain('abc123');
				expect(resultStr).not.toContain('token123');
			});
		});

		it('should handle edge cases without crashing', () => {
			const edgeCases = [undefined, null, '', {}, [], NaN, Infinity, Symbol('test'), () => {}, new Map(), new Set()];

			edgeCases.forEach((edgeCase) => {
				expect(() => sanitizer.sanitize(edgeCase)).not.toThrow();
			});
		});

		it('should prevent information leakage in error messages', () => {
			const dataWithSecrets = {
				details: {
					token: 'bearer xyz789',
					user: 'safe_user'
				},
				error: 'Connection failed with api_key=sk-1234567890abcdef'
			};

			const result = sanitizer.sanitize(dataWithSecrets);

			expect(result.error).toContain('api_key=***SANITIZED***');
			expect(result.details.token).toBe('************');
			expect(result.details.user).toBe('safe_user');
		});
	});
});

describe('Global sanitizer functions', () => {
	beforeEach(() => {
		// Reset global sanitizer
		setDataSanitizer(new DataSanitizer());
	});

	describe('getDataSanitizer', () => {
		it('should return singleton instance', () => {
			const sanitizer1 = getDataSanitizer();
			const sanitizer2 = getDataSanitizer();

			expect(sanitizer1).toBe(sanitizer2);
		});

		it('should create instance with custom options', () => {
			const sanitizer = getDataSanitizer({
				maskChar: '#',
				rules: []
			});

			expect(sanitizer).toBeDefined();
		});
	});

	describe('sanitizeData', () => {
		it('should sanitize data using global sanitizer', () => {
			const data = { apiKey: 'secret123' };
			const result = sanitizeData(data);

			expect(result.apiKey).toBe('************');
		});
	});

	describe('sanitizeForLogging', () => {
		it('should sanitize objects for logging', () => {
			const data = {
				password: 'secret123',
				token: 'abc123',
				user: 'john'
			};

			const result = sanitizeForLogging(data);

			expect(result.user).toBe('john');
			expect(result.password).toBe('************');
			expect(result.token).toBe('************');
		});
	});

	describe('sanitizeString', () => {
		it('should sanitize strings', () => {
			const input = 'api_key=sk-1234567890abcdef';
			const result = sanitizeString(input);

			expect(result).toBe('api_key=***SANITIZED***');
		});
	});
});

describe('Integration with sensitive data patterns', () => {
	it('should handle real-world API call data', () => {
		const apiCallData = {
			body: {
				api_key: 'sk-abcdef1234567890abcdef1234567890',
				messages: [{ content: 'Hello', role: 'user' }],
				model: 'gpt-4' // Should be sanitized
			},
			headers: {
				Authorization: 'Bearer sk-1234567890abcdef1234567890abcdef',
				'Content-Type': 'application/json',
				'User-Agent': 'AI-Orchestrator/1.0.0'
			},
			method: 'POST',
			timestamp: new Date().toISOString(),
			url: 'https://api.openai.com/v1/chat/completions'
		};

		const result = sanitizeData(apiCallData);

		// Headers should be sanitized
		expect(result.headers.Authorization).toBe('************');

		// Body sensitive field should be sanitized
		expect(result.body.api_key).toBe('************');

		// Safe fields should remain
		expect(result.method).toBe('POST');
		expect(result.url).toBe('https://api.openai.com/v1/chat/completions');
		expect(result.headers['Content-Type']).toBe('application/json');
		expect(result.body.model).toBe('gpt-4');
		expect(result.timestamp).toBe(apiCallData.timestamp);
	});

	it('should handle database connection data', () => {
		const dbConfig = {
			connectionString: 'postgresql://admin:supersecretpassword123@localhost:5432/ai_orchestrator',
			database: 'ai_orchestrator',
			host: 'localhost',
			password: 'supersecretpassword123',
			port: 5432,
			ssl: true,
			username: 'admin'
		};

		const result = sanitizeData(dbConfig);

		expect(result.password).toBe('************');
		expect(result.connectionString).toBe('************'); // connectionString is a sensitive field name
		expect(result.host).toBe('localhost');
		expect(result.port).toBe(5432);
		expect(result.database).toBe('ai_orchestrator');
		expect(result.ssl).toBe(true);
	});
});
