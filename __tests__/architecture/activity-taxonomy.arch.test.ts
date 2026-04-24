import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { Activity, pluginToActivity } from 'utils/activity-taxonomy';

const PACKAGES_DIR = join(__dirname, '../../packages');

describe('activity taxonomy architecture', () => {
	it('every valora-plugin-* package maps to a known (non-Other) activity', () => {
		const violations: string[] = [];

		const dirs = readdirSync(PACKAGES_DIR, { withFileTypes: true }).filter(
			(d) => d.isDirectory() && d.name.startsWith('valora-plugin-')
		);

		for (const dir of dirs) {
			const manifestPath = join(PACKAGES_DIR, dir.name, 'valora-plugin.json');
			const raw = readFileSync(manifestPath, 'utf-8');
			const name = (JSON.parse(raw) as { name: string }).name;
			const activity = pluginToActivity(name);
			if (activity === Activity.Other) {
				violations.push(
					`${dir.name} (manifest name: "${name}") has no activity mapping — add it to PLUGIN_ACTIVITY_MAP in src/utils/activity-taxonomy.ts`
				);
			}
		}

		expect(violations, violations.join('\n')).toHaveLength(0);
	});
});
