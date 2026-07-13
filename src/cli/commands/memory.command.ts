import type * as ValoraMemoryVaultModule from '@windagency/valora-plugin-memory-vault';

import { getMemoryRegistry } from 'memory/registry';
import { createSecurityEvent } from 'security/security-event.types';

import type { CommandAdapter } from 'cli/command-adapter.interface';
import type { MemoryCategory, MemoryEntry, MemoryProvider } from 'types/memory.types';

import {
	DEFAULT_MEMORY_EMBED_BATCH_SIZE,
	DEFAULT_MEMORY_EMBED_DIM,
	DEFAULT_MEMORY_EMBED_MODEL
} from 'config/constants';
import { getConfigLoader } from 'config/loader';
import { createContainer, initializePlugins } from 'di/container';
import { getProviderRegistry } from 'llm/registry';
import { getColorAdapter } from 'output/color-adapter.interface';

export interface MemoryCommandDirs {
	bootstrap?: () => Promise<void>;
	jsonDir: string;
	vaultDir: string;
}

type ColorAdapter = ReturnType<typeof getColorAdapter>;

interface ListOptions {
	agent?: string;
	category?: string;
	limit?: string;
	tag?: string;
}

interface PurgeOptions {
	all?: boolean;
	dryRun?: boolean;
	olderThan?: string;
	store?: string;
	yes?: boolean;
}

interface ReembedConfig {
	batchSize: number;
	dim: number;
	memoryConfig: Parameters<typeof ValoraMemoryVaultModule.resolveEmbedder>[0];
	model: string;
}

interface ReembedOptions {
	confirm?: boolean;
	dim?: string;
	model?: string;
}

interface ResolvedReembedConfig {
	batchSize: number;
	dim: number;
	embedder: Awaited<ReturnType<typeof ValoraMemoryVaultModule.resolveEmbedder>>;
	model: string;
}

export function configureMemoryCommand(program: CommandAdapter, dirs: MemoryCommandDirs): void {
	const color = getColorAdapter();
	const { jsonDir, vaultDir } = dirs;

	const memory = program.command('memory').description('Inspect and manage the Valora memory vault');

	if (dirs.bootstrap) {
		memory.hook('preAction', dirs.bootstrap);
	}

	memory
		.command('info')
		.description('Show vault statistics (entry count, edge count, embedding coverage)')
		.action(async () => {
			const info = await activeProvider().info();
			const totalEntries = info.counts.episodic + info.counts.semantic + info.counts.decisions;

			console.log(color.bold(`Memory provider: ${info.label} (${info.name})`));
			console.log(`  Schema version:      ${info.schemaVersion ?? 'none (no vault)'}`);
			console.log(`  Entries:             ${totalEntries}`);
			console.log(`  Edges:               ${info.edgeCount ?? 0}`);
			console.log(`  Embedding coverage:  ${Math.round((info.embeddingCoverage ?? 0) * 100)}%`);
		});

	memory
		.command('migrate')
		.description('Migrate legacy JSON stores into the Markdown vault')
		.action(async () => {
			const { migrateJsonToVault } = await requireVault();
			console.log(color.cyan('Migrating JSON memory stores to vault…'));
			const result = migrateJsonToVault({ jsonDir, vaultDir });
			console.log(color.green(`Migration complete: ${result.migrated} migrated, ${result.skipped} skipped`));
		});

	memory
		.command('verify')
		.description('Verify all vault entries are readable and report coverage')
		.action(async () => {
			const report = await activeProvider().verify();
			const total = report.counts.episodic + report.counts.semantic + report.counts.decisions;

			if (!report.ok) {
				console.log(color.red(`Verify: ${report.issues.length} issues`));
				for (const issue of report.issues) console.log(color.red(`  - ${issue}`));
			} else {
				console.log(color.green(`Verify OK: ${total} entries readable across all categories`));
			}
		});

	memory
		.command('purge')
		.description('Delete memory entries by store, age, or all at once')
		.option('--all', 'Purge entries across all stores')
		.option('--store <store>', 'Purge entries in a specific store (episodic|semantic|decisions)')
		.option('--older-than <duration>', 'Purge entries older than this duration (e.g. 7d, 30d, 24h)')
		.option('--dry-run', 'Report what would be deleted without deleting')
		.option('--yes', 'Skip confirmation prompt')
		.action(async (options: PurgeOptions) => executePurge(options, color));

	memory
		.command('list')
		.description('List entries from the vault, with optional filters')
		.option('--category <category>', 'Filter by category (episodic|semantic|decisions)')
		.option('--tag <tag>', 'Filter by tag')
		.option('--agent <role>', 'Filter by agent role')
		.option('--limit <n>', 'Maximum number of entries to display', '20')
		.action(async (options: ListOptions) => executeList(options, color));

	memory
		.command('reembed')
		.description('Re-generate embeddings for every vault entry (destructive — overwrites embeddings.bin)')
		.option('--confirm', 'Skip the destructive-action confirmation prompt')
		.option('--model <name>', 'Override the embedding model from config')
		.option('--dim <n>', 'Override the embedding dimension from config')
		.action(async (options: ReembedOptions) => executeReembed(options, color, vaultDir));
}

