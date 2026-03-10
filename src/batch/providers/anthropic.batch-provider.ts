/**
 * Anthropic Message Batches helper functions
 *
 * Used by AnthropicProvider to implement BatchableProvider.
 * Handles request formatting, status mapping, and response parsing
 * specific to the Anthropic batch API.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { BatchResult, BatchStatusInfo, BatchStatusValue, BatchSubmission } from 'batch/batch.types';

import type { LLMCompletionResult, LLMUsage } from 'types/llm.types';

/**
 * Maps Anthropic processing_status → BatchStatusValue
 */
export function mapAnthropicStatus(status: string): BatchStatusValue {
	switch (status) {
		case 'canceling':
			return 'cancelled';
		case 'ended':
			return 'completed';
		case 'in_progress':
			return 'processing';
		default:
			return 'queued';
	}
}

/**
 * Submit requests to the Anthropic Message Batches API
 */
export async function submitAnthropicBatch(
	client: Anthropic,
	requests: Array<{
		customId: string;
		params: Anthropic.MessageCreateParamsNonStreaming;
	}>,
	providerName: string,
	localId: string
): Promise<BatchSubmission> {
	const batchRequests = requests.map((r) => ({
		custom_id: r.customId,
		params: r.params
	}));

	const batch = await client.beta.messages.batches.create({ requests: batchRequests });

	return {
		batchId: batch.id,
		localId,
		provider: providerName,
		requestCount: requests.length,
		status: mapAnthropicStatus(batch.processing_status),
		submittedAt: new Date().toISOString()
	};
}

/**
 * Retrieve batch status from Anthropic
 */
export async function getAnthropicBatchStatus(client: Anthropic, batchId: string): Promise<BatchStatusInfo> {
	const batch = await client.beta.messages.batches.retrieve(batchId);
	const counts = batch.request_counts;
	const totalCount = counts.processing + counts.succeeded + counts.errored + counts.canceled + counts.expired;

	return {
		batchId: batch.id,
		completedCount: counts.succeeded,
		failedCount: counts.errored,
		status: mapAnthropicStatus(batch.processing_status),
		totalCount
	};
}

/**
 * Retrieve completed batch results from Anthropic
 */
export async function getAnthropicBatchResults(client: Anthropic, batchId: string): Promise<BatchResult[]> {
	const results: BatchResult[] = [];

	for await (const item of await client.beta.messages.batches.results(batchId)) {
		if (item.result.type === 'succeeded') {
			const message = item.result.message;
			const usage: LLMUsage = {
				completion_tokens: message.usage.output_tokens,
				prompt_tokens: message.usage.input_tokens,
				total_tokens: message.usage.input_tokens + message.usage.output_tokens
			};

			const raw = message.usage as unknown as Record<string, unknown>;
			if (typeof raw['cache_creation_input_tokens'] === 'number') {
				usage.cache_creation_input_tokens = raw['cache_creation_input_tokens'];
			}
			if (typeof raw['cache_read_input_tokens'] === 'number') {
				usage.cache_read_input_tokens = raw['cache_read_input_tokens'];
			}
			usage.batch_discount_applied = true;

			const completion: LLMCompletionResult = {
				content: message.content
					.filter((b) => b.type === 'text')
					.map((b) => (b as Anthropic.TextBlock).text)
					.join(''),
				finish_reason: message.stop_reason ?? undefined,
				role: 'assistant',
				usage
			};
			results.push({ id: item.custom_id, result: completion });
		} else if (item.result.type === 'errored') {
			results.push({
				error: item.result.error?.type ?? 'unknown error',
				id: item.custom_id
			});
		} else {
			results.push({ error: `unexpected result type: ${item.result.type}`, id: item.custom_id });
		}
	}

	return results;
}

/**
 * Cancel a batch job
 */
export async function cancelAnthropicBatch(client: Anthropic, batchId: string): Promise<void> {
	await client.beta.messages.batches.cancel(batchId);
}
