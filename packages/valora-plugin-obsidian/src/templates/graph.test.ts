import { describe, expect, it } from 'vitest';

import { buildGraphConfig, hexToRgb } from './graph.js';

describe('hexToRgb', () => {
	it('converts #4c9be8 to { r: 76, g: 155, b: 232 }', () => {
		expect(hexToRgb('#4c9be8')).toEqual({ r: 76, g: 155, b: 232 });
	});

	it('converts #059669 to { r: 5, g: 150, b: 105 }', () => {
		expect(hexToRgb('#059669')).toEqual({ r: 5, g: 150, b: 105 });
	});
});

describe('buildGraphConfig', () => {
	const colors = { decisions: '#059669', episodic: '#4c9be8', semantic: '#7c3aed' };

	it('produces three colorGroups matching each category path', () => {
		const config = buildGraphConfig(colors);
		const queries = config.colorGroups.map((g) => g.query);
		expect(queries).toContain('path:episodic');
		expect(queries).toContain('path:semantic');
		expect(queries).toContain('path:decisions');
	});

	it('maps episodic hex colour to the correct RGB node', () => {
		const config = buildGraphConfig(colors);
		const episodic = config.colorGroups.find((g) => g.query === 'path:episodic');
		expect(episodic?.color).toEqual({ r: 76, g: 155, b: 232 });
	});

	it('enables showTags and disables showAttachments', () => {
		const config = buildGraphConfig(colors);
		expect(config.showTags).toBe(true);
		expect(config.showAttachments).toBe(false);
	});
});
