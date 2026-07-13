import { describe, expect, it } from 'vitest';

import { buildCorePluginsConfig } from './core-plugins.js';

describe('buildCorePluginsConfig', () => {
	it('enables backlink, file-explorer, graph, outgoing-link, search, and tag-pane', () => {
		expect(buildCorePluginsConfig()).toEqual({
			backlink: true,
			'file-explorer': true,
			graph: true,
			'outgoing-link': true,
			search: true,
			'tag-pane': true
		});
	});
});
