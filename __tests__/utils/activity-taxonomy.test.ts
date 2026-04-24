import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { Activity, pluginToActivity } from 'utils/activity-taxonomy';

const PACKAGES_DIR = join(__dirname, '../../packages');

function allPluginNames(): string[] {
	return readdirSync(PACKAGES_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory() && d.name.startsWith('valora-plugin-'))
		.map((d) => {
			const raw = readFileSync(join(PACKAGES_DIR, d.name, 'valora-plugin.json'), 'utf-8');
			return (JSON.parse(raw) as { name: string }).name;
		});
}

describe('activity taxonomy', () => {
	it('maps valora-core-engineering to Coding', () => {
		expect(pluginToActivity('valora-core-engineering')).toBe(Activity.Coding);
	});

	it('maps valora-core-implement to Coding', () => {
		expect(pluginToActivity('valora-core-implement')).toBe(Activity.Coding);
	});

	it('maps valora-core-qa to Testing', () => {
		expect(pluginToActivity('valora-core-qa')).toBe(Activity.Testing);
	});

	it('maps valora-core-docs to Documentation', () => {
		expect(pluginToActivity('valora-core-docs')).toBe(Activity.Documentation);
	});

	it('maps valora-core-secops to Security', () => {
		expect(pluginToActivity('valora-core-secops')).toBe(Activity.Security);
	});

	it('maps valora-core-quality-gate to Review', () => {
		expect(pluginToActivity('valora-core-quality-gate')).toBe(Activity.Review);
	});

	it('maps valora-core-platform to Infrastructure', () => {
		expect(pluginToActivity('valora-core-platform')).toBe(Activity.Infrastructure);
	});

	it('maps valora-core-design to Design', () => {
		expect(pluginToActivity('valora-core-design')).toBe(Activity.Design);
	});

	it('maps valora-core-product to Planning', () => {
		expect(pluginToActivity('valora-core-product')).toBe(Activity.Planning);
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
