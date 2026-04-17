import type { HooksConfig } from './hook.types';

export interface LoadedPlugin {
	agentsDir?: string;
	commandsDir?: string;
	hooks?: HooksConfig;
	manifest: PluginManifest;
	pluginDir: string;
	promptsDir?: string;
	status: PluginStatus;
	templatesDir?: string;
}

export interface PluginBinaryRequirement {
	install?: string;
	name: string;
	version?: string;
}

export type PluginContributionType =
	| 'agent-context'
	| 'agents'
	| 'commands'
	| 'hooks'
	| 'mcps'
	| 'prompts'
	| 'templates';

export interface PluginManifest {
	contributes?: PluginContributionType[];
	description?: string;
	engines?: { valora?: string };
	homepage?: string;
	name: string;
	permissions?: PluginPermission[];
	requires?: string[];
	requiresBinary?: PluginBinaryRequirement[];
	version: string;
}

export type PluginPermission = 'fs-read' | 'fs-write' | 'mcp-connect' | 'network' | 'shell-hooks';

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