function activeProvider(): MemoryProvider {
	return getMemoryRegistry().getActive();
}

function assertPurgeTarget(
	all: boolean | undefined,
	store: string | undefined,
	olderThan: string | undefined,
	color: ColorAdapter
): void {
	if (!all && !store && !olderThan) {
		console.error(color.red('Error: at least one of --all, --store, or --older-than is required'));
		process.exit(1);
	}
}

async function collectAllVaultEntries(store: ValoraMemoryVaultModule.VaultStore): Promise<MemoryEntry[]> {
	const [episodic, semantic, decisions] = await Promise.all([
		store.getEntries('episodic'),
		store.getEntries('semantic'),
		store.getEntries('decisions')
	]);
	return [...episodic, ...semantic, ...decisions];
}

async function confirmPurge(
	all: boolean | undefined,
	store: string | undefined,
	olderThan: string | undefined,
	color: ColorAdapter
): Promise<boolean> {
	const scope = all ? 'all stores' : (store ?? 'filtered entries');
	const age = olderThan ? ` older than ${olderThan}` : '';
	process.stdout.write(`Purge entries from ${scope}${age}? [y/N] `);
	const confirmed = await readConfirmation();
	if (!confirmed) {
		console.log(color.yellow('Purge cancelled.'));
	}
	return confirmed;
}

async function deleteExistingEmbeddings(vaultDir: string): Promise<void> {
	const fs = await import('node:fs');
	const pathMod = await import('node:path');
	for (const file of ['embeddings.bin', 'embeddings.index.json']) {
		try {
			fs.rmSync(pathMod.join(vaultDir, file));
		} catch {
			/* file may not exist yet — fine */
		}
	}
}

async function executeList(options: ListOptions, color: ColorAdapter): Promise<void> {
	const limit = options.limit ? parseInt(options.limit, 10) : 20;
	const results = await activeProvider().query({
		agentRole: options.agent,
		category: options.category as MemoryCategory | undefined,
		limit,
		strengthen: false,
		tags: options.tag ? [options.tag] : undefined
	});

	if (results.length === 0) {
		console.log(color.yellow('No entries match the filter.'));
		return;
	}

	console.log(color.bold(`Vault entries (${results.length})`));
	for (const result of results) {
		const { entry } = result;
		console.log(
			`  ${color.cyan(entry.id)} [${entry.category}] (${entry.confidence}, strength=${result.strength.toFixed(2)})`
		);
		console.log(`    ${entry.content.split('\n')[0] ?? ''}`);
		console.log(color.gray(`    tags=${entry.tags.join(', ') || '<none>'}`));
	}
}

async function executePurge(options: PurgeOptions, color: ColorAdapter): Promise<void> {
	const { all, dryRun, olderThan, store, yes } = options;
	assertPurgeTarget(all, store, olderThan, color);
	const categories: MemoryCategory[] | undefined = store ? [store as MemoryCategory] : undefined;
	const olderThanMs = resolvePurgeDuration(olderThan, color);
	const provider = activeProvider();

	if (dryRun) {
		const result = await provider.purge({ all, categories, dryRun: true, olderThanMs });
		console.log(color.cyan(`Dry run: would delete ${result.totalWouldDelete} entries`));
		return;
	}

	if (!yes && !(await confirmPurge(all, store, olderThan, color))) return;

	const result = await provider.purge({ all, categories, dryRun: false, olderThanMs });
	const auditEvent = createSecurityEvent('memory_purged', 'low', {
		all: all ?? false,
		categories: categories ?? ['episodic', 'semantic', 'decisions'],
		deletedCount: result.totalDeleted,
		olderThanMs: olderThanMs ?? null
	});
	console.log(color.gray(`[audit] memory_purged at ${auditEvent.timestamp.toISOString()}`));
	console.log(color.green(`Purged ${result.totalDeleted} entries`));
}

async function executeReembed(options: ReembedOptions, color: ColorAdapter, vaultDir: string): Promise<void> {
	if (!options.confirm) {
		console.log(
			color.yellow(
				'Reembed will overwrite the existing embeddings.bin and embeddings.index.json. Pass --confirm to proceed.'
			)
		);
		return;
	}

	const resolved = await resolveReembedConfig(options, color);
	if (resolved === null) return;

	// Reembed manipulates the vault's binary embedding store directly. It is
	// vault-specific tooling that bypasses the MemoryProvider port.
	const { openVectorStore, VaultStore } = await requireVault();
	const store = new VaultStore(vaultDir);
	const allEntries = await collectAllVaultEntries(store);
	await deleteExistingEmbeddings(vaultDir);

	const vs = openVectorStore(vaultDir, resolved.model, resolved.dim);
	const processed = await reembedAll(resolved, allEntries, store, vs, color);
	vs.flush();

	console.log(
		color.green(
			`Reembedded ${processed}/${allEntries.length} entries with model=${resolved.model} dim=${resolved.dim}.`
		)
	);
}

