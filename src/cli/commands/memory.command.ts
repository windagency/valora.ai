import { migrateJsonToVault } from 'memory/migration/json-to-vault';
import { readVaultVersion } from 'memory/migration/vault-version';
import { VaultStore } from 'memory/vault/vault-store';

import type { CommandAdapter } from 'cli/command-adapter.interface';

import { getColorAdapter } from 'output/color-adapter.interface';

export interface MemoryCommandDirs {
	jsonDir: string;
	vaultDir: string;
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
}
