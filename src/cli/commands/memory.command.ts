import { MemoryManager } from 'memory/manager';
import { migrateJsonToVault } from 'memory/migration/json-to-vault';
import { readVaultVersion } from 'memory/migration/vault-version';
import { VaultStore } from 'memory/vault/vault-store';
import { createSecurityEvent } from 'security/security-event.types';

import type { CommandAdapter } from 'cli/command-adapter.interface';
import type { MemoryCategory } from 'types/memory.types';

import { getColorAdapter } from 'output/color-adapter.interface';

export interface MemoryCommandDirs {
	jsonDir: string;
	vaultDir: string;
}

type ColorAdapter = ReturnType<typeof getColorAdapter>;

interface PurgeOptions {
	all?: boolean;
	dryRun?: boolean;
	olderThan?: string;
	store?: string;
	yes?: boolean;
}

export function configureMemoryCommand(program: CommandAdapter, dirs: MemoryCommandDirs): void {
	const color = getColorAdapter();
	const { jsonDir, vaultDir } = dirs;

	const memory = program.command('memory').description('Inspect and manage the Valora memory vault');

	memory
		.command('info')
		.description('Show vault statistics (entry count, edge count, embedding coverage)')
		.action(async () => {
			const store = new VaultStore(vaultDir);
			// Load entries to populate the index
			await store.getEntries('episodic');
			await store.getEntries('semantic');
			await store.getEntries('decisions');
			const stats = store.getVaultStats();
			const version = readVaultVersion(vaultDir);

			console.log(color.bold('Memory vault info'));
			console.log(`  Schema version:      ${version ?? 'none (no vault)'}`);
			console.log(`  Entries:             ${stats.entryCount}`);
			console.log(`  Edges:               ${stats.edgeCount}`);
			console.log(`  Embedding coverage:  ${Math.round(stats.embeddingCoverage * 100)}%`);
		});

	memory
		.command('migrate')
		.description('Migrate legacy JSON stores into the Markdown vault')
		.action(() => {
			console.log(color.cyan('Migrating JSON memory stores to vault…'));
			const result = migrateJsonToVault({ jsonDir, vaultDir });
			console.log(color.green(`Migration complete: ${result.migrated} migrated, ${result.skipped} skipped`));
		});

	memory
		.command('verify')
		.description('Verify all vault entries are readable and report coverage')
		.action(async () => {
			const store = new VaultStore(vaultDir);
			let total = 0;
			let failures = 0;

			for (const category of ['episodic', 'semantic', 'decisions'] as const) {
				try {
					const entries = await store.getEntries(category);
					total += entries.length;
				} catch {
					failures++;
				}
			}

			if (failures > 0) {
				console.log(color.red(`Verify: ${failures} category read failures`));
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
		.action(async (options: PurgeOptions) => executePurge(options, color, vaultDir));
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

async function executePurge(options: PurgeOptions, color: ColorAdapter, vaultDir: string): Promise<void> {
	const { all, dryRun, olderThan, store, yes } = options;
	assertPurgeTarget(all, store, olderThan, color);
	const categories: MemoryCategory[] | undefined = store ? [store as MemoryCategory] : undefined;
	const olderThanMs = resolvePurgeDuration(olderThan, color);
	const manager = new MemoryManager(new VaultStore(vaultDir));

	if (dryRun) {
		const result = await manager.purge({ all, categories, dryRun: true, olderThanMs });
		console.log(color.cyan(`Dry run: would delete ${result.totalWouldDelete} entries`));
		return;
	}

	if (!yes && !(await confirmPurge(all, store, olderThan, color))) return;

	const result = await manager.purge({ all, categories, dryRun: false, olderThanMs });
	const auditEvent = createSecurityEvent('memory_purged', 'low', {
		all: all ?? false,
		categories: categories ?? ['episodic', 'semantic', 'decisions'],
		deletedCount: result.totalDeleted,
		olderThanMs: olderThanMs ?? null
	});
	console.log(color.gray(`[audit] memory_purged at ${auditEvent.timestamp.toISOString()}`));
	console.log(color.green(`Purged ${result.totalDeleted} entries`));
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

function resolvePurgeDuration(olderThan: string | undefined, color: ColorAdapter): number | undefined {
	if (!olderThan) return undefined;
	const ms = parseDuration(olderThan);
	if (ms === undefined) {
		console.error(color.red(`Error: cannot parse duration '${olderThan}'. Use format like 7d, 30d, 24h.`));
		process.exit(1);
	}
	return ms;
}
