/**
 * Update reminder banner rendering.
 */

import { getBoxFormatter } from 'output/box-formatter';

import { isNewerVersion } from './compare';
import type { UpdateCheckState } from './throttle';

/**
 * Determines whether an update banner should be rendered for the given
 * state. Checks version comparison, dedupe (remindedForVersion), the
 * autoUpdate.mode, and whether stderr is a TTY.
 */
export function shouldShowReminder(
	state: UpdateCheckState,
	currentVersion: string,
	mode: 'auto' | 'disabled' | 'reminder'
): boolean {
	if (mode !== 'reminder') return false;
	if (state.latestVersion === null) return false;
	if (!isNewerVersion(currentVersion, state.latestVersion)) return false;
	if (state.remindedForVersion === state.latestVersion) return false;
	if (!process.stderr.isTTY) return false;
	return true;
}

/**
 * Prints an update banner to stderr. Does not mutate the provided state;
 * the caller is responsible for persisting `{ ...state, remindedForVersion: state.latestVersion }`
 * after calling this.
 */
export function printUpdateBanner(state: UpdateCheckState, currentVersion: string): void {
	if (state.latestVersion === null) return;

	const box = getBoxFormatter().formatBoxWithTitle(
		'Update available',
		[
			`  ${currentVersion}  \u2192  ${state.latestVersion}`,
			`  Run: valora update`,
			`  Disable: set autoUpdate.mode=disabled in ~/.valora/config.json`,
		],
		{ color: 'yellow', style: 'single' }
	);

	process.stderr.write(`${box}\n`);
}
