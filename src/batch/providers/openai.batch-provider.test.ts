import { describe, expect, it, vi } from 'vitest';

import type OpenAI from 'openai';

import {
	cancelOpenAIBatch,
	getOpenAIBatchResults,
	getOpenAIBatchStatus,
	mapOpenAIStatus,
	submitOpenAIBatch
} from './openai.batch-provider';

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

	it('maps a per-line error result instead of throwing', async () => {
		const errorLine = JSON.stringify({
			custom_id: 'req-002',
			error: { code: 'rate_limit_exceeded', message: 'Too many requests' }
		});
		const mockClient = {
			batches: {
				retrieve: vi.fn().mockResolvedValue({
					id: 'batch_openai_test',
					output_file_id: 'file_output_001',
					status: 'completed'
				})
			},
			files: { content: vi.fn().mockResolvedValue({ text: async () => errorLine }) }
		};

		const results = await getOpenAIBatchResults(mockClient as unknown as OpenAI, 'batch_openai_test');

		expect(results).toEqual([{ error: 'rate_limit_exceeded: Too many requests', id: 'req-002' }]);
	});

	it('maps a line with no choices in the response to an error result', async () => {
		const noChoicesLine = JSON.stringify({
			custom_id: 'req-003',
			response: { body: { choices: [] }, status_code: 200 }
		});
		const mockClient = {
			batches: {
				retrieve: vi.fn().mockResolvedValue({
					id: 'batch_openai_test',
					output_file_id: 'file_output_001',
					status: 'completed'
				})
			},
			files: { content: vi.fn().mockResolvedValue({ text: async () => noChoicesLine }) }
		};

		const results = await getOpenAIBatchResults(mockClient as unknown as OpenAI, 'batch_openai_test');

		expect(results).toEqual([{ error: 'no choices in response', id: 'req-003' }]);
	});

	it('extracts cached-token usage into cache_read_input_tokens', async () => {
		const cachedLine = JSON.stringify({
			custom_id: 'req-004',
			response: {
				body: {
					choices: [{ finish_reason: 'stop', message: { content: 'Hi', tool_calls: null } }],
					usage: {
						completion_tokens: 5,
						prompt_tokens: 100,
						prompt_tokens_details: { cached_tokens: 40 },
						total_tokens: 105
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
			files: { content: vi.fn().mockResolvedValue({ text: async () => cachedLine }) }
		};

		const results = await getOpenAIBatchResults(mockClient as unknown as OpenAI, 'batch_openai_test');

		expect(results[0]?.result?.usage).toEqual({
			batch_discount_applied: true,
			cache_read_input_tokens: 40,
			completion_tokens: 5,
			prompt_tokens: 100,
			total_tokens: 105
		});
	});
});

describe('submitOpenAIBatch', () => {
	it('uploads requests as a JSONL file and creates a batch job', async () => {
		const mockClient = {
			batches: {
				create: vi.fn().mockResolvedValue({ id: 'batch_new', status: 'validating' })
			},
			files: {
				create: vi.fn().mockResolvedValue({ id: 'file_uploaded_001' })
			}
		};

		const submission = await submitOpenAIBatch(
			mockClient as unknown as OpenAI,
			[
				{
					customId: 'req-001',
					params: { max_tokens: 100, messages: [{ content: 'hi', role: 'user' }], model: 'gpt-5' }
				}
			],
			'openai',
			'local-id-1'
		);

		expect(submission).toEqual({
			batchId: 'batch_new',
			localId: 'local-id-1',
			provider: 'openai',
			requestCount: 1,
			status: 'queued',
			submittedAt: expect.any(String)
		});
		// Verify the batch job references the uploaded file and correct endpoint
		expect(mockClient.batches.create).toHaveBeenCalledWith(
			expect.objectContaining({ endpoint: '/v1/chat/completions', input_file_id: 'file_uploaded_001' })
		);
	});

	it('serialises each request as a JSONL line addressed to the chat completions endpoint', async () => {
		const mockClient = {
			batches: { create: vi.fn().mockResolvedValue({ id: 'batch_new', status: 'validating' }) },
			files: { create: vi.fn().mockResolvedValue({ id: 'file_uploaded_001' }) }
		};

		await submitOpenAIBatch(
			mockClient as unknown as OpenAI,
			[
				{ customId: 'req-001', params: { max_tokens: 100, messages: [], model: 'gpt-5' } },
				{ customId: 'req-002', params: { max_tokens: 100, messages: [], model: 'gpt-5' } }
			],
			'openai',
			'local-id-1'
		);

		const [[{ file: uploadedFile }]] = mockClient.files.create.mock.calls;
		const jsonlContent = await (uploadedFile as Blob).text();
		const lines = jsonlContent
			.split('\n')
			.filter(Boolean)
			.map((line) => JSON.parse(line) as Record<string, unknown>);

		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatchObject({ custom_id: 'req-001', method: 'POST', url: '/v1/chat/completions' });
		expect(lines[1]).toMatchObject({ custom_id: 'req-002', method: 'POST', url: '/v1/chat/completions' });
	});
});

describe('cancelOpenAIBatch', () => {
	it('cancels the batch job by id', async () => {
		const mockClient = { batches: { cancel: vi.fn().mockResolvedValue({}) } };

		await cancelOpenAIBatch(mockClient as unknown as OpenAI, 'batch_to_cancel');

		expect(mockClient.batches.cancel).toHaveBeenCalledWith('batch_to_cancel');
	});
});
