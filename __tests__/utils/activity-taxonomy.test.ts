import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { Activity, pluginToActivity } from 'utils/activity-taxonomy';

const PACKAGES_DIR = join(__dirname, '../../packages');

function allPluginNames(): string[] {
	return readdirSync(PACKAGES_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory() && d.name.startsWith('valora-plugin-'))
		.map((d) => {
			try {
				const raw = readFileSync(join(PACKAGES_DIR, d.name, 'valora-plugin.json'), 'utf-8');
				return (JSON.parse(raw) as { name: string }).name;
			} catch {
				// Not every "valora-plugin-*" package directory is a loadable plugin — e.g.
				// valora-plugin-api is the shared SDK/types package, not a plugin instance,
				// and has no manifest. Production plugin discovery (plugin-loader.service.ts)
				// already skips unreadable/missing manifests the same way.
				return null;
			}
		})
		.filter((name): name is string => name !== null);
}

describe('activity taxonomy', () => {
	it('maps valora-plugin-engineering to Coding', () => {
		expect(pluginToActivity('valora-plugin-engineering')).toBe(Activity.Coding);
	});

	it('maps valora-plugin-implement to Coding', () => {
		expect(pluginToActivity('valora-plugin-implement')).toBe(Activity.Coding);
	});

	it('maps valora-plugin-qa to Testing', () => {
		expect(pluginToActivity('valora-plugin-qa')).toBe(Activity.Testing);
	});

	it('maps valora-plugin-docs to Documentation', () => {
		expect(pluginToActivity('valora-plugin-docs')).toBe(Activity.Documentation);
	});

	it('maps valora-plugin-secops to Security', () => {
		expect(pluginToActivity('valora-plugin-secops')).toBe(Activity.Security);
	});

	it('maps valora-plugin-quality-gate to Review', () => {
		expect(pluginToActivity('valora-plugin-quality-gate')).toBe(Activity.Review);
	});

	it('maps valora-plugin-platform to Infrastructure', () => {
		expect(pluginToActivity('valora-plugin-platform')).toBe(Activity.Infrastructure);
	});

	it('maps valora-plugin-design to Design', () => {
		expect(pluginToActivity('valora-plugin-design')).toBe(Activity.Design);
	});

	it('maps valora-plugin-product to Planning', () => {
		expect(pluginToActivity('valora-plugin-product')).toBe(Activity.Planning);
	});

	it('maps compression plugins to Optimisation', () => {
		expect(pluginToActivity('valora-plugin-compression-python')).toBe(Activity.Optimisation);
		expect(pluginToActivity('valora-plugin-compression-typescript')).toBe(Activity.Optimisation);
		expect(pluginToActivity('valora-plugin-compression-universal')).toBe(Activity.Optimisation);
	});

	it('maps provider adapter plugins to Platform', () => {
		expect(pluginToActivity('valora-plugin-ollama')).toBe(Activity.Platform);
		expect(pluginToActivity('valora-plugin-openrouter')).toBe(Activity.Platform);
		expect(pluginToActivity('valora-plugin-rtk')).toBe(Activity.Platform);
	});

	it('returns Other for an unknown plugin name', () => {
		expect(pluginToActivity('valora-plugin-unknown-future-thing')).toBe(Activity.Other);
	});

	it('returns Other when plugin name is undefined', () => {
		expect(pluginToActivity(undefined)).toBe(Activity.Other);
	});

	it('maps every installed plugin package to a non-Other activity where expected, and at minimum to a valid Activity', () => {
		const validActivities = new Set(Object.values(Activity));
		for (const name of allPluginNames()) {
			const activity = pluginToActivity(name);
			expect(validActivities.has(activity), `plugin "${name}" resolved to invalid activity "${String(activity)}"`).toBe(
				true
			);
		}
	});
});
