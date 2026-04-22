import type { UpdateCheckState } from 'updater/throttle';

import { getBoxFormatter } from 'output/box-formatter';

export function printUpdateBanner(state: UpdateCheckState, currentVersion: string): void {
	if (state.latestVersion === null) return;

	const box = getBoxFormatter().formatBoxWithTitle(
		'Update available',
		[
			`  ${currentVersion}  →  ${state.latestVersion}`,
			`  Run: valora update`,
			`  Disable: set autoUpdate.mode=disabled in ~/.valora/config.json`
		],
		{ color: 'yellow', style: 'single' }
	);

	process.stderr.write(`${box}\n`);
}
