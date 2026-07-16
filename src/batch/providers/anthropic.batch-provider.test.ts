import { describe, expect, it, vi } from 'vitest';

import type Anthropic from '@anthropic-ai/sdk';

import {
	cancelAnthropicBatch,
	getAnthropicBatchResults,
	getAnthropicBatchStatus,
	mapAnthropicStatus,
	submitAnthropicBatch
} from './anthropic.batch-provider';

describe('mapAnthropicStatus', () => {
	it.each([
		['in_progress', 'processing'],
		['canceling', 'cancelled'],
		['ended', 'completed'],
		['unknown_value', 'queued']
	])('maps "%s" → "%s"', (input, expected) => {
		expect(mapAnthropicStatus(input)).toBe(expected);
	});
});

describe('getAnthropicBatchStatus', () => {
	it('maps request_counts correctly', async () => {
		const mockClient = {
			beta: {
				messages: {
					batches: {
						retrieve: vi.fn().mockResolvedValue({
							id: 'batch_test',
							processing_status: 'ended',
							request_counts: {
								canceled: 0,
								errored: 1,
								expired: 0,
								processing: 0,
								succeeded: 4
							}
						})
					}
				}
			}
		};

		const status = await getAnthropicBatchStatus(mockClient as unknown as Anthropic, 'batch_test');

		expect(status.batchId).toBe('batch_test');
		expect(status.status).toBe('completed');
		expect(status.completedCount).toBe(4);
		expect(status.failedCount).toBe(1);
		expect(status.totalCount).toBe(5);
	});
});

describe('getAnthropicBatchResults', () => {
	it('maps succeeded results to LLMCompletionResult', async () => {
		const mockResults = [
			{
				custom_id: 'req-001',
				result: {
					message: {
						content: [{ text: 'Hello world', type: 'text' }],
						stop_reason: 'end_turn',
						usage: {
							input_tokens: 100,
							output_tokens: 50
						}
					},
					type: 'succeeded'
				}
			}
		];

		const mockClient = {
			beta: {
				messages: {
					batches: {
						results: vi.fn().mockResolvedValue(
							// AsyncIterable
							(async function* () {
								for (const r of mockResults) yield r;
							})()
						)
					}
				}
			}
		};

		const results = await getAnthropicBatchResults(mockClient as unknown as Anthropic, 'batch_test');

		expect(results).toHaveLength(1);
		const result = results[0];
		expect(result?.id).toBe('req-001');
		expect(result?.result?.content).toBe('Hello world');
		expect(result?.result?.usage?.completion_tokens).toBe(50);
		expect(result?.result?.usage?.prompt_tokens).toBe(100);
		expect(result?.result?.usage?.batch_discount_applied).toBe(true);
	});

	it('maps errored results to error string', async () => {
		const mockResults = [
			{
				custom_id: 'req-002',
				result: {
					error: { type: 'overloaded_error' },
					type: 'errored'
				}
			}
		];

		const mockClient = {
			beta: {
				messages: {
					batches: {
						results: vi.fn().mockResolvedValue(
							(async function* () {
								for (const r of mockResults) yield r;
							})()
						)
					}
				}
			}
		};

		const results = await getAnthropicBatchResults(mockClient as unknown as Anthropic, 'batch_test');

		expect(results).toHaveLength(1);
		expect(results[0]?.error).toBe('overloaded_error');
		expect(results[0]?.result).toBeUndefined();
	});

	it('maps an errored result with no error type to a generic "unknown error"', async () => {
		const mockResults = [{ custom_id: 'req-003', result: { error: undefined, type: 'errored' } }];
		const mockClient = {
			beta: {
				messages: {
					batches: {
						results: vi.fn().mockResolvedValue(
							(async function* () {
								for (const r of mockResults) yield r;
							})()
						)
					}
				}
			}
		};

		const results = await getAnthropicBatchResults(mockClient as unknown as Anthropic, 'batch_test');

		expect(results).toEqual([{ error: 'unknown error', id: 'req-003' }]);
	});

	it('maps a result of an unexpected type to a descriptive error rather than throwing', async () => {
		const mockResults = [{ custom_id: 'req-004', result: { type: 'expired' } }];
		const mockClient = {
			beta: {
				messages: {
					batches: {
						results: vi.fn().mockResolvedValue(
							(async function* () {
								for (const r of mockResults) yield r;
							})()
						)
					}
				}
			}
		};

		const results = await getAnthropicBatchResults(mockClient as unknown as Anthropic, 'batch_test');

		expect(results).toEqual([{ error: 'unexpected result type: expired', id: 'req-004' }]);
	});

	it('extracts prompt-cache usage fields from a succeeded result when present', async () => {
		const mockResults = [
			{
				custom_id: 'req-005',
				result: {
					message: {
						content: [{ text: 'Hi', type: 'text' }],
						stop_reason: 'end_turn',
						usage: {
							cache_creation_input_tokens: 200,
							cache_read_input_tokens: 40,
							input_tokens: 100,
							output_tokens: 5
						}
					},
					type: 'succeeded'
				}
			}
		];
		const mockClient = {
			beta: {
				messages: {
					batches: {
						results: vi.fn().mockResolvedValue(
							(async function* () {
								for (const r of mockResults) yield r;
							})()
						)
					}
				}
			}
		};

		const results = await getAnthropicBatchResults(mockClient as unknown as Anthropic, 'batch_test');

		expect(results[0]?.result?.usage).toEqual({
			batch_discount_applied: true,
			cache_creation_input_tokens: 200,
			cache_read_input_tokens: 40,
			completion_tokens: 5,
			prompt_tokens: 100,
			total_tokens: 105
		});
	});
});

describe('submitAnthropicBatch', () => {
	it('submits requests to the Message Batches API and maps the initial status', async () => {
		const mockClient = {
			beta: {
				messages: {
					batches: {
						create: vi.fn().mockResolvedValue({ id: 'batch_new', processing_status: 'in_progress' })
					}
				}
			}
		};

		const submission = await submitAnthropicBatch(
			mockClient as unknown as Anthropic,
			[
				{
					customId: 'req-001',
					params: { max_tokens: 100, messages: [{ content: 'hi', role: 'user' }], model: 'claude-sonnet-4.6' }
				}
			],
			'anthropic',
			'local-id-1'
		);

		expect(submission).toEqual({
			batchId: 'batch_new',
			localId: 'local-id-1',
			provider: 'anthropic',
			requestCount: 1,
			status: 'processing',
			submittedAt: expect.any(String)
		});
		expect(mockClient.beta.messages.batches.create).toHaveBeenCalledWith({
			requests: [
				{
					custom_id: 'req-001',
					params: { max_tokens: 100, messages: [{ content: 'hi', role: 'user' }], model: 'claude-sonnet-4.6' }
				}
			]
		});
	});
});

describe('cancelAnthropicBatch', () => {
	it('cancels the batch job by id', async () => {
		const mockClient = { beta: { messages: { batches: { cancel: vi.fn().mockResolvedValue({}) } } } };

		await cancelAnthropicBatch(mockClient as unknown as Anthropic, 'batch_to_cancel');

		expect(mockClient.beta.messages.batches.cancel).toHaveBeenCalledWith('batch_to_cancel');
	});
});
