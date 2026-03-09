#!/usr/bin/env node
/**
 * Valora postinstall — embeds required CLI tools into the package installation.
 *
 * Runs automatically after `pnpm add -g @windagency/valora` (or npm/yarn).
 * Installs pinned versions of jq, yq, rg, fd, fzf, lazygit, zoxide, eza into
 * the package's own vendor/bin directory so valora never relies on the system
 * having these tools pre-installed.
 *
 * Skipped when:
 *   - Not a global install (CI, local dependency installs, dev workspace)
 *   - CI environment variable is set
 *   - SKIP_POSTINSTALL environment variable is set
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..');
const vendorBin = join(packageRoot, 'vendor', 'bin');
const installScript = join(__dirname, 'install-cli-tools.sh');

// Skip in CI environments
if (process.env.CI) {
	console.log('[valora] Skipping CLI tools installation (CI environment)');
	process.exit(0);
}

// Skip if explicitly disabled
if (process.env.SKIP_POSTINSTALL) {
	console.log('[valora] Skipping CLI tools installation (SKIP_POSTINSTALL set)');
	process.exit(0);
}

// Only run for global installs — not when valora is a local dependency or
// when developers run `pnpm install` inside the source repository.
if (process.env.npm_config_global !== 'true') {
	process.exit(0);
}

if (!existsSync(installScript)) {
	console.warn('[valora] CLI tools install script not found, skipping');
	process.exit(0);
}

mkdirSync(vendorBin, { recursive: true });

console.log(`[valora] Installing bundled CLI tools into ${vendorBin} ...`);
try {
	execSync(`bash "${installScript}" --all`, {
		env: { ...process.env, INSTALL_DIR: vendorBin },
		stdio: 'inherit'
	});
	console.log('[valora] CLI tools installed successfully.');
} catch {
	console.warn(
		'[valora] Warning: some CLI tools could not be installed. ' +
			'Valora will fall back to system tools or built-in equivalents.'
	);
}
