import type { OutdatedPlugin } from 'updater/plugin-compare';
import type { UpdateCheckState } from 'updater/throttle';

import { getBoxFormatter } from 'output/box-formatter';

export function printUpdateBanner(
	state: UpdateCheckState,
	currentVersion: string,
	outdatedPlugins: OutdatedPlugin[] = []
): void {
	const hasCoreUpdate = state.latestVersion !== null;
	const hasPluginUpdates = outdatedPlugins.length > 0;

	if (!hasCoreUpdate && !hasPluginUpdates) return;

	const lines: string[] = [];

	if (hasCoreUpdate) {
		lines.push(`  ${currentVersion}  →  ${state.latestVersion}`);
		lines.push(`  Run: valora update`);
	}

	if (hasPluginUpdates) {
		if (hasCoreUpdate) lines.push('');
		lines.push('  Plugins:');
		for (const plugin of outdatedPlugins) {
			lines.push(`    ${plugin.name}  ${plugin.currentVersion}  →  ${plugin.latestVersion}`);
		}
		lines.push(`  Run: valora plugin update`);
	}

	lines.push(`  Disable: set autoUpdate.mode=disabled in ~/.valora/config.json`);

	const box = getBoxFormatter().formatBoxWithTitle('Update available', lines, { color: 'yellow', style: 'single' });
	process.stderr.write(`${box}\n`);
}
