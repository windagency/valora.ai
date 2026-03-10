import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BatchableProvider } from './batch-provider.interface';
import type { BatchRequest, BatchResult, BatchStatusInfo, BatchSubmission } from './batch.types';

// Mock dependencies
vi.mock('utils/paths', () => ({
	getRuntimeDataDir: () => '/tmp/valora-test-orchestrator'
}));

vi.mock('output/logger', () => ({
	getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() })
}));

// Import after mocks
const { BatchOrchestrator } = await import('./batch-orchestrator');
const { loadBatch, removeBatch } = await import('./batch-session');

function makeMockProvider(overrides: Partial<BatchableProvider> = {}): BatchableProvider {
	return {
		cancelBatch: vi.fn().mockResolvedValue(undefined),
		complete: vi.fn(),
		getAlternativeModels: vi.fn().mockReturnValue([]),
		getBatchResults: vi.fn().mockResolvedValue([]),
		getBatchStatus: vi.fn().mockResolvedValue({
			batchId: 'batch_test',
			completedCount: 1,
			failedCount: 0,
			status: 'completed',
			totalCount: 1
		} satisfies BatchStatusInfo),
		isConfigured: vi.fn().mockReturnValue(true),
		name: 'anthropic',
		streamComplete: vi.fn(),
		submitBatch: vi.fn().mockResolvedValue({
			batchId: 'batch_test',
			localId: 'will-be-overridden',
			provider: 'anthropic',
			requestCount: 1,
			status: 'queued',
			submittedAt: new Date().toISOString()
		} satisfies BatchSubmission),
		supportsBatch: () => true as const,
		validateModel: vi.fn().mockResolvedValue(true),
		...overrides
	};
}

function makeRequest(id = 'req-001'): BatchRequest {
	return {
		id,
		options: {
			messages: [{ content: 'Hello', role: 'user' }],
			model: 'claude-3-5-sonnet-20241022'
		}
	};
}

let createdLocalIds: string[] = [];

describe('BatchOrchestrator', () => {
	afterEach(() => {
		for (const id of createdLocalIds) {
			try {
				removeBatch(id);
			} catch {
				/* ignore */
			}
		}
		createdLocalIds = [];
	});

	describe('submit', () => {
		it('calls provider.submitBatch and persists state', async () => {
			const provider = makeMockProvider();
			const orchestrator = new BatchOrchestrator();
			const requests = [makeRequest()];

			const submission = await orchestrator.submit(requests, provider);
			createdLocalIds.push(submission.localId);

			expect(provider.submitBatch).toHaveBeenCalledWith(requests);
			expect(submission.batchId).toBe('batch_test');

			const persisted = loadBatch(submission.localId);
			expect(persisted).not.toBeNull();
			expect(persisted?.submission.batchId).toBe('batch_test');
		});
	});

	describe('getStatus', () => {
		it('calls provider.getBatchStatus and updates persisted state', async () => {
			const provider = makeMockProvider();
			const orchestrator = new BatchOrchestrator();

			const submission = await orchestrator.submit([makeRequest()], provider);
			createdLocalIds.push(submission.localId);

			const status = await orchestrator.getStatus(submission.localId, provider);

			expect(status.status).toBe('completed');
			expect(provider.getBatchStatus).toHaveBeenCalledWith('batch_test');
		});

		it('throws when localId is unknown', async () => {
			const provider = makeMockProvider();
			const orchestrator = new BatchOrchestrator();

			await expect(orchestrator.getStatus('no-such-batch', provider)).rejects.toThrow('Batch not found');
		});
	});

	describe('getResults', () => {
		it('calls provider.getBatchResults and updates status', async () => {
			const mockResults: BatchResult[] = [{ id: 'req-001', result: { content: 'Done', role: 'assistant' } }];
			const provider = makeMockProvider({ getBatchResults: vi.fn().mockResolvedValue(mockResults) });
			const orchestrator = new BatchOrchestrator();

			const submission = await orchestrator.submit([makeRequest()], provider);
			createdLocalIds.push(submission.localId);

			const results = await orchestrator.getResults(submission.localId, provider);

			expect(results).toEqual(mockResults);

			const persisted = loadBatch(submission.localId);
			expect(persisted?.submission.status).toBe('completed');
		});
	});

	describe('cancel', () => {
		it('calls provider.cancelBatch and updates persisted status', async () => {
			const provider = makeMockProvider();
			const orchestrator = new BatchOrchestrator();

			const submission = await orchestrator.submit([makeRequest()], provider);
			createdLocalIds.push(submission.localId);

			await orchestrator.cancel(submission.localId, provider);

			expect(provider.cancelBatch).toHaveBeenCalledWith('batch_test');

			const persisted = loadBatch(submission.localId);
			expect(persisted?.submission.status).toBe('cancelled');
		});
	});

	describe('list', () => {
		it('returns all persisted batches', async () => {
			const provider = makeMockProvider();
			const orchestrator = new BatchOrchestrator();

			const s1 = await orchestrator.submit([makeRequest('req-a')], provider);
			const s2 = await orchestrator.submit([makeRequest('req-b')], provider);
			createdLocalIds.push(s1.localId, s2.localId);

			const batches = orchestrator.list();
			const ids = batches.map((b) => b.localId);
			expect(ids).toContain(s1.localId);
			expect(ids).toContain(s2.localId);
		});
	});
});
