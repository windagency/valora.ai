/**
 * Tests for the batch CLI command (list/status/results/cancel) — previously
 * had zero test coverage, including loadBatchSafely()'s try/catch (documented
 * in-source as a fix for an unhandled-exception bug on a malformed localId)
 * and the results --wait polling path.
 *
 * Uses the real batch-session persistence functions against a real temp
 * directory (mocking only utils/paths.getRuntimeDataDir) and a real
 * BatchableProvider registered into the real llm/registry singleton —
 * mirrors the pattern already used in memory.command.test.ts's reembed fix.
 */
import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BatchResult, BatchStatusInfo, BatchSubmission, PersistedBatch } from 'batch/batch.types';
import type { LLMProvider } from 'types/llm.types';

let batchDataRoot: string;
vi.mock('utils/paths', async (importOriginal) => {
	const actual = await importOriginal<typeof import('utils/paths')>();
	return { ...actual, getRuntimeDataDir: () => batchDataRoot };
});

vi.mock('output/color-adapter.interface', () => ({
	getColorAdapter: () => ({
		bold: (s: string) => s,
		cyan: (s: string) => s,
		dim: (s: string) => s,
		green: (s: string) => s,
		red: (s: string) => s,
		yellow: (s: string) => s
	})
}));

vi.mock('output/logger', () => ({
	getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() })
}));

let configuredProviders: Record<string, unknown> = {};
vi.mock('config/loader', () => ({
	getConfigLoader: () => ({ load: async () => ({ defaults: {}, providers: configuredProviders }) })
}));

vi.mock('llm/providers/anthropic.provider', () => ({}));
vi.mock('llm/providers/openai.provider', () => ({}));
vi.mock('llm/providers/google.provider', () => ({}));

import { configureBatchCommand } from './batch.command';
import { generateLocalId, persistBatch } from 'batch/batch-session';
import { getProviderRegistry, resetProviderRegistry } from 'llm/registry';

function makeProgram(): Command {
	const program = new Command();
	program.exitOverride();
	configureBatchCommand(program as never);
	return program;
}

async function runCommand(program: Command, args: string[]): Promise<void> {
	await program.parseAsync(['node', 'valora', ...args]);
}

function makeSubmission(overrides: Partial<BatchSubmission> = {}): BatchSubmission {
	return {
		batchId: 'provider-batch-1',
		localId: 'unused',
		provider: 'fake-batch-provider',
		requestCount: 2,
		status: 'processing',
		submittedAt: new Date(0).toISOString(),
		...overrides
	};
}

const mockSubmitBatch = vi.fn();
const mockGetBatchStatus = vi.fn();
const mockGetBatchResults = vi.fn();
const mockCancelBatch = vi.fn();

class FakeBatchableProvider implements Pick<LLMProvider, 'complete' | 'isConfigured' | 'streamComplete'> {
	constructor(_config: Record<string, unknown>) {}
	async cancelBatch(batchId: string): Promise<void> {
		return mockCancelBatch(batchId);
	}
	async complete(): Promise<never> {
		throw new Error('not used by batch command');
	}
	async getBatchResults(batchId: string): Promise<BatchResult[]> {
		return mockGetBatchResults(batchId);
	}
	async getBatchStatus(batchId: string): Promise<BatchStatusInfo> {
		return mockGetBatchStatus(batchId);
	}
	isConfigured(): boolean {
		return true;
	}
	async streamComplete(): Promise<never> {
		throw new Error('not used by batch command');
	}
	async submitBatch(): Promise<BatchSubmission> {
		return mockSubmitBatch();
	}
	supportsBatch(): true {
		return true;
	}
}

