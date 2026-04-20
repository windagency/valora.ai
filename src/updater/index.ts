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
export {
	detectPackageManager,
	getInstallCommand,
	type PackageManager,
} from './detect-package-manager';
export { printUpdateBanner, shouldShowReminder } from './notifier';
export { fetchLatestVersion } from './registry';
export { readUpdateState, writeUpdateState } from './state';
export { shouldCheckNow, type UpdateCheckState } from './throttle';

interface PendingContext {
	promise: Promise<string | null>;
	stateDir: string;
	currentVersion: string;
	existingState: UpdateCheckState;
	now: Date;
}

let pending: PendingContext | null = null;

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
	// Kick off async work without awaiting.
	void (async () => {
		try {
			const state = await readUpdateState(stateDir);
			if (!shouldCheckNow(state, frequencyDays, now)) {
				return;
			}
			const promise = fetchLatestVersion(currentVersion);
			pending = {
				promise,
				stateDir,
				currentVersion,
				existingState: state,
				now,
			};
		} catch {
			// Never let the background work throw.
		}
	})();
}

/**
 * Await the pending update check with a short timeout.
 * Returns the updated UpdateCheckState if the fetch completed in time,
 * otherwise null.
 */
export async function settleUpdateCheck(timeoutMs: number = 200): Promise<UpdateCheckState | null> {
	const ctx = pending;
	if (!ctx) return null;
	pending = null;

	const timeoutPromise = new Promise<'__timeout__'>((resolve) => {
		setTimeout(() => resolve('__timeout__'), timeoutMs);
	});

	const result = await Promise.race([ctx.promise, timeoutPromise]);
	if (result === '__timeout__') {
		return null;
	}

	const latestVersion = result;
	const nowIso = ctx.now.toISOString();
	const updated: UpdateCheckState = {
		...ctx.existingState,
		lastCheckAt: nowIso,
		lastSuccessAt: latestVersion !== null ? nowIso : ctx.existingState.lastSuccessAt,
		latestVersion: latestVersion ?? ctx.existingState.latestVersion,
		latestVersionFetchedAt: latestVersion !== null ? nowIso : ctx.existingState.latestVersionFetchedAt,
		installedVersionAtCheck: ctx.currentVersion,
	};

	try {
		await writeUpdateState(ctx.stateDir, updated);
	} catch {
		// Persistence failure is non-fatal; callers just won't have the new state on disk.
	}

	return updated;
}
