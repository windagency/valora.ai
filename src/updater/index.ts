/**
 * Public barrel for the updater module.
 *
 * Exposes the fire-and-forget update-check orchestration (scheduleUpdateCheck,
 * settleUpdateCheck) plus the underlying building blocks.
 */

import { fetchLatestVersion } from './registry';
import { readUpdateState, writeUpdateState } from './state';
import { shouldCheckNow, type UpdateCheckState } from './throttle';

export { isNewerVersion } from './compare';
export { detectPackageManager, getInstallCommand, type PackageManager } from './detect-package-manager';
export { runAutoInstall } from './installer';
export { printUpdateBanner, shouldAutoUpdate, shouldShowReminder } from './notifier';
export { fetchLatestVersion } from './registry';
export { readUpdateState, writeUpdateState } from './state';
export { shouldCheckNow, type UpdateCheckState } from './throttle';

interface PendingContext {
	currentVersion: string;
	now: Date;
	promise: Promise<'__skipped__' | null | string>;
	stateDir: string;
	statePromise: Promise<UpdateCheckState>;
}

let pending: null | PendingContext = null;

/**
 * Schedule a background update check. Fire-and-forget — does not await.
 * No-ops when the throttle window has not elapsed.
 */
export function scheduleUpdateCheck(
	stateDir: string,
	currentVersion: string,
	frequencyDays: number,
	now: Date = new Date()
): void {
	const statePromise = readUpdateState(stateDir);
	const fetchPromise: Promise<'__skipped__' | null | string> = statePromise
		.then((state) => {
			if (!shouldCheckNow(state, frequencyDays, now)) return '__skipped__';
			return fetchLatestVersion(currentVersion);
		})
		.catch(() => null);

	// Store synchronously so settleUpdateCheck always sees it
	pending = {
		currentVersion,
		now,
		promise: fetchPromise,
		stateDir,
		statePromise
	};
}

/**
 * Await the pending update check with a short timeout.
 * Returns the updated UpdateCheckState if the fetch completed in time,
 * otherwise null.
 */
export async function settleUpdateCheck(timeoutMs: number = 200): Promise<null | UpdateCheckState> {
	const ctx = pending;
	if (!ctx) return null;
	pending = null;

	let timeoutId: ReturnType<typeof setTimeout>;
	const timeoutPromise = new Promise<'__timeout__'>((resolve) => {
		timeoutId = setTimeout(() => resolve('__timeout__'), timeoutMs);
	});

	const result = await Promise.race([ctx.promise, timeoutPromise]);
	clearTimeout(timeoutId!);
	if (result === '__timeout__' || result === '__skipped__') {
		return null;
	}

	// Await the state promise to get the resolved state
	let existingState: UpdateCheckState;
	try {
		existingState = await ctx.statePromise;
	} catch {
		// If state read failed, we cannot proceed
		return null;
	}

	const latestVersion = result;
	const nowIso = ctx.now.toISOString();
	const updated: UpdateCheckState = {
		...existingState,
		installedVersionAtCheck: ctx.currentVersion,
		lastCheckAt: nowIso,
		lastSuccessAt: latestVersion !== null ? nowIso : existingState.lastSuccessAt,
		latestVersion: latestVersion ?? existingState.latestVersion,
		latestVersionFetchedAt: latestVersion !== null ? nowIso : existingState.latestVersionFetchedAt
	};

	try {
		await writeUpdateState(ctx.stateDir, updated);
	} catch {
		// Persistence failure is non-fatal; callers just won't have the new state on disk.
	}

	return updated;
}