describe('batch command (real batch-session persistence)', () => {
	let tmpDir: string;
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valora-batch-cmd-'));
		batchDataRoot = tmpDir;
		configuredProviders = { 'fake-batch-provider': {} };
		mockSubmitBatch.mockReset();
		mockGetBatchStatus.mockReset();
		mockGetBatchResults.mockReset();
		mockCancelBatch.mockReset();
		getProviderRegistry().registerProvider('fake-batch-provider', FakeBatchableProvider as never, { owner: 'core' });
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
	});

	afterEach(async () => {
		resetProviderRegistry();
		await fs.rm(tmpDir, { force: true, recursive: true });
		vi.restoreAllMocks();
	});

	function loggedOutput(): string {
		return consoleLogSpy.mock.calls.map((c) => c.join(' ')).join('\n');
	}

	/** localId must match batch-session.ts's ^[a-f0-9]{16}$ format — generate a real one rather than a readable stub. */
	function seedBatch(overrides: Partial<PersistedBatch> = {}): { batch: PersistedBatch; localId: string } {
		const localId = generateLocalId();
		const batch: PersistedBatch = {
			localId,
			requests: [{ id: 'req-1', options: { messages: [{ content: 'hi', role: 'user' }] } }],
			submission: makeSubmission({ localId }),
			...overrides,
			localId
		};
		persistBatch(batch);
		return { batch, localId };
	}

	describe('list', () => {
		it('reports no batch jobs found when none are persisted', async () => {
			await runCommand(makeProgram(), ['batch', 'list']);

			expect(loggedOutput()).toContain('No batch jobs found');
		});

		it('lists every persisted batch job', async () => {
			const { localId: idA } = seedBatch({ submission: makeSubmission({ status: 'completed' }) });
			const { localId: idB } = seedBatch({ submission: makeSubmission({ status: 'processing' }) });

			await runCommand(makeProgram(), ['batch', 'list']);

			const output = loggedOutput();
			expect(output).toContain(idA);
			expect(output).toContain(idB);
			expect(output).toContain('Batch jobs (2)');
		});
	});

	describe('status', () => {
		it('shows the persisted status for a known batch', async () => {
			const { localId } = seedBatch({ submission: makeSubmission({ requestCount: 5 }) });

			await runCommand(makeProgram(), ['batch', 'status', localId]);

			const output = loggedOutput();
			expect(output).toContain('fake-batch-provider');
			expect(output).toContain('5');
			expect(exitSpy).not.toHaveBeenCalled();
		});

		it('exits with an error when the batch is not found', async () => {
			await runCommand(makeProgram(), ['batch', 'status', 'abcdef0123456789']);

			expect(exitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Batch not found'));
		});

		it('exits with an error rather than throwing for a malformed/traversal-shaped localId', async () => {
			// Regression coverage for the documented loadBatchSafely() fix — a raw
			// localId reaches this straight from CLI argv, and validateBatchId()
			// throws (rather than returning null) on a bad shape. Before that fix,
			// this would be an unhandled exception instead of a clean CLI error.
			await expect(runCommand(makeProgram(), ['batch', 'status', '../../etc/passwd'])).resolves.toBeUndefined();

			expect(exitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid batch ID'));
		});
	});

	describe('cancel', () => {
		it('invokes cancelBatch on the resolved provider with the batch id, for the right batch', async () => {
			const { localId } = seedBatch({ submission: makeSubmission({ batchId: 'provider-batch-xyz' }) });
			mockCancelBatch.mockResolvedValueOnce(undefined);

			await runCommand(makeProgram(), ['batch', 'cancel', localId]);

			expect(mockCancelBatch).toHaveBeenCalledWith('provider-batch-xyz');
			expect(exitSpy).not.toHaveBeenCalled();
			expect(loggedOutput()).toContain('cancelled');
		});

		it('exits with an error when the batch is not found', async () => {
			await runCommand(makeProgram(), ['batch', 'cancel', 'abcdef0123456789']);

			expect(exitSpy).toHaveBeenCalledWith(1);
			expect(mockCancelBatch).not.toHaveBeenCalled();
		});

		it('exits with an error when the provider cannot be resolved (not configured)', async () => {
			const { localId } = seedBatch({ submission: makeSubmission({ provider: 'unconfigured-provider' }) });

			await runCommand(makeProgram(), ['batch', 'cancel', localId]);

			expect(exitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot resolve batch-capable provider'));
		});

		it('exits with an error when the underlying cancel call fails', async () => {
			const { localId } = seedBatch();
			mockCancelBatch.mockRejectedValueOnce(new Error('provider rejected cancellation'));

			await runCommand(makeProgram(), ['batch', 'cancel', localId]);

			expect(exitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('provider rejected cancellation'));
		});
	});

	describe('results', () => {
		it('retrieves and prints results without --wait', async () => {
			const { localId } = seedBatch();
			mockGetBatchResults.mockResolvedValueOnce([
				{ id: 'req-1', result: { content: 'the answer is 42', role: 'assistant' } },
				{ error: 'rate limited', id: 'req-2' }
			] satisfies BatchResult[]);

			await runCommand(makeProgram(), ['batch', 'results', localId]);

			const output = loggedOutput();
			expect(output).toContain('the answer is 42');
			expect(output).toContain('req-2');
			expect(output).toContain('rate limited');
			expect(exitSpy).not.toHaveBeenCalled();
		});

		it('polls via waitForResults when --wait is passed, using fake timers to skip the real backoff delay', async () => {
			const { localId } = seedBatch({ submission: makeSubmission({ status: 'processing' }) });
			mockGetBatchStatus
				.mockResolvedValueOnce({
					batchId: 'provider-batch-1',
					completedCount: 0,
					failedCount: 0,
					status: 'processing',
					totalCount: 1
				})
				.mockResolvedValue({
					batchId: 'provider-batch-1',
					completedCount: 1,
					failedCount: 0,
					status: 'completed',
					totalCount: 1
				});
			mockGetBatchResults.mockResolvedValue([{ id: 'req-1', result: { content: 'done', role: 'assistant' } }]);

			vi.useFakeTimers();
			try {
				const pending = runCommand(makeProgram(), ['batch', 'results', localId, '--wait']);
				await vi.runAllTimersAsync();
				await pending;
			} finally {
				vi.useRealTimers();
			}

			expect(loggedOutput()).toContain('done');
			expect(exitSpy).not.toHaveBeenCalled();
		});

		it('exits with an error when the batch is not found', async () => {
			await runCommand(makeProgram(), ['batch', 'results', 'abcdef0123456789']);

			expect(exitSpy).toHaveBeenCalledWith(1);
		});

		it('exits with an error when retrieving results throws', async () => {
			const { localId } = seedBatch();
			mockGetBatchResults.mockRejectedValueOnce(new Error('upstream 500'));

			await runCommand(makeProgram(), ['batch', 'results', localId]);

			expect(exitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('upstream 500'));
		});
	});
});
