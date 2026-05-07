import type { HooksConfig } from './hook.types';

export interface CataloguedPlugin {
	dir: string;
	location: PluginLocation;
	manifest: null | PluginManifest;
	status: 'disabled' | 'enabled' | 'invalid';
	validationErrors?: string[];
}

export interface LoadedPlugin {
	agentsDir?: string;
	codeEntrypoint?: string;
	commandsDir?: string;
	hooks?: HooksConfig;
	location: PluginLocation;
	manifest: PluginManifest;
	mcpsFile?: string;
	pluginDir: string;
	promptsDir?: string;
	status: PluginStatus;
	templatesDir?: string;
	/**
	 * Permissions declared in the manifest that the runtime does not (yet) enforce.
	 * Surfaced for `valora doctor` so users can see what their plugin manifest claims
	 * versus what the host actually gates. Currently always a subset of
	 * { 'fs-read', 'fs-write', 'network' }.
	 */
	unenforcedPermissions?: PluginPermission[];
	validatorModules?: Array<{ modulePath: string; stage: string }>;
}

export type PluginAutoUpdateMode = 'check-only' | 'install' | 'prompt';

export interface PluginBinaryRequirement {
	autoInstall?: boolean;
	checkCommand?: string;
	install?: string;
	installCommand?: string;
	name: string;
	postInstallCommand?: string;
	version?: string;
}

export type PluginContributionType =
	| 'agent-context'
	| 'agents'
	| 'code'
	| 'commands'
	| 'hooks'
	| 'mcps'
	| 'prompts'
	| 'templates'
	| 'validators';

export type PluginLocation = 'built-in' | 'global' | 'npm' | 'project' | 'user';

export interface PluginManifest {
	cli?: Array<{ description: string; name: string }>;
	codeEntrypoint?: string;
	contributes?: PluginContributionType[];
	description?: string;
	engines?: { valora?: string };
	homepage?: string;
	name: string;
	overrides?: string[];
	permissions?: PluginPermission[];
	requires?: string[];
	requiresBinary?: PluginBinaryRequirement[];
	validators?: Array<{ module: string; stage: string }>;
	version: string;
}

export type PluginPermission = 'code-exec' | 'fs-read' | 'fs-write' | 'mcp-connect' | 'network' | 'shell-hooks';

/**
 * A single entry in the resolved plugin update catalogue: the version a plugin
 * should be moved to, plus the optional sha256 SRI integrity to verify the
 * downloaded tarball against. Lives in `types/` so both `cli/plugin-catalogue-utils`
 * and `updater/plugin-compare` can consume it without forming a layer cycle.
 */
export interface CatalogEntry {
	integrity?: string;
	version: string;
}

export interface PluginsConfig {
	autoUpdate?: PluginAutoUpdateMode;
	enabled?: string[];
	sources?: PluginSource[];
}

export interface PluginSource {
	path?: string;
	scope?: string;
	type: PluginSourceType;
	url?: string;
}

export type PluginSourceType = 'git' | 'local' | 'npm';

export type PluginStatus = 'disabled' | 'enabled' | 'error' | 'loading';
