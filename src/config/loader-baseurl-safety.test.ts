/**
 * ConfigLoader — provider baseUrl scheme/host safety.
 *
 * Once a provider `baseUrl` override clears round-13's workspace-trust gate
 * (or comes from an already-trusted global config, or an env var — none of
 * which is itself scheme/host-validated), nothing stopped it from pointing
 * at a cloud-metadata endpoint, a private/link-local address, or a non-http
 * scheme — and every provider sends the real API key as a plaintext
 * Authorization header to whatever `baseUrl` names. This must be checked
 * regardless of trust level: a trusted-but-compromised config, a malicious
 * plugin, or a misconfigured env var can all set `baseUrl` just as easily as
 * an untrusted project config can. `local`/`ollama` are exempted since their
 * whole purpose is talking to a local endpoint by default.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockIsWorkspaceTrusted = vi.fn(() => true);
vi.mock('security/workspace-trust.service', () => ({
	isWorkspaceTrusted: (...args: unknown[]) => mockIsWorkspaceTrusted(...args)
}));

import { ConfigLoader } from './loader';

describe('ConfigLoader — provider baseUrl scheme/host safety', () => {
	let projectDir: string;
	let originalCwd: string;
	let savedGlobalConfigDir: string | undefined;
	let savedLocalBaseUrl: string | undefined;

	beforeEach(() => {
		originalCwd = process.cwd();
		projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-baseurl-safety-'));
		fs.mkdirSync(path.join(projectDir, '.valora'));
		process.chdir(projectDir);

		savedGlobalConfigDir = process.env['VALORA_GLOBAL_CONFIG_DIR'];
		process.env['VALORA_GLOBAL_CONFIG_DIR'] = path.join(projectDir, '.nonexistent-global');

		// This devcontainer sets a real LOCAL_BASE_URL env var for normal
		// day-to-day use — the env layer is merged AFTER project config, so it
		// would otherwise silently override every "local" provider assertion
		// below regardless of what these tests write to project config.
		savedLocalBaseUrl = process.env['LOCAL_BASE_URL'];
		delete process.env['LOCAL_BASE_URL'];

		mockIsWorkspaceTrusted.mockReset();
		mockIsWorkspaceTrusted.mockReturnValue(true);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(projectDir, { force: true, recursive: true });
		if (savedGlobalConfigDir === undefined) delete process.env['VALORA_GLOBAL_CONFIG_DIR'];
		else process.env['VALORA_GLOBAL_CONFIG_DIR'] = savedGlobalConfigDir;
		if (savedLocalBaseUrl === undefined) delete process.env['LOCAL_BASE_URL'];
		else process.env['LOCAL_BASE_URL'] = savedLocalBaseUrl;
	});

	function writeProjectConfig(content: Record<string, unknown>): void {
		fs.writeFileSync(path.join(projectDir, '.valora', 'config.json'), JSON.stringify(content));
	}

	function makeLoader(): ConfigLoader {
		return new ConfigLoader(path.join(projectDir, '.nonexistent-package-config.json'));
	}

	it('strips a cloud-metadata-endpoint baseUrl even from a fully trusted config', async () => {
		writeProjectConfig({ providers: { xai: { baseUrl: 'http://169.254.169.254/latest/meta-data' } } });

		const config = await makeLoader().load();

		expect(config.providers['xai']?.baseUrl).toBeUndefined();
	});

	it('strips an IPv6 loopback baseUrl (e.g. targeting a locally-bound service) for a non-local provider', async () => {
		writeProjectConfig({ providers: { xai: { baseUrl: 'http://[::1]:6379/' } } });

		const config = await makeLoader().load();

		expect(config.providers['xai']?.baseUrl).toBeUndefined();
	});

	it('strips a private-network (RFC1918) baseUrl for a non-local provider', async () => {
		writeProjectConfig({ providers: { moonshot: { baseUrl: 'https://10.0.0.5/v1' } } });

		const config = await makeLoader().load();

		expect(config.providers['moonshot']?.baseUrl).toBeUndefined();
	});

	it('strips a file:// scheme baseUrl for any provider', async () => {
		writeProjectConfig({ providers: { xai: { baseUrl: 'file:///etc/passwd' } } });

		const config = await makeLoader().load();

		expect(config.providers['xai']?.baseUrl).toBeUndefined();
	});

	it('still allows a genuine internet-facing https baseUrl override', async () => {
		writeProjectConfig({ providers: { xai: { baseUrl: 'https://self-hosted-proxy.example.com/v1' } } });

		const config = await makeLoader().load();

		expect(config.providers['xai']?.baseUrl).toBe('https://self-hosted-proxy.example.com/v1');
	});

	it('still allows a localhost baseUrl for the local provider — its whole purpose is talking to a local endpoint', async () => {
		writeProjectConfig({ providers: { local: { baseUrl: 'http://localhost:11434/v1' } } });

		const config = await makeLoader().load();

		expect(config.providers['local']?.baseUrl).toBe('http://localhost:11434/v1');
	});

	it('still allows a localhost baseUrl for the ollama provider — same local-first exemption', async () => {
		writeProjectConfig({ providers: { ollama: { baseUrl: 'http://127.0.0.1:11434' } } });

		const config = await makeLoader().load();

		expect(config.providers['ollama']?.baseUrl).toBe('http://127.0.0.1:11434');
	});
});
