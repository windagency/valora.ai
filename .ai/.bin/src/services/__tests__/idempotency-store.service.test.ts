/**
 * Idempotency Store Service Tests
 */

import type { LLMToolCall } from 'types/llm.types';

import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { IdempotencyStoreService, resetIdempotencyStore } from '../idempotency-store.service';

const TEST_STORE_DIR = '.ai/test-idempotency';

describe('IdempotencyStoreService', () => {
	let service: IdempotencyStoreService;

	beforeAll(() => {
		// Clean up any existing test directory
		if (existsSync(TEST_STORE_DIR)) {
			rmSync(TEST_STORE_DIR, { recursive: true });
		}
	});

	beforeEach(() => {
		resetIdempotencyStore();
		service = new IdempotencyStoreService({
			store_dir: TEST_STORE_DIR,
			default_ttl_ms: 60000,
			max_records: 100,
			cleanup_interval_ms: 3600000 // Long interval to avoid interference
		});
	});

	afterEach(() => {
		service.stop();
		// Clean up test directory
		if (existsSync(TEST_STORE_DIR)) {
			rmSync(TEST_STORE_DIR, { recursive: true });
		}
	});

	afterAll(() => {
		resetIdempotencyStore();
	});

	describe('generateKey', () => {
		it('should generate consistent keys for same tool call', () => {
			const toolCall: LLMToolCall = {
				id: 'call-1',
				name: 'write',
				arguments: { path: '/test/file.txt', content: 'hello' }
			};

			const key1 = service.generateKey(toolCall);
			const key2 = service.generateKey(toolCall);

			expect(key1).toBe(key2);
		});

		it('should generate different keys for different arguments', () => {
			const toolCall1: LLMToolCall = {
				id: 'call-1',
				name: 'write',
				arguments: { path: '/test/file1.txt', content: 'hello' }
			};

			const toolCall2: LLMToolCall = {
				id: 'call-2',
				name: 'write',
				arguments: { path: '/test/file2.txt', content: 'hello' }
			};

			const key1 = service.generateKey(toolCall1);
			const key2 = service.generateKey(toolCall2);

			expect(key1).not.toBe(key2);
		});

		it('should generate different keys for different sessions', () => {
			const toolCall: LLMToolCall = {
				id: 'call-1',
				name: 'write',
				arguments: { path: '/test/file.txt', content: 'hello' }
			};

			const key1 = service.generateKey(toolCall, 'session-1');
			const key2 = service.generateKey(toolCall, 'session-2');

			expect(key1).not.toBe(key2);
		});

		it('should handle argument order consistently', () => {
			const toolCall1: LLMToolCall = {
				id: 'call-1',
				name: 'write',
				arguments: { path: '/test/file.txt', content: 'hello' }
			};

			const toolCall2: LLMToolCall = {
				id: 'call-2',
				name: 'write',
				arguments: { content: 'hello', path: '/test/file.txt' }
			};

			const key1 = service.generateKey(toolCall1);
			const key2 = service.generateKey(toolCall2);

			expect(key1).toBe(key2);
		});
	});

	describe('check', () => {
		it('should return found=false for non-existent record', async () => {
			const toolCall: LLMToolCall = {
				id: 'call-1',
				name: 'write',
				arguments: { path: '/test/file.txt', content: 'hello' }
			};

			const result = await service.check(toolCall);

			expect(result.found).toBe(false);
			expect(result.key).toBeTruthy();
		});

		it('should return found=false for non-idempotent tools', async () => {
			const toolCall: LLMToolCall = {
				id: 'call-1',
				name: 'read_file',
				arguments: { path: '/test/file.txt' }
			};

			// Store a record manually (this shouldn't happen in practice)
			await service.store(toolCall, { success: true, output: 'content' });

			const result = await service.check(toolCall);

			// read_file is not idempotent, so check should return false
			expect(result.found).toBe(false);
		});

		it('should skip check when force_execute is true', async () => {
			const toolCall: LLMToolCall = {
				id: 'call-1',
				name: 'write',
				arguments: { path: '/test/file.txt', content: 'hello' }
			};

			await service.store(toolCall, { success: true, output: 'wrote file' });

			const result = await service.check(toolCall, { force_execute: true });

			expect(result.found).toBe(false);
		});
	});

	describe('store and check integration', () => {
		it('should store and retrieve idempotency records', async () => {
			const toolCall: LLMToolCall = {
				id: 'call-1',
				name: 'write',
				arguments: { path: '/test/file.txt', content: 'hello' }
			};

			await service.store(toolCall, { success: true, output: 'wrote 5 bytes' });

			const result = await service.check(toolCall);

			expect(result.found).toBe(true);
			expect(result.record?.result.success).toBe(true);
			expect(result.record?.result.output).toBe('wrote 5 bytes');
		});

		it('should store error results', async () => {
			const toolCall: LLMToolCall = {
				id: 'call-1',
				name: 'delete_file',
				arguments: { path: '/nonexistent/file.txt' }
			};

			await service.store(toolCall, {
				success: false,
				output: 'Error: File not found',
				error: 'File not found'
			});

			const result = await service.check(toolCall);

			expect(result.found).toBe(true);
			expect(result.record?.result.success).toBe(false);
			expect(result.record?.result.error).toBe('File not found');
		});

		it('should respect TTL expiration', async () => {
			const shortTtlService = new IdempotencyStoreService({
				store_dir: TEST_STORE_DIR,
				default_ttl_ms: 500, // 500ms TTL (enough time for file operations)
				max_records: 100,
				cleanup_interval_ms: 3600000
			});

			const toolCall: LLMToolCall = {
				id: 'call-1',
				name: 'write',
				arguments: { path: '/test/file.txt', content: 'hello' }
			};

			await shortTtlService.store(toolCall, { success: true, output: 'done' });

			// Immediately should find it
			const result1 = await shortTtlService.check(toolCall);
			expect(result1.found).toBe(true);

			// Wait for expiration
			await new Promise((resolve) => setTimeout(resolve, 600));

			// Should be expired
			const result2 = await shortTtlService.check(toolCall);
			expect(result2.found).toBe(false);

			shortTtlService.stop();
		});
	});

	describe('delete', () => {
		it('should delete an existing record', async () => {
			const toolCall: LLMToolCall = {
				id: 'call-1',
				name: 'write',
				arguments: { path: '/test/file.txt', content: 'hello' }
			};

			await service.store(toolCall, { success: true, output: 'done' });

			const key = service.generateKey(toolCall);
			service.delete(key);

			const result = await service.check(toolCall);
			expect(result.found).toBe(false);
		});

		it('should not throw when deleting non-existent record', async () => {
			expect(() => service.delete('non-existent-key')).not.toThrow();
		});
	});

	describe('invalidateTool', () => {
		it('should invalidate all records for a tool', async () => {
			const writeCall1: LLMToolCall = {
				id: 'call-1',
				name: 'write',
				arguments: { path: '/file1.txt', content: 'hello' }
			};

			const writeCall2: LLMToolCall = {
				id: 'call-2',
				name: 'write',
				arguments: { path: '/file2.txt', content: 'world' }
			};

			const deleteCall: LLMToolCall = {
				id: 'call-3',
				name: 'delete_file',
				arguments: { path: '/file3.txt' }
			};

			await service.store(writeCall1, { success: true, output: 'done' });
			await service.store(writeCall2, { success: true, output: 'done' });
			await service.store(deleteCall, { success: true, output: 'done' });

			const invalidated = service.invalidateTool('write');

			expect(invalidated).toBe(2);

			// Write records should be gone
			expect((await service.check(writeCall1)).found).toBe(false);
			expect((await service.check(writeCall2)).found).toBe(false);

			// Delete record should still exist
			expect((await service.check(deleteCall)).found).toBe(true);
		});
	});

	describe('invalidateSession', () => {
		it('should invalidate all records for a session', async () => {
			const session1Call: LLMToolCall = {
				id: 'call-1',
				name: 'write',
				arguments: { path: '/file1.txt', content: 'hello' }
			};

			const session2Call: LLMToolCall = {
				id: 'call-2',
				name: 'write',
				arguments: { path: '/file2.txt', content: 'world' }
			};

			await service.store(session1Call, { success: true, output: 'done' }, { session_id: 'session-1' });
			await service.store(session2Call, { success: true, output: 'done' }, { session_id: 'session-2' });

			const invalidated = await service.invalidateSession('session-1');

			expect(invalidated).toBe(1);

			// Session 1 record should be gone
			expect((await service.check(session1Call, { session_id: 'session-1' })).found).toBe(false);

			// Session 2 record should still exist
			expect((await service.check(session2Call, { session_id: 'session-2' })).found).toBe(true);
		});
	});

	describe('cleanup', () => {
		it('should remove expired records', async () => {
			const shortTtlService = new IdempotencyStoreService({
				store_dir: TEST_STORE_DIR,
				default_ttl_ms: 500, // 500ms TTL (enough time for file operations)
				max_records: 100,
				cleanup_interval_ms: 3600000
			});

			const toolCall1: LLMToolCall = {
				id: 'call-1',
				name: 'write',
				arguments: { path: '/file1.txt', content: 'hello' }
			};

			const toolCall2: LLMToolCall = {
				id: 'call-2',
				name: 'write',
				arguments: { path: '/file2.txt', content: 'world' }
			};

			await shortTtlService.store(toolCall1, { success: true, output: 'done' });

			// Wait for first to expire
			await new Promise((resolve) => setTimeout(resolve, 600));

			// Store second with longer TTL so it doesn't expire during cleanup
			await shortTtlService.store(toolCall2, { success: true, output: 'done' }, { ttl_ms: 5000 });

			// Cleanup should remove first
			const cleaned = await shortTtlService.cleanup();

			expect(cleaned).toBeGreaterThanOrEqual(1);
			expect((await shortTtlService.check(toolCall2)).found).toBe(true);

			shortTtlService.stop();
		});
	});

	describe('clear', () => {
		it('should remove all records', async () => {
			const toolCall1: LLMToolCall = {
				id: 'call-1',
				name: 'write',
				arguments: { path: '/file1.txt', content: 'hello' }
			};

			const toolCall2: LLMToolCall = {
				id: 'call-2',
				name: 'delete_file',
				arguments: { path: '/file2.txt' }
			};

			await service.store(toolCall1, { success: true, output: 'done' });
			await service.store(toolCall2, { success: true, output: 'done' });

			const cleared = service.clear();

			expect(cleared).toBe(2);
			expect((await service.check(toolCall1)).found).toBe(false);
			expect((await service.check(toolCall2)).found).toBe(false);
		});
	});

	describe('getStats', () => {
		it('should return correct statistics', async () => {
			const toolCall1: LLMToolCall = {
				id: 'call-1',
				name: 'write',
				arguments: { path: '/file1.txt', content: 'hello' }
			};

			const toolCall2: LLMToolCall = {
				id: 'call-2',
				name: 'delete_file',
				arguments: { path: '/file2.txt' }
			};

			await service.store(toolCall1, { success: true, output: 'done' });
			await service.store(toolCall2, { success: true, output: 'done' });

			const stats = service.getStats();

			expect(stats.record_count).toBe(2);
			expect(stats.store_dir).toBe(TEST_STORE_DIR);
			expect(stats.max_records).toBe(100);
		});
	});
});
