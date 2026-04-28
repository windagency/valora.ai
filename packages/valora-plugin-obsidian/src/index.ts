import type { PluginAPI } from 'plugins/plugin-api.types';

import { obsidianConfigSchema } from './config.schema.js';
import { openObsidian } from './obsidian-open.js';
import { resolveVaultDir, setupObsidianVault } from './obsidian-setup.js';

export function register(api: PluginAPI): void {
	const getConfig = api.config.extend(obsidianConfigSchema);

	api.lifecycle.onActivate(async () => {
		await setupObsidianVault(getConfig());
	});

	api.cli.addSubcommand(
		'obsidian open',
		'Sync Obsidian config and open the Valora memory vault in Obsidian',
		async () => {
			const config = getConfig();
			await setupObsidianVault(config);
			openObsidian(resolveVaultDir(config));
		}
	);
}
