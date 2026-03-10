/**
 * Google Vertex AI Batch Prediction helper stubs
 *
 * Full implementation requires `@google-cloud/aiplatform` and a GCS bucket.
 * Install `@google-cloud/aiplatform` and set `vertex_project` in provider config
 * to enable. Until then, `supportsBatch()` returns false and this module is a
 * no-op placeholder.
 */

import type { BatchResult, BatchStatusInfo, BatchSubmission } from 'batch/batch.types';

/**
 * Check whether Vertex AI batch is configured.
 * Returns true only when a project ID is provided via config.
 */
export function isVertexBatchConfigured(config: Record<string, unknown>): boolean {
	return typeof config['vertex_project'] === 'string' && config['vertex_project'].length > 0;
}

/**
 * Stub: submit a Vertex AI batch job.
 * Requires `@google-cloud/aiplatform` — throws until implemented.
 */
export function submitVertexBatch(
	_config: Record<string, unknown>,
	_requests: unknown[],
	_providerName: string,
	_localId: string
): Promise<BatchSubmission> {
	return Promise.reject(
		new Error(
			'Google Vertex AI batch is not yet implemented. Install @google-cloud/aiplatform and configure vertex_project to enable.'
		)
	);
}

/**
 * Stub: get Vertex AI batch status.
 */
export function getVertexBatchStatus(_config: Record<string, unknown>, _batchId: string): Promise<BatchStatusInfo> {
	return Promise.reject(new Error('Google Vertex AI batch is not yet implemented.'));
}

/**
 * Stub: get Vertex AI batch results.
 */
export function getVertexBatchResults(_config: Record<string, unknown>, _batchId: string): Promise<BatchResult[]> {
	return Promise.reject(new Error('Google Vertex AI batch is not yet implemented.'));
}

/**
 * Stub: cancel a Vertex AI batch job.
 */
export function cancelVertexBatch(_config: Record<string, unknown>, _batchId: string): Promise<void> {
	return Promise.reject(new Error('Google Vertex AI batch is not yet implemented.'));
}
