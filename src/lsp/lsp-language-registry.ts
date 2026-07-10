/**
 * LSP Language Registry
 *
 * Maps file extensions to language server configurations.
 * Servers are configurable via .valora/lsp-servers.json — but that file is
 * project-declared, untrusted content (anyone who can get a victim to clone a
 * repo and run any `valora` command inside it controls it), and its
 * `command`/`args` are spawned verbatim the moment a matching file is
 * touched. Same root-cause class as `.valora/config.json`'s hooks field
 * (see `hook-execution.service.ts`) — reuse the same workspace-trust gate
 * rather than building a second trust mechanism.
 */

import { existsSync, readFileSync } from 'fs';
import { extname, join } from 'path';
import { isWorkspaceTrusted } from 'security/workspace-trust.service';

import { getLogger } from 'output/logger';

import type { LSPLanguage, LSPServerConfig } from './lsp.types';

/**
 * Default language server configurations
 */
const DEFAULT_SERVERS: Record<string, LSPServerConfig> = {
	gopls: {
		args: ['serve'],
		command: 'gopls',
		extensions: ['.go'],
		languages: ['go']
	},
	'pyright-langserver': {
		args: ['--stdio'],
		command: 'pyright-langserver',
		extensions: ['.py'],
		languages: ['python']
	},
	'rust-analyzer': {
		args: [],
		command: 'rust-analyzer',
		extensions: ['.rs'],
		languages: ['rust']
	},
	'typescript-language-server': {
		args: ['--stdio'],
		command: 'typescript-language-server',
		extensions: ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'],
		languages: ['typescript', 'javascript']
	}
};

/**
 * Extension-to-server mapping (built lazily)
 */
let extensionMap: Map<string, LSPServerConfig> | null = null;
let configuredServers: null | Record<string, LSPServerConfig> = null;
let hasWarnedUntrustedProjectLsp = false;

/**
 * Load server configurations, merging project-level overrides.
 *
 * Overrides are only merged once `projectRoot` has been explicitly trusted
 * (`valora config trust`, see `workspace-trust.service.ts`) — otherwise a
 * project's `.valora/lsp-servers.json` could redirect any file extension to
 * an arbitrary attacker-chosen binary with zero victim interaction beyond
 * touching a matching file.
 */
function loadServers(projectRoot?: string): Record<string, LSPServerConfig> {
	if (configuredServers) return configuredServers;

	configuredServers = { ...DEFAULT_SERVERS };

	// Try to load project-level overrides
	if (projectRoot) {
		const configPath = join(projectRoot, '.valora', 'lsp-servers.json');
		if (existsSync(configPath)) {
			if (isWorkspaceTrusted(projectRoot)) {
				try {
					const overrides = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, LSPServerConfig>;
					configuredServers = { ...configuredServers, ...overrides };
				} catch {
					// Invalid config — use defaults
				}
			} else if (!hasWarnedUntrustedProjectLsp) {
				hasWarnedUntrustedProjectLsp = true;
				getLogger().warn(
					`[Security] ${projectRoot}'s .valora/lsp-servers.json declares custom language servers, ` +
						`which would spawn an arbitrary attacker-chosen program the moment a matching file is touched. ` +
						`Skipping this override until this project is trusted — run 'valora config trust' if you trust ` +
						`this project's configuration.`,
					{ projectRoot }
				);
			}
		}
	}

	return configuredServers;
}

/**
 * Build the extension-to-server mapping
 */
function buildExtensionMap(projectRoot?: string): Map<string, LSPServerConfig> {
	if (extensionMap) return extensionMap;

	extensionMap = new Map();
	const servers = loadServers(projectRoot);

	for (const config of Object.values(servers)) {
		for (const ext of config.extensions) {
			extensionMap.set(ext, config);
		}
	}

	return extensionMap;
}

/**
 * Get the server configuration for a file
 */
export function getServerForFile(filePath: string, projectRoot?: string): LSPServerConfig | null {
	const ext = extname(filePath).toLowerCase();
	const map = buildExtensionMap(projectRoot);
	return map.get(ext) ?? null;
}

/**
 * Get the server configuration for a language
 */
export function getServerForLanguage(language: LSPLanguage, projectRoot?: string): LSPServerConfig | null {
	const servers = loadServers(projectRoot);
	return Object.values(servers).find((c) => c.languages.includes(language)) ?? null;
}

/**
 * Get all configured server configurations
 */
export function getAllServers(projectRoot?: string): Record<string, LSPServerConfig> {
	return loadServers(projectRoot);
}

/**
 * Reset cached configurations (for testing)
 */
export function resetLanguageRegistry(): void {
	extensionMap = null;
	configuredServers = null;
	hasWarnedUntrustedProjectLsp = false;
}
