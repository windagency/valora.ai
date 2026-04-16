/**
 * OpenAI Batch API helper functions
 *
 * Used by OpenAIProvider to implement BatchableProvider.
 * Handles JSONL serialisation, file upload, and response parsing.
 */

import type { BatchResult, BatchStatusInfo, BatchStatusValue, BatchSubmission } from 'batch/batch.types';

import { type OpenAI, toFile } from 'openai';

import type { LLMCompletionResult, LLMUsage } from 'types/llm.types';

const OPENAI_STATUS_MAP: Record<string, BatchStatusValue> = {
	cancelled: 'cancelled',
	cancelling: 'cancelled',
	completed: 'completed',
	expired: 'expired',
	failed: 'failed',
	finalizing: 'processing',
	in_progress: 'processing'
};

/**
 * Maps OpenAI batch status → BatchStatusValue
 */
export function mapOpenAIStatus(status: string): BatchStatusValue {
	return OPENAI_STATUS_MAP[status] ?? 'queued';
}

/**
 * OpenAI JSONL batch request line format
 */
interface OpenAIBatchLine {
	body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
	custom_id: string;
	method: 'POST';
	url: '/v1/chat/completions';
}

/**
 * Submit a batch to OpenAI
 */
export async function submitOpenAIBatch(
	client: OpenAI,
	requests: Array<{
		customId: string;
		params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
	}>,
	providerName: string,
	localId: string
): Promise<BatchSubmission> {
	// Serialise requests as JSONL
	const lines: OpenAIBatchLine[] = requests.map((r) => ({
		body: r.params,
		custom_id: r.customId,
		method: 'POST',
		url: '/v1/chat/completions'
	}));
	const jsonlContent = lines.map((l) => JSON.stringify(l)).join('\n');

	const file = await toFile(Buffer.from(jsonlContent), 'batch.jsonl', { type: 'application/jsonl' });

	const uploaded: OpenAI.FileObject = await client.files.create({ file, purpose: 'batch' });

	// Create the batch job
	const batch = await client.batches.create({
		completion_window: '24h',
		endpoint: '/v1/chat/completions',
		input_file_id: uploaded.id
	});

	return {
		batchId: batch.id,
		localId,
		provider: providerName,
		requestCount: requests.length,
		status: mapOpenAIStatus(batch.status),
		submittedAt: new Date().toISOString()
	};
}

/**
 * Get batch status from OpenAI
 */
export async function getOpenAIBatchStatus(client: OpenAI, batchId: string): Promise<BatchStatusInfo> {
	const batch = await client.batches.retrieve(batchId);
	const counts = batch.request_counts;
	const totalCount = counts?.total ?? 0;
	const completedCount = counts?.completed ?? 0;
	const failedCount = counts?.failed ?? 0;

	return {
		batchId: batch.id,
		completedCount,
		failedCount,
		status: mapOpenAIStatus(batch.status),
		totalCount
	};
}

/**
 * Build normalised LLMUsage from an OpenAI CompletionUsage, including cache fields.
 */
function buildOpenAIUsage(raw: OpenAI.CompletionUsage): LLMUsage {
	const usage: LLMUsage = {
		batch_discount_applied: true,
		completion_tokens: raw.completion_tokens,
		prompt_tokens: raw.prompt_tokens,
		total_tokens: raw.total_tokens
	};
	const details = raw.prompt_tokens_details as Record<string, unknown> | undefined;
	const cachedTokens = typeof details?.['cached_tokens'] === 'number' ? details['cached_tokens'] : 0;
	if (cachedTokens > 0) {
		usage.cache_read_input_tokens = cachedTokens;
	}
	return usage;
}

/**
 * Build an LLMCompletionResult from a single OpenAI chat choice.
 */
function buildOpenAICompletion(
	choice: OpenAI.Chat.Completions.ChatCompletion.Choice,
	usage: LLMUsage | undefined
): LLMCompletionResult {
	return {
		content: choice.message.content ?? '',
		finish_reason: choice.finish_reason,
		role: 'assistant',
		tool_calls: choice.message.tool_calls?.map((tc) => ({
			arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
			id: tc.id,
			name: tc.function.name
		})),
		usage
	};
}

/**
 * Parse a single JSONL line from an OpenAI batch output file into a BatchResult.
 */
function parseOpenAIBatchLine(parsed: {
	custom_id: string;
	error?: null | { code: string; message: string };
	response?: null | {
		body?: OpenAI.Chat.Completions.ChatCompletion;
		status_code?: number;
	};
}): BatchResult {
	if (parsed.error) {
		return { error: `${parsed.error.code}: ${parsed.error.message}`, id: parsed.custom_id };
	}

	const body = parsed.response?.body;
	const choice = body?.choices?.[0];
	if (!choice) {
		return { error: 'no choices in response', id: parsed.custom_id };
	}

	const usage = body.usage ? buildOpenAIUsage(body.usage) : undefined;
	return { id: parsed.custom_id, result: buildOpenAICompletion(choice, usage) };
}

/**
 * Retrieve completed batch results from OpenAI
 */
export async function getOpenAIBatchResults(client: OpenAI, batchId: string): Promise<BatchResult[]> {
	const batch = await client.batches.retrieve(batchId);
	if (!batch.output_file_id) {
		throw new Error(`Batch ${batchId} has no output file — status: ${batch.status}`);
	}

	const fileContent = await client.files.content(batch.output_file_id);
	const rawText = await fileContent.text();
	const results: BatchResult[] = [];

	for (const line of rawText.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const parsed = JSON.parse(trimmed) as {
			custom_id: string;
			error?: null | { code: string; message: string };
			response?: null | {
				body?: OpenAI.Chat.Completions.ChatCompletion;
				status_code?: number;
			};
		};
		results.push(parseOpenAIBatchLine(parsed));
	}

	return results;
}

/**
 * Cancel an OpenAI batch job
 */
export async function cancelOpenAIBatch(client: OpenAI, batchId: string): Promise<void> {
	await client.batches.cancel(batchId);
}
