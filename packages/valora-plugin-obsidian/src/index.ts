import type { PluginAPI } from 'plugins/plugin-api.types';

import { type ObsidianConfig, obsidianConfigSchema } from './config.schema.js';
import { openObsidian } from './obsidian-open.js';
import { resolveVaultDir, setupObsidianVault } from './obsidian-setup.js';

export function register(api: PluginAPI): void {
	api.config.extend(obsidianConfigSchema);

	// TODO: read live user config once api.config.extend is implemented (currently a stub)
	const config: ObsidianConfig = obsidianConfigSchema.parse({});

	api.lifecycle.onActivate(async () => {
		await setupObsidianVault(config);
	});

	api.cli.addSubcommand(
		'obsidian open',
		'Sync Obsidian config and open the Valora memory vault in Obsidian',
		async () => {
			await setupObsidianVault(config);
			openObsidian(resolveVaultDir(config));
		}
	);
}
