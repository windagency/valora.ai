/**
 * BatchableProvider interface and runtime type guard
 */

import type { LLMProvider } from 'types/llm.types';

import type { BatchRequest, BatchResult, BatchStatusInfo, BatchSubmission } from './batch.types';

export interface BatchableProvider extends LLMProvider {
	cancelBatch(batchId: string): Promise<void>;
	getBatchResults(batchId: string): Promise<BatchResult[]>;
	getBatchStatus(batchId: string): Promise<BatchStatusInfo>;
	submitBatch(requests: BatchRequest[]): Promise<BatchSubmission>;
	supportsBatch(): true;
}

export function isBatchableProvider(p: LLMProvider): p is BatchableProvider {
	return (
		'supportsBatch' in p &&
		typeof (p as BatchableProvider).supportsBatch === 'function' &&
		(p as BatchableProvider).supportsBatch() === true
	);
}
