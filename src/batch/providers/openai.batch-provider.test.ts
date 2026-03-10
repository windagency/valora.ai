import { describe, expect, it, vi } from 'vitest';

import type OpenAI from 'openai';

import { getOpenAIBatchResults, getOpenAIBatchStatus, mapOpenAIStatus } from './openai.batch-provider';

describe('mapOpenAIStatus', () => {
	it.each([
		['in_progress', 'processing'],
		['finalizing', 'processing'],
		['completed', 'completed'],
		['failed', 'failed'],
		['cancelled', 'cancelled'],
		['cancelling', 'cancelled'],
		['expired', 'expired'],
		['validating', 'queued'],
		['unknown_status', 'queued']
	])('maps "%s" → "%s"', (input, expected) => {
		expect(mapOpenAIStatus(input)).toBe(expected);
	});
});

describe('getOpenAIBatchStatus', () => {
	it('maps request_counts correctly', async () => {
		const mockClient = {
			batches: {
				retrieve: vi.fn().mockResolvedValue({
					id: 'batch_openai_test',
					request_counts: {
						completed: 3,
						failed: 2,
						total: 5
					},
					status: 'completed'
				})
			}
		};

		const status = await getOpenAIBatchStatus(mockClient as unknown as OpenAI, 'batch_openai_test');

		expect(status.batchId).toBe('batch_openai_test');
		expect(status.status).toBe('completed');
		expect(status.completedCount).toBe(3);
		expect(status.failedCount).toBe(2);
		expect(status.totalCount).toBe(5);
	});
});

describe('getOpenAIBatchResults', () => {
	it('parses JSONL output file and maps to BatchResult[]', async () => {
		const jsonlLine = JSON.stringify({
			custom_id: 'req-001',
			response: {
				body: {
					choices: [
						{
							finish_reason: 'stop',
							message: {
								content: 'Hello from OpenAI batch',
								role: 'assistant',
								tool_calls: null
							}
						}
					],
					usage: {
						completion_tokens: 20,
						prompt_tokens: 80,
						total_tokens: 100
					}
				},
				status_code: 200
			}
		});

		const mockClient = {
			batches: {
				retrieve: vi.fn().mockResolvedValue({
					id: 'batch_openai_test',
					output_file_id: 'file_output_001',
					status: 'completed'
				})
			},
			files: {
				content: vi.fn().mockResolvedValue({
					text: async () => jsonlLine
				})
			}
		};

		const results = await getOpenAIBatchResults(mockClient as unknown as OpenAI, 'batch_openai_test');

		expect(results).toHaveLength(1);
		const r = results[0];
		expect(r?.id).toBe('req-001');
		expect(r?.result?.content).toBe('Hello from OpenAI batch');
		expect(r?.result?.usage?.completion_tokens).toBe(20);
		expect(r?.result?.usage?.batch_discount_applied).toBe(true);
	});

	it('throws when batch has no output_file_id', async () => {
		const mockClient = {
			batches: {
				retrieve: vi.fn().mockResolvedValue({
					id: 'batch_openai_test',
					output_file_id: null,
					status: 'in_progress'
				})
			}
		};

		await expect(getOpenAIBatchResults(mockClient as unknown as OpenAI, 'batch_openai_test')).rejects.toThrow(
			/no output file/
		);
	});
});
