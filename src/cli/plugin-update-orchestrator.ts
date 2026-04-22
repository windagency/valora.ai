import { PluginLoaderService } from 'plugins/plugin-loader.service';
import { fetchPluginRegistry } from 'plugins/plugin-registry.service';
import { diffPluginVersions, type OutdatedPlugin } from 'updater/plugin-compare';
import { fetchLatestVersionFor } from 'updater/registry';
import { readUpdateState, writeUpdateState } from 'updater/state';
import { shouldCheckNow } from 'updater/throttle';

import type { CataloguedPlugin } from 'types/plugin.types';

import { buildCatalogMap, isUpdatablePlugin, toInstalledPluginRef } from 'cli/plugin-catalogue-utils';

const TIMED_OUT = Symbol('timed-out');

interface PendingPluginContext {
	now: Date;
	promise: Promise<OutdatedPlugin[]>;
	stateDir: string;
}

let pending: null | PendingPluginContext = null;

interface SchedulePluginUpdateCheckDeps {
	loadPlugins?: () => CataloguedPlugin[];
	now?: Date;
}

export function resetPendingPluginUpdateCheck(): void {
	pending = null;
}

export function schedulePluginUpdateCheck(
	stateDir: string,
	userAgentVersion: string,
	frequencyDays: number,
	deps: SchedulePluginUpdateCheckDeps = {}
): void {
	if (pending !== null) return;
	const { loadPlugins = () => new PluginLoaderService().catalogAll(), now = new Date() } = deps;

	const promise: Promise<OutdatedPlugin[]> = (async () => {
		const state = await readUpdateState(stateDir);
		if (!shouldCheckNow(state, frequencyDays, now)) return [];

		const [catalog, installed] = await Promise.all([fetchPluginRegistry(), Promise.resolve(loadPlugins())]);

		const catalogMap = buildCatalogMap(catalog);
		const refs = installed.filter(isUpdatablePlugin).map(toInstalledPluginRef);

		const missingFromCatalog = refs.filter((r) => !catalogMap.has(r.name));
		const npmLatestMap = new Map<string, string>();

		if (missingFromCatalog.length > 0) {
			const results = await Promise.all(
				missingFromCatalog.map(async (r) => ({
					name: r.name,
					version: await fetchLatestVersionFor(r.packageName, userAgentVersion)
				}))
			);
			for (const { name, version } of results) {
				if (version !== null) npmLatestMap.set(name, version);
			}
		}

		return diffPluginVersions(refs, catalogMap, npmLatestMap);
	})().catch(() => []);

	pending = { now, promise, stateDir };
}

export async function settlePluginUpdateCheck(timeoutMs: number = 500): Promise<OutdatedPlugin[]> {
	const ctx = pending;
	if (!ctx) return [];
	pending = null;

	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<typeof TIMED_OUT>((resolve) => {
		timeoutId = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
	});

	const result = await Promise.race([ctx.promise, timeoutPromise]);
	clearTimeout(timeoutId);

	if (result === TIMED_OUT) return [];

	try {
		const state = await readUpdateState(ctx.stateDir);
		const now = ctx.now.toISOString();
		const updatedPlugins = result.reduce(
			(acc, plugin) => ({
				...acc,
				[plugin.name]: {
					latestVersion: plugin.latestVersion,
					latestVersionFetchedAt: now,
					remindedForVersion: state.plugins[plugin.name]?.remindedForVersion ?? null
				}
			}),
			{ ...state.plugins }
		);
		await writeUpdateState(ctx.stateDir, { ...state, plugins: updatedPlugins });
	} catch {
		// persistence failure is non-fatal
	}

	return result;
}
