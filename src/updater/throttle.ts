/**
 * Throttle logic for the auto-update check.
 */

export interface PluginUpdateState {
	latestVersion: null | string;
	latestVersionFetchedAt: null | string;
	remindedForVersion: null | string;
}

export interface UpdateCheckState {
	installedVersionAtCheck: null | string;
	lastCheckAt: string;
	lastSuccessAt: null | string;
	latestVersion: null | string;
	latestVersionFetchedAt: null | string;
	plugins: Record<string, PluginUpdateState>;
	remindedForVersion: null | string;
	schemaVersion: 2;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Returns true when a new update check should run.
 *
 * - First run (lastCheckAt = epoch): yes
 * - lastCheckAt in the future (clock skew): yes
 * - lastCheckAt + frequencyDays <= now: yes
 * - Otherwise: no
 */
export function shouldCheckNow(state: UpdateCheckState, frequencyDays: number, now: Date): boolean {
	const lastMs = Date.parse(state.lastCheckAt);
	if (!Number.isFinite(lastMs)) return true;

	const nowMs = now.getTime();

	// Epoch means never checked
	if (lastMs === 0) return true;

	// Clock skew — force a recheck
	if (lastMs > nowMs) return true;

	const threshold = lastMs + frequencyDays * MS_PER_DAY;
	return threshold <= nowMs;
}
