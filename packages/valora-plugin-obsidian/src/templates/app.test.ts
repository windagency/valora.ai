import { describe, expect, it } from 'vitest';

import { buildAppConfig } from './app.js';

describe('buildAppConfig', () => {
	it('disables the legacy editor and line numbers, and enables live preview', () => {
		expect(buildAppConfig()).toEqual({
			legacyEditor: false,
			livePreview: true,
			showLineNumber: false
		});
	});
});
