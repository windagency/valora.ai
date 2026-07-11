/**
 * ConfigLoader — env-triggered defaults must not clobber unrelated fields.
 *
 * `loadDefaultsFromEnv` seeds `config.defaults` with `{ ...DEFAULT_CONFIG.defaults }`
 * whenever `VALORA_INTERACTIVE`/`AI_INTERACTIVE` or `VALORA_LOG_LEVEL`/`AI_LOG_LEVEL`
 * is set — but `DEFAULT_CONFIG.defaults` carries an explicit own-property
 * `default_provider: undefined`. Since `mergeSingleConfig` shallow-spreads
 * `{...result.defaults, ...config.defaults}`, that accidental own-property
 * silently overwrites whatever `default_provider` an earlier, trusted layer
 * (global config) had already set — the same class of bug round 13's
 * `stripUntrustedProviderOverrides` was written to avoid causing, just
 * triggered from a completely different, unrelated env var.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfigLoader } from './loader';

describe('ConfigLoader — env-defaults must not clobber an unrelated trusted default_provider', () => {
	let projectDir: string;
	let originalCwd: string;
	let savedGlobalConfigDir: string | undefined;
	let savedInteractive: string | undefined;

	beforeEach(() => {
		originalCwd = process.cwd();
		projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valora-env-defaults-clobber-'));
		process.chdir(projectDir);

		savedGlobalConfigDir = process.env['VALORA_GLOBAL_CONFIG_DIR'];
		const globalConfigDir = path.join(projectDir, '.global');
		fs.mkdirSync(globalConfigDir);
		process.env['VALORA_GLOBAL_CONFIG_DIR'] = globalConfigDir;
		fs.writeFileSync(
			path.join(globalConfigDir, 'config.json'),
			JSON.stringify({
				defaults: { default_provider: 'openai' },
				providers: { anthropic: { apiKey: 'sk-a' }, openai: { apiKey: 'sk-o' } }
			})
		);

		savedInteractive = process.env['VALORA_INTERACTIVE'];
		process.env['VALORA_INTERACTIVE'] = 'false';
	});

	afterEach(() => {
		process.chdir(originalCwd);
		fs.rmSync(projectDir, { force: true, recursive: true });
		if (savedGlobalConfigDir === undefined) delete process.env['VALORA_GLOBAL_CONFIG_DIR'];
		else process.env['VALORA_GLOBAL_CONFIG_DIR'] = savedGlobalConfigDir;
		if (savedInteractive === undefined) delete process.env['VALORA_INTERACTIVE'];
		else process.env['VALORA_INTERACTIVE'] = savedInteractive;
	});

	it("preserves a trusted global config's default_provider when an unrelated env var (VALORA_INTERACTIVE) is set", async () => {
		const loader = new ConfigLoader(path.join(projectDir, '.nonexistent-package-config.json'));

		const config = await loader.load();

		expect(config.defaults.default_provider).toBe('openai');
		expect(config.defaults.interactive).toBe(false); // the env var's own field still applies
	});
});
