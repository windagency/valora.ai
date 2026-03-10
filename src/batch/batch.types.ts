/**
 * Batch processing type definitions
 */

import type { LLMCompletionOptions, LLMCompletionResult } from 'types/llm.types';

export interface BatchRequest {
	/** SHA-256 of content for idempotency */
	id: string;
	/** Command, stage, pipeline context */
	metadata?: Record<string, unknown>;
	options: LLMCompletionOptions;
}

export interface BatchResult {
	/** Present on failure */
	error?: string;
	/** Matches BatchRequest.id */
	id: string;
	/** Present on success */
	result?: LLMCompletionResult;
}

export interface BatchStatusInfo {
	batchId: string;
	completedCount: number;
	failedCount: number;
	status: BatchStatusValue;
	totalCount: number;
}

export type BatchStatusValue = 'cancelled' | 'completed' | 'expired' | 'failed' | 'processing' | 'queued';

export interface BatchSubmission {
	/** Provider's batch ID */
	batchId: string;
	estimatedCompletionAt?: string;
	/** Valora-generated ID (for disk lookup) */
	localId: string;
	/** Provider name */
	provider: string;
	requestCount: number;
	status: BatchStatusValue;
	/** ISO 8601 */
	submittedAt: string;
}

export interface PersistedBatch {
	localId: string;
	requests: BatchRequest[];
	/** Path to cached results file if retrieved */
	resultsPath?: string;
	submission: BatchSubmission;
}
