import { describe, expect, it } from 'vitest';

import { buildWorkspaceConfig } from './workspace.js';

describe('buildWorkspaceConfig', () => {
	it('sets the main leaf active by default', () => {
		expect(buildWorkspaceConfig().active).toBe('main-leaf');
	});

	it('starts with no previously-open files', () => {
		expect(buildWorkspaceConfig().lastOpenFiles).toEqual([]);
	});

	it('places file-explorer and tag panes in the left, expanded sidebar', () => {
		const { left } = buildWorkspaceConfig() as {
			left: { children: Array<{ id: string; state: { type: string } }>; collapsed: boolean };
		};

		expect(left.collapsed).toBe(false);
		expect(left.children.map((c) => c.state.type)).toEqual(['file-explorer', 'tag']);
	});

	it('places a single empty leaf in the main split, matching the "active" leaf id', () => {
		const config = buildWorkspaceConfig() as {
			active: string;
			main: { children: Array<{ id: string; state: { type: string } }> };
		};

		expect(config.main.children).toHaveLength(1);
		expect(config.main.children[0]?.id).toBe(config.active);
		expect(config.main.children[0]?.state.type).toBe('empty');
	});

	it('places an expanded backlinks pane in the right sidebar', () => {
		const { right } = buildWorkspaceConfig() as {
			right: { children: Array<{ state: { type: string } }>; collapsed: boolean };
		};

		expect(right.collapsed).toBe(false);
		expect(right.children).toHaveLength(1);
		expect(right.children[0]?.state.type).toBe('backlink');
	});
});
