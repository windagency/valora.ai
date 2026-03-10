/**
 * BatchOrchestrator - Submit, poll, and retrieve batch results
 *
 * Polling backoff: 30s → 60s → 2m → 5m (cap). Max wait default: 26h.
 */

import { getLogger } from 'output/logger';

import type { BatchableProvider } from './batch-provider.interface';
import type { BatchRequest, BatchResult, BatchStatusInfo, BatchSubmission, PersistedBatch } from './batch.types';

import { generateLocalId, listBatches, loadBatch, persistBatch, updateBatch } from './batch-session';

const DEFAULT_MAX_WAIT_MS = 26 * 60 * 60 * 1000; // 26 hours

const POLL_INTERVALS_MS = [
	30_000, // 30 s
	60_000, // 60 s
	2 * 60_000, // 2 min
	5 * 60_000 // 5 min (cap)
];

export class BatchOrchestrator {
	/**
	 * Submit a set of requests to the batch provider and persist state.
	 */
	async submit(requests: BatchRequest[], provider: BatchableProvider): Promise<BatchSubmission> {
		const logger = getLogger();
		const localId = generateLocalId();

		logger.info(`Submitting batch of ${requests.length} request(s) to ${provider.name}`, { localId });

		const submission = await provider.submitBatch(requests);
		// Use the localId we generated (submitBatch may generate its own, but we want ours for disk)
		submission.localId = localId;

		const persisted: PersistedBatch = { localId, requests, submission };
		persistBatch(persisted);

		logger.info(`Batch submitted`, { batchId: submission.batchId, localId, provider: provider.name });
		return submission;
	}

	/**
	 * Block until the batch completes (or max wait is reached), then return results.
	 */
	async waitForResults(
		localId: string,
		provider: BatchableProvider,
		maxWaitMs = DEFAULT_MAX_WAIT_MS
	): Promise<BatchResult[]> {
		const logger = getLogger();
		const deadline = Date.now() + maxWaitMs;
		let attempt = 0;

		while (Date.now() < deadline) {
			const status = await this.getStatus(localId, provider);
			logger.info(`Batch status: ${status.status}`, {
				batchId: status.batchId,
				completed: status.completedCount,
				failed: status.failedCount,
				total: status.totalCount
			});

			if (status.status === 'completed') {
				return this.getResults(localId, provider);
			}

			if (status.status === 'failed' || status.status === 'cancelled' || status.status === 'expired') {
				throw new Error(`Batch ${localId} ended with status: ${status.status}`);
			}

			const waitMs = nextPollInterval(attempt);
			logger.debug(`Waiting ${waitMs}ms before next poll (attempt ${attempt + 1})`);
			await sleep(waitMs);
			attempt++;
		}

		throw new Error(`Batch ${localId} did not complete within ${Math.round(maxWaitMs / 3600000)}h`);
	}

	/**
	 * Non-blocking: return current status from provider (and update persisted state).
	 */
	async getStatus(localId: string, provider: BatchableProvider): Promise<BatchStatusInfo> {
		const batch = loadBatch(localId);
		if (!batch) {
			throw new Error(`Batch not found: ${localId}`);
		}

		const status = await provider.getBatchStatus(batch.submission.batchId);

		// Update persisted status
		updateBatch(localId, {
			submission: { ...batch.submission, status: status.status }
		});

		return status;
	}

	/**
	 * Retrieve completed results (from provider, with disk caching).
	 */
	async getResults(localId: string, provider: BatchableProvider): Promise<BatchResult[]> {
		const batch = loadBatch(localId);
		if (!batch) {
			throw new Error(`Batch not found: ${localId}`);
		}

		const results = await provider.getBatchResults(batch.submission.batchId);

		// Update status to completed
		updateBatch(localId, {
			submission: { ...batch.submission, status: 'completed' }
		});

		return results;
	}

	/**
	 * Cancel a batch job and update persisted state.
	 */
	async cancel(localId: string, provider: BatchableProvider): Promise<void> {
		const batch = loadBatch(localId);
		if (!batch) {
			throw new Error(`Batch not found: ${localId}`);
		}

		await provider.cancelBatch(batch.submission.batchId);

		updateBatch(localId, {
			submission: { ...batch.submission, status: 'cancelled' }
		});
	}

	/**
	 * List all known batches from disk.
	 */
	list(): PersistedBatch[] {
		return listBatches();
	}
}

function nextPollInterval(attempt: number): number {
	const idx = Math.min(attempt, POLL_INTERVALS_MS.length - 1);
	return POLL_INTERVALS_MS[idx] ?? POLL_INTERVALS_MS[POLL_INTERVALS_MS.length - 1] ?? 5 * 60_000;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

let orchestratorInstance: BatchOrchestrator | null = null;

export function getBatchOrchestrator(): BatchOrchestrator {
	orchestratorInstance ??= new BatchOrchestrator();
	return orchestratorInstance;
}
