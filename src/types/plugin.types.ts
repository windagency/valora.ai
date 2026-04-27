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
}

export interface PluginBinaryRequirement {
	autoInstall?: boolean;
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
	| 'templates';

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
	version: string;
}

export type PluginPermission = 'code-exec' | 'fs-read' | 'fs-write' | 'mcp-connect' | 'network' | 'shell-hooks';

export interface PluginsConfig {
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
