/**
 * Unit tests for input-validator.ts
 *
 * Tests input validation, size limits, and security protections
 * against oversized payloads, deep nesting, and malformed data.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
	InputValidator,
	InputValidatorOptions,
	isForbiddenPath,
	validateCompletionOptions,
	validateInput,
	validateNotForbiddenPath,
	validateToolCallArgs
} from './input-validator';

describe('InputValidator', () => {
	let validator: InputValidator;

	beforeEach(() => {
		validator = new InputValidator();
	});

	describe('constructor', () => {
		it('should use default limits when none provided', () => {
			const validator = new InputValidator();

			expect(validator).toBeDefined();
		});

		it('should merge custom limits with defaults', () => {
			const customLimits: InputValidatorOptions = {
				maxArrayLength: 50,
				maxStringLength: 500
			};

			const validator = new InputValidator(customLimits);

			expect(validator).toBeDefined();
		});
	});

	describe('validate - basic functionality', () => {
		it('should validate null input', () => {
			const result = validator.validate(null);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
			expect(result.warnings).toHaveLength(0);
		});

		it('should validate undefined input', () => {
			const result = validator.validate(undefined);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('should validate primitive types', () => {
			const testCases = [42, 3.14, true, false, 'hello'];

			testCases.forEach((value) => {
				const result = validator.validate(value);
				expect(result.valid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});
		});

		it('should track metrics for valid input', () => {
			const data = {
				items: ['a', 'b', 'c'],
				name: 'test',
				value: 42
			};

			const result = validator.validate(data);

			expect(result.valid).toBe(true);
			expect(result.metrics.inputDepth).toBeGreaterThan(0);
			expect(result.metrics.maxArrayLength).toBe(3);
		});
	});

	describe('validate - string validation', () => {
		it('should validate short strings', () => {
			const result = validator.validate('hello world');

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('should reject strings exceeding max length', () => {
			const customValidator = new InputValidator({
				maxStringLength: 100
			});
			const longString = 'x'.repeat(150);
			const result = customValidator.validate(longString);

			expect(result.valid).toBe(false);
			expect(result.errors.some((error) => /String length \d+ exceeds limit/.test(error))).toBe(true);
		});

		it('should check for malicious patterns in strings', () => {
			const maliciousString = 'rm -rf / && echo hacked';
			const result = validator.validate(maliciousString);

			// Should have warnings about malicious patterns
			expect(result.warnings.length).toBeGreaterThan(0);
		});
	});

	describe('validate - array validation', () => {
		it('should validate small arrays', () => {
			const data = [1, 2, 3, 4, 5];
			const result = validator.validate(data);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
			expect(result.metrics.maxArrayLength).toBe(5);
		});

		it('should reject arrays exceeding max length', () => {
			const customValidator = new InputValidator({
				maxArrayLength: 100
			});
			const largeArray = new Array(200).fill(0);
			const result = customValidator.validate(largeArray);

			expect(result.valid).toBe(false);
			expect(result.errors.some((error) => /Array length \d+ exceeds limit/.test(error))).toBe(true);
			expect(result.metrics.maxArrayLength).toBe(200);
		});

		it('should validate nested arrays', () => {
			const data = [
				[1, 2],
				[3, 4],
				[5, 6]
			];
			const result = validator.validate(data);

			expect(result.valid).toBe(true);
			expect(result.metrics.inputDepth).toBeGreaterThanOrEqual(1);
		});
	});

	describe('validate - object validation', () => {
		it('should validate simple objects', () => {
			const data = { active: true, name: 'test', value: 42 };
			const result = validator.validate(data);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
			expect(result.metrics.inputDepth).toBeGreaterThanOrEqual(1);
		});

		it('should validate nested objects', () => {
			const data = {
				user: {
					name: 'John',
					profile: {
						email: 'john@example.com',
						settings: {
							theme: 'dark'
						}
					}
				}
			};

			const result = validator.validate(data);

			expect(result.valid).toBe(true);
			expect(result.metrics.inputDepth).toBeGreaterThanOrEqual(3);
		});

		it('should reject deeply nested objects', () => {
			const customValidator = new InputValidator({
				maxObjectDepth: 5
			});

			// Create an object with depth > 5
			let data: any = { level: 0 };
			let current = data;

			for (let i = 1; i <= 10; i++) {
				current.nested = { level: i };
				current = current.nested;
			}

			const result = customValidator.validate(data);

			expect(result.valid).toBe(false);
			expect(result.errors.some((error) => /Maximum nesting depth \d+ exceeded/.test(error))).toBe(true);
		});
	});

	describe('validate - complex data structures', () => {
		it('should validate mixed data structures', () => {
			const data = {
				metadata: 'Additional information about the system',
				settings: {
					notifications: {
						email: true,
						push: false
					},
					theme: 'dark'
				},
				users: [
					{ age: 30, hobbies: ['reading', 'coding'], name: 'Alice' },
					{ age: 25, hobbies: ['gaming'], name: 'Bob' }
				]
			};

			const result = validator.validate(data);

			expect(result.valid).toBe(true);
			expect(result.metrics.inputDepth).toBeGreaterThan(1);
			expect(result.metrics.maxArrayLength).toBeGreaterThan(0);
		});

		it('should handle circular references gracefully', () => {
			// Note: This test is tricky because JSON.stringify can't handle circular refs
			// In real usage, the validator should handle this via try/catch
			const data: any = { name: 'test' };
			data.self = data; // Create circular reference

			expect(() => validator.validate(data)).not.toThrow();
		});
	});

	describe('validate - size limits', () => {
		it('should reject data exceeding total size limit', () => {
			const customValidator = new InputValidator({
				maxTotalSize: 1024 * 100 // 100KB
			});

			const largeData = {
				content: 'x'.repeat(1024 * 200) // 200KB
			};

			const result = customValidator.validate(largeData);

			expect(result.valid).toBe(false);
			expect(result.errors.some((error) => /Total size \d+ bytes exceeds limit/.test(error))).toBe(true);
		});
	});

	describe('error handling', () => {
		it('should handle validation errors gracefully', () => {
			// Create a validator with very strict limits
			const strictValidator = new InputValidator({
				maxArrayLength: 1,
				maxObjectDepth: 1,
				maxStringLength: 10
			});

			const data = {
				nested: {
					deeply: {
						value: 'this is a very long string that exceeds limits'
					}
				}
			};

			const result = strictValidator.validate(data);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});
	});
});

describe('Standalone validation functions', () => {
	describe('validateInput', () => {
		it('should validate input', () => {
			const result = validateInput('test string');

			expect(result).toHaveProperty('valid');
			expect(result).toHaveProperty('errors');
			expect(result).toHaveProperty('warnings');
			expect(result).toHaveProperty('metrics');
		});

		it('should validate objects', () => {
			const result = validateInput({ test: 'data', value: 42 });

			expect(result.valid).toBe(true);
		});
	});

	describe('validateToolCallArgs', () => {
		it('should validate tool call args', () => {
			const args = { command: 'test', options: [] };
			const result = validateToolCallArgs(args);

			expect(result.valid).toBe(true);
			expect(result.metrics).toHaveProperty('inputDepth');
			expect(result.metrics).toHaveProperty('inputSizeBytes');
			expect(result.metrics).toHaveProperty('maxArrayLength');
		});

		it('should reject oversized tool call args', () => {
			const args = {
				largeData: 'x'.repeat(11 * 1024 * 1024) // 11MB, exceeds 10MB limit
			};
			const result = validateToolCallArgs(args);

			expect(result.valid).toBe(false);
			expect(result.errors.some((error) => /Input too large/.test(error))).toBe(true);
		});

		it('should detect malicious patterns', () => {
			const args = {
				command: 'rm -rf /',
				path: '../../../etc/passwd'
			};
			const result = validateToolCallArgs(args);

			expect(result.errors.length).toBeGreaterThan(0);
		});
	});

	describe('validateCompletionOptions', () => {
		it('should validate completion options', () => {
			const options = { messages: [], model: 'gpt-4' };
			const result = validateCompletionOptions(options);

			expect(result.valid).toBe(true);
		});

		it('should reject oversized completion options', () => {
			const options = {
				messages: [{ content: 'x'.repeat(11 * 1024 * 1024), role: 'user' }]
			};
			const result = validateCompletionOptions(options);

			expect(result.valid).toBe(false);
		});
	});
});

describe('Security-focused validation', () => {
	let validator: InputValidator;

	beforeEach(() => {
		// Create validator with strict security limits
		validator = new InputValidator({
			maxArrayLength: 100,
			maxObjectDepth: 5,
			maxStringLength: 1000,
			maxTotalSize: 50 * 1024 // 50KB
		});
	});

	it('should prevent oversized payloads', () => {
		const maliciousPayload = {
			data: 'x'.repeat(100 * 1024) // 100KB payload
		};

		const result = validator.validate(maliciousPayload);

		expect(result.valid).toBe(false);
		expect(result.errors.some((error) => /Total size \d+ bytes exceeds limit/.test(error))).toBe(true);
	});

	it('should prevent deep object traversal attacks', () => {
		let data: any = {};
		let current = data;

		// Create very deep nesting
		for (let i = 0; i < 20; i++) {
			current.nested = {};
			current = current.nested;
		}

		const result = validator.validate(data);

		expect(result.valid).toBe(false);
		expect(result.errors.some((error) => /Maximum nesting depth \d+ exceeded/.test(error))).toBe(true);
	});

	it('should prevent array-based DoS attacks', () => {
		const largeArray = new Array(1000).fill('x'.repeat(100)); // 1000 items, each 100 chars

		const result = validator.validate(largeArray);

		expect(result.valid).toBe(false);
		expect(result.errors.some((error) => /Array length \d+ exceeds limit/.test(error))).toBe(true);
	});

	it('should detect malicious command injection patterns', () => {
		const maliciousInput = {
			command: 'ls -la && rm -rf /',
			path: '../../../etc/passwd',
			script: '<script>alert("xss")</script>'
		};

		const result = validator.validate(maliciousInput);

		// Should have warnings about malicious patterns
		expect(result.warnings.length).toBeGreaterThan(0);
	});
});

describe('Forbidden Path Validation', () => {
	describe('isForbiddenPath', () => {
		it('should return true for paths starting with .ai/', () => {
			expect(isForbiddenPath('.ai/config.json')).toBe(true);
			expect(isForbiddenPath('.ai/agents/test.md')).toBe(true);
			expect(isForbiddenPath('.ai/')).toBe(true);
		});

		it('should return true for paths with .ai in absolute paths', () => {
			expect(isForbiddenPath('/workspaces/project/.ai/config.json')).toBe(true);
			expect(isForbiddenPath('/home/user/project/.ai/prompts/test.md')).toBe(true);
		});

		it('should return true for Windows-style paths', () => {
			expect(isForbiddenPath('.ai\\config.json')).toBe(true);
			expect(isForbiddenPath('.ai\\agents\\test.md')).toBe(true);
		});

		it('should return false for paths not in .ai folder', () => {
			expect(isForbiddenPath('src/index.ts')).toBe(false);
			expect(isForbiddenPath('knowledge-base/docs.md')).toBe(false);
			expect(isForbiddenPath('/home/user/project/src/main.ts')).toBe(false);
		});

		it('should return false for paths that contain .ai but not as a directory', () => {
			expect(isForbiddenPath('src/ai-utils.ts')).toBe(false);
			expect(isForbiddenPath('docs/.ai-readme.md')).toBe(false);
		});
	});

	describe('validateNotForbiddenPath', () => {
		it('should throw error for paths in .ai folder', () => {
			expect(() => validateNotForbiddenPath('.ai/config.json', 'write to')).toThrow(/Cannot write to files in \.ai\//);
		});

		it('should include the operation type in error message', () => {
			expect(() => validateNotForbiddenPath('.ai/test.md', 'delete')).toThrow(/Cannot delete files/);
			expect(() => validateNotForbiddenPath('.ai/test.md', 'modify')).toThrow(/Cannot modify files/);
		});

		it('should include the original path in error message', () => {
			expect(() => validateNotForbiddenPath('.ai/agents/test.md', 'write to')).toThrow(/Path: \.ai\/agents\/test\.md/);
		});

		it('should not throw for allowed paths', () => {
			expect(() => validateNotForbiddenPath('src/index.ts', 'write to')).not.toThrow();
			expect(() => validateNotForbiddenPath('knowledge-base/docs.md', 'modify')).not.toThrow();
		});
	});
});
