import type { UpdateCheckState } from './throttle';

import { isNewerVersion } from './compare';

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
	// Only 'reminder' mode shows a banner. 'auto' returns false so the caller's
	// else-if branch can route to handleAutoInstall instead.
	if (mode !== 'reminder') return false;
	if (state.latestVersion === null) return false;
	if (!isNewerVersion(currentVersion, state.latestVersion)) return false;
	if (state.remindedForVersion === state.latestVersion) return false;
	if (!process.stderr.isTTY) return false;
	return true;
}

/**
 * Returns true when auto-install should run: a newer version is known.
 * Mode and TTY checks are the caller's responsibility.
 */
export function shouldAutoUpdate(state: UpdateCheckState, currentVersion: string): boolean {
	if (state.latestVersion === null) return false;
	return isNewerVersion(currentVersion, state.latestVersion);
}
