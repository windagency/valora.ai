/**
 * Batch command — manage async batch LLM jobs
 *
 * valora batch list
 * valora batch status <localId>
 * valora batch results <localId> [--wait]
 * valora batch cancel <localId>
 */

import { getBatchOrchestrator } from 'batch/batch-orchestrator';
import { type BatchableProvider, isBatchableProvider } from 'batch/batch-provider.interface';
import { loadBatch } from 'batch/batch-session';

import type { CommandAdapter } from 'cli/command-adapter.interface';

import { getConfigLoader } from 'config/loader';
import { getProviderRegistry } from 'llm/registry';
import { getColorAdapter } from 'output/color-adapter.interface';
import { getLogger } from 'output/logger';

// Ensure all providers self-register before batch operations
import 'llm/providers/anthropic.provider';
import 'llm/providers/openai.provider';
import 'llm/providers/google.provider';

/**
 * Resolve a batch-capable provider by name from app config.
 * Returns null if the provider is not configured or does not support batch.
 */
async function resolveBatchProvider(providerName: string): Promise<BatchableProvider | null> {
	const logger = getLogger();
	try {
		const config = await getConfigLoader().load();
		const providerConfig = config.providers[providerName as keyof typeof config.providers] ?? {};
		const provider = getProviderRegistry().createProvider(providerName, providerConfig as Record<string, unknown>);

		if (!isBatchableProvider(provider)) {
			logger.warn(`Provider "${providerName}" does not support batch operations`);
			return null;
		}
		return provider;
	} catch (error) {
		logger.error(`Failed to resolve provider "${providerName}": ${(error as Error).message}`);
		return null;
	}
}

// This is intentionally not exported from the file — the function is called
// by index.ts but not re-exported from commands/index if any.
export function configureBatchCommand(program: CommandAdapter): void {
	const batchCmd = program.command('batch').description('Manage async batch LLM jobs (50% token cost reduction)');

	// ── list ──────────────────────────────────────────────────────────────────
	batchCmd
		.command('list')
		.description('List all known batch jobs')
		.action(() => {
			const orchestrator = getBatchOrchestrator();
			const batches = orchestrator.list();
			const color = getColorAdapter();

			if (batches.length === 0) {
				console.log(color.dim('No batch jobs found.'));
				return;
			}

			console.log(color.bold(`\nBatch jobs (${batches.length}):\n`));
			for (const b of batches) {
				const s = b.submission;
				const statusColor =
					s.status === 'completed'
						? color.green(s.status)
						: s.status === 'failed' || s.status === 'cancelled'
							? color.red(s.status)
							: color.yellow(s.status);
				console.log(
					`  ${color.cyan(b.localId)}  ${color.dim(s.provider)}  ${statusColor}  ` +
						`${s.requestCount} request(s)  ${color.dim(s.submittedAt)}`
				);
			}
			console.log('');
		});

	// ── status ────────────────────────────────────────────────────────────────
	batchCmd
		.command('status <localId>')
		.description('Show current status of a batch job')
		.action((...args: Array<Record<string, unknown>>) => {
			const localId = args[0] as unknown as string;
			const color = getColorAdapter();
			const persisted = loadBatch(localId);
			if (!persisted) {
				console.error(color.red(`Batch not found: ${localId}`));
				process.exit(1);
				return;
			}

			const { submission: s } = persisted;
			console.log(`\nBatch ${color.cyan(localId)}`);
			console.log(`  Provider:   ${s.provider}`);
			console.log(`  Batch ID:   ${s.batchId}`);
			console.log(`  Status:     ${s.status}`);
			console.log(`  Requests:   ${s.requestCount}`);
			console.log(`  Submitted:  ${s.submittedAt}`);
			if (s.estimatedCompletionAt) {
				console.log(`  Est. done:  ${s.estimatedCompletionAt}`);
			}
			console.log('');
		});

	// ── results ───────────────────────────────────────────────────────────────
	batchCmd
		.command('results <localId>')
		.description('Retrieve completed batch results')
		.option('--wait', 'Poll until the batch completes, then print results')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const localId = args[0] as unknown as string;
			const options = args[1] as unknown as { wait?: boolean };
			const color = getColorAdapter();
			const persisted = loadBatch(localId);

			if (!persisted) {
				console.error(color.red(`Batch not found: ${localId}`));
				process.exit(1);
				return;
			}

			const provider = await resolveBatchProvider(persisted.submission.provider);
			if (!provider) {
				console.error(
					color.red(
						`Cannot resolve batch-capable provider "${persisted.submission.provider}". ` +
							`Ensure it is configured in your valora config.`
					)
				);
				process.exit(1);
				return;
			}

			const orchestrator = getBatchOrchestrator();

			try {
				let results;
				if (options.wait) {
					console.log(color.dim(`Waiting for batch ${localId} to complete…`));
					results = await orchestrator.waitForResults(localId, provider);
				} else {
					results = await orchestrator.getResults(localId, provider);
				}

				console.log(`\nResults for batch ${color.cyan(localId)} (${results.length} items):\n`);
				for (const r of results) {
					if (r.error) {
						console.log(`  ${color.red('✗')} ${r.id}: ${r.error}`);
					} else {
						const preview = (r.result?.content ?? '').substring(0, 120).replace(/\n/g, ' ');
						console.log(`  ${color.green('✓')} ${r.id}: ${preview}…`);
					}
				}
				console.log('');
			} catch (error) {
				console.error(color.red(`Failed to retrieve results: ${(error as Error).message}`));
				process.exit(1);
			}
		});

	// ── cancel ────────────────────────────────────────────────────────────────
	batchCmd
		.command('cancel <localId>')
		.description('Cancel a pending or processing batch job')
		.action(async (...args: Array<Record<string, unknown>>) => {
			const localId = args[0] as unknown as string;
			const color = getColorAdapter();
			const persisted = loadBatch(localId);

			if (!persisted) {
				console.error(color.red(`Batch not found: ${localId}`));
				process.exit(1);
				return;
			}

			const provider = await resolveBatchProvider(persisted.submission.provider);
			if (!provider) {
				console.error(color.red(`Cannot resolve batch-capable provider "${persisted.submission.provider}".`));
				process.exit(1);
				return;
			}

			const orchestrator = getBatchOrchestrator();
			try {
				await orchestrator.cancel(localId, provider);
				console.log(color.green(`Batch ${localId} cancelled.`));
			} catch (error) {
				console.error(color.red(`Failed to cancel batch: ${(error as Error).message}`));
				process.exit(1);
			}
		});
}
