import { describe, expect, it, vi } from 'vitest';

import type Anthropic from '@anthropic-ai/sdk';

import { getAnthropicBatchResults, getAnthropicBatchStatus, mapAnthropicStatus } from './anthropic.batch-provider';

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
});
