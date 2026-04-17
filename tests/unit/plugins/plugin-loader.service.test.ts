import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginLoaderService } from 'plugins/plugin-loader.service';
import { PluginDiscoveryService } from 'plugins/plugin-discovery.service';

vi.mock('fs');

vi.mock('output/logger', () => ({
	getLogger: () => ({ debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() })
}));

const mockRegisterPluginDir = vi.fn();
vi.mock('utils/resource-resolver', () => ({
	getResourceResolver: () => ({ registerPluginDir: mockRegisterPluginDir })
}));

const fs = await import('fs');

const validManifest = JSON.stringify({
	name: 'my-plugin',
	version: '1.0.0',
	contributes: ['agents', 'hooks'],
	permissions: ['shell-hooks']
});

function makeDiscovery(dirs: string[] = ['/plugins/my-plugin']): PluginDiscoveryService {
	return { discoverPluginDirs: vi.fn().mockReturnValue(dirs) } as unknown as PluginDiscoveryService;
}

describe('PluginLoaderService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(fs.existsSync).mockReturnValue(false);
		vi.mocked(fs.readFileSync).mockReturnValue(validManifest);
	});

	it('loads a valid plugin manifest', async () => {
		const service = new PluginLoaderService(makeDiscovery());
		const result = service.loadAll();

		expect(result).toHaveLength(1);
		expect(result[0]?.manifest.name).toBe('my-plugin');
		expect(result[0]?.status).toBe('enabled');
	});

	it('registers plugin dir with ResourceResolver', async () => {
		const service = new PluginLoaderService(makeDiscovery());
		service.loadAll();

		expect(mockRegisterPluginDir).toHaveBeenCalledWith('/plugins/my-plugin');
	});

	it('skips plugins not in enabled list', async () => {
		const service = new PluginLoaderService(makeDiscovery());
		const result = service.loadAll({ enabled: ['other-plugin'] });

		expect(result).toHaveLength(0);
	});

	it('loads all discovered plugins when enabled list is absent', async () => {
		const service = new PluginLoaderService(makeDiscovery());
		const result = service.loadAll();

		expect(result).toHaveLength(1);
	});

	it('skips plugin with invalid manifest', async () => {
		vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: '', version: 'not-semver' }));

		const service = new PluginLoaderService(makeDiscovery());
		const result = service.loadAll();

		expect(result).toHaveLength(0);
	});

	it('skips plugin when manifest file cannot be read', async () => {
		vi.mocked(fs.readFileSync).mockImplementation(() => {
			throw new Error('ENOENT');
		});

		const service = new PluginLoaderService(makeDiscovery());
		const result = service.loadAll();

		expect(result).toHaveLength(0);
	});

	it('resolves agentsDir when plugin contributes agents and directory exists', async () => {
		vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('/agents'));

		const service = new PluginLoaderService(makeDiscovery());
		const result = service.loadAll();

		expect(result[0]?.agentsDir).toBe('/plugins/my-plugin/agents');
	});

	it('loads hooks from hooks.json when plugin contributes hooks', async () => {
		const hooksContent = JSON.stringify({
			hooks: { PreToolUse: [{ matcher: '^rtk$', hooks: [{ type: 'command', command: 'rtk' }] }] }
		});

		vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('hooks.json'));
		vi.mocked(fs.readFileSync).mockImplementation((p) => {
			if (String(p).endsWith('hooks.json')) return hooksContent;
			return validManifest;
		});

		const service = new PluginLoaderService(makeDiscovery());
		const result = service.loadAll();

		expect(result[0]?.hooks?.PreToolUse).toHaveLength(1);
	});

	it('rejects malformed hooks.json and loads plugin without hooks', () => {
		const malformedHooks = JSON.stringify({ hooks: { PreToolUse: 'not-an-array' } });

		vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('hooks.json'));
		vi.mocked(fs.readFileSync).mockImplementation((p) => {
			if (String(p).endsWith('hooks.json')) return malformedHooks;
			return validManifest;
		});

		const service = new PluginLoaderService(makeDiscovery());
		const result = service.loadAll();

		expect(result).toHaveLength(1);
		expect(result[0]?.hooks).toBeUndefined();
	});

	it('does not register hooks when plugin lacks shell-hooks permission', () => {
		const manifestNoPermission = JSON.stringify({
			name: 'my-plugin',
			version: '1.0.0',
			contributes: ['hooks']
			// no permissions field
		});

		vi.mocked(fs.existsSync).mockReturnValue(false);
		vi.mocked(fs.readFileSync).mockReturnValue(manifestNoPermission);

		const service = new PluginLoaderService(makeDiscovery());
		const result = service.loadAll();

		expect(result[0]?.hooks).toBeUndefined();
	});
});
