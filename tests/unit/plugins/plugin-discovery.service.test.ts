import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import { PluginDiscoveryService } from 'plugins/plugin-discovery.service';

vi.mock('fs');

vi.mock('output/logger', () => ({
	getLogger: () => ({ debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() })
}));

vi.mock('utils/paths', () => ({
	getPackagePluginsDir: () => '/pkg/plugins',
	getGlobalPluginsDir: () => '/home/user/.valora/plugins',
	getProjectPluginsDir: () => '/project/.valora/plugins'
}));

const fs = await import('fs');

describe('PluginDiscoveryService', () => {
	const mockExistsSync = vi.mocked(fs.existsSync);
	const mockReaddirSync = vi.mocked(fs.readdirSync);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns empty array when no plugin roots exist', async () => {
		mockExistsSync.mockReturnValue(false);
		const service = new PluginDiscoveryService();
		const result = service.discoverPluginDirs();
		expect(result).toEqual([]);
	});

	it('discovers plugins in existing roots', async () => {
		mockExistsSync.mockImplementation((p) => {
			const s = String(p);
			if (s === '/project/.valora/plugins') return false;
			return true; // all others exist (roots + manifest files)
		});

		mockReaddirSync.mockImplementation((dir) => {
			if (String(dir) === '/pkg/plugins') return [{ name: 'rtk', isDirectory: () => true }] as unknown as fs.Dirent[];
			if (String(dir) === '/home/user/.valora/plugins')
				return [{ name: 'my-agents', isDirectory: () => true }] as unknown as fs.Dirent[];
			return [] as unknown as fs.Dirent[];
		});

		const service = new PluginDiscoveryService();
		const result = service.discoverPluginDirs();

		expect(result).toContain(path.join('/pkg/plugins', 'rtk'));
		expect(result).toContain(path.join('/home/user/.valora/plugins', 'my-agents'));
		expect(result).toHaveLength(2);
	});

	it('skips non-directory entries inside plugin roots', async () => {
		mockExistsSync.mockImplementation((p) => String(p) !== '/project/.valora/plugins');

		mockReaddirSync.mockImplementation((dir) => {
			if (String(dir) === '/pkg/plugins')
				return [
					{ name: 'plugin-a', isDirectory: () => true },
					{ name: 'README.md', isDirectory: () => false }
				] as unknown as fs.Dirent[];
			return [] as unknown as fs.Dirent[];
		});

		const service = new PluginDiscoveryService();
		const result = service.discoverPluginDirs();

		expect(result).not.toContain(path.join('/pkg/plugins', 'README.md'));
	});

	it('handles unreadable root directory gracefully', async () => {
		mockExistsSync.mockReturnValue(true);
		mockReaddirSync.mockImplementation(() => {
			throw new Error('EACCES: permission denied');
		});

		const service = new PluginDiscoveryService();
		const result = service.discoverPluginDirs();
		expect(result).toEqual([]);
	});

	it('excludes directories that lack a valora-plugin.json manifest', () => {
		mockExistsSync.mockImplementation((p) => {
			// Only the root dir exists; no manifest file inside any subdirectory
			return String(p) === '/pkg/plugins';
		});
		mockReaddirSync.mockReturnValue([
			{ name: 'no-manifest-plugin', isDirectory: () => true }
		] as unknown as fs.Dirent[]);

		const service = new PluginDiscoveryService();
		expect(service.discoverPluginDirs()).toHaveLength(0);
	});
});
