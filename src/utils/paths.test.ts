import * as path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { getSystemPluginsDir } from './paths';

describe('getSystemPluginsDir', () => {
	const originalPlatform = process.platform;

	afterEach(() => {
		delete process.env['VALORA_SYSTEM_PLUGINS_DIR'];
		Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform });
	});

	it('returns VALORA_SYSTEM_PLUGINS_DIR when set', () => {
		process.env['VALORA_SYSTEM_PLUGINS_DIR'] = '/custom/system/plugins';
		expect(getSystemPluginsDir()).toBe('/custom/system/plugins');
	});

	it('returns /usr/local/share/valora/plugins on linux', () => {
		Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' });
		expect(getSystemPluginsDir()).toBe('/usr/local/share/valora/plugins');
	});

	it('returns /usr/local/share/valora/plugins on darwin', () => {
		Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' });
		expect(getSystemPluginsDir()).toBe('/usr/local/share/valora/plugins');
	});

	it('returns PROGRAMDATA\\valora\\plugins on win32', () => {
		process.env['PROGRAMDATA'] = 'C:\\ProgramData';
		Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
		// path.join uses the host separator; compare with same join for cross-platform correctness
		expect(getSystemPluginsDir()).toBe(path.join('C:\\ProgramData', 'valora', 'plugins'));
	});

	it('falls back to C:\\ProgramData when PROGRAMDATA is unset on win32', () => {
		delete process.env['PROGRAMDATA'];
		Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
		expect(getSystemPluginsDir()).toContain('ProgramData');
		expect(getSystemPluginsDir()).toContain('valora');
		expect(getSystemPluginsDir()).toContain('plugins');
	});
});