function parseDuration(input: string): number | undefined {
	const match = /^(\d+)(d|h|m)$/.exec(input.trim());
	if (!match) return undefined;
	const value = parseInt(match[1]!, 10);
	const unit = match[2];
	const msPerUnit: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000 };
	return value * (msPerUnit[unit!] ?? 0);
}

async function readConfirmation(): Promise<boolean> {
	return new Promise((resolve) => {
		process.stdin.setEncoding('utf-8');
		process.stdin.once('data', (chunk: unknown) => {
			resolve(String(chunk).trim().toLowerCase() === 'y');
		});
	});
}

async function readMemoryConfigOrDefaults(): Promise<ReembedConfig> {
	const fallback: ReembedConfig = {
		batchSize: DEFAULT_MEMORY_EMBED_BATCH_SIZE,
		dim: DEFAULT_MEMORY_EMBED_DIM,
		memoryConfig: undefined,
		model: DEFAULT_MEMORY_EMBED_MODEL
	};
	try {
		const { parseVaultPluginConfig } = await requireVault();
		const rawPlugins = getConfigLoader().getRaw()['plugins'] as Record<string, unknown> | undefined;
		const memoryConfig = parseVaultPluginConfig(rawPlugins?.['memory-vault']);
		const embedding = memoryConfig.embedding;
		return {
			batchSize: embedding?.batch_size ?? DEFAULT_MEMORY_EMBED_BATCH_SIZE,
			dim: embedding?.dim ?? DEFAULT_MEMORY_EMBED_DIM,
			memoryConfig,
			model: embedding?.model ?? DEFAULT_MEMORY_EMBED_MODEL
		};
	} catch {
		return fallback;
	}
}

async function reembedAll(
	config: ResolvedReembedConfig,
	allEntries: MemoryEntry[],
	store: ValoraMemoryVaultModule.VaultStore,
	vs: ReturnType<typeof ValoraMemoryVaultModule.openVectorStore>,
	color: ColorAdapter
): Promise<number> {
	const total = allEntries.length;
	let processed = 0;

	for (let i = 0; i < total; i += config.batchSize) {
		const batch = allEntries.slice(i, i + config.batchSize);
		const inputs = batch.map((entry) => entry.content);
		const result = await config.embedder!.embed({ input: inputs, model: config.model });

		for (let j = 0; j < batch.length; j++) {
			const entry = batch[j]!;
			const vector = result.vectors[j];
			if (!vector) continue;
			vs.append(entry.id, vector);
			await store.updateEntry(entry.category, entry.id, {
				contentHash: undefined,
				embeddingDim: result.dim,
				embeddingModel: result.model
			});
			processed++;
			console.log(color.gray(`Reembedding: ${processed}/${total} | model=${result.model} dim=${result.dim}`));
		}
	}
	return processed;
}

async function requireVault(): Promise<typeof ValoraMemoryVaultModule> {
	try {
		return await import('@windagency/valora-plugin-memory-vault');
	} catch {
		throw new Error('Vault plugin not installed. Run: valora plugin add valora-plugin-memory-vault');
	}
}

function resolvePurgeDuration(olderThan: string | undefined, color: ColorAdapter): number | undefined {
	if (!olderThan) return undefined;
	const ms = parseDuration(olderThan);
	if (ms === undefined) {
		console.error(color.red(`Error: cannot parse duration '${olderThan}'. Use format like 7d, 30d, 24h.`));
		process.exit(1);
	}
	return ms;
}

async function resolveReembedConfig(
	options: ReembedOptions,
	color: ColorAdapter
): Promise<null | ResolvedReembedConfig> {
	const config = await readMemoryConfigOrDefaults();
	const model = options.model ?? config.model;
	const dim = options.dim ? parseInt(options.dim, 10) : config.dim;
	const batchSize = config.batchSize;

	// resolveEmbedder() needs a ProviderLookup to pick a real, embed-capable
	// LLM provider (e.g. Ollama) — without loading plugins first, the host's
	// provider registry is empty and no provider can ever be selected.
	const container = createContainer();
	await initializePlugins(container);

	const { resolveEmbedder } = await requireVault();
	const embedder = await resolveEmbedder(
		{
			...(config.memoryConfig ?? {}),
			embedding: { batch_size: batchSize, dim, model, provider: 'auto' }
		} as Parameters<typeof resolveEmbedder>[0],
		getProviderRegistry()
	);

	if (!embedder) {
		console.error(
			color.red('No embed-capable provider available. Configure Ollama or another provider with embed support.')
		);
		process.exit(1);
	}
	return { batchSize, dim, embedder, model };
}
