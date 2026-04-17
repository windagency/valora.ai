import { z } from 'zod';

import { HOOKS_CONFIG_SCHEMA } from 'config/schema';

export const PLUGIN_MANIFEST_FILE = 'valora-plugin.json';
export const PLUGIN_HOOKS_FILE = 'hooks.json';

export const PLUGIN_CONTRIBUTION_TYPE_SCHEMA = z.enum([
	'agent-context',
	'agents',
	'commands',
	'hooks',
	'mcps',
	'prompts',
	'templates'
]);

export const PLUGIN_PERMISSION_SCHEMA = z.enum(['fs-read', 'fs-write', 'mcp-connect', 'network', 'shell-hooks']);

export const PLUGIN_BINARY_REQUIREMENT_SCHEMA = z.object({
	install: z.string().optional(),
	name: z.string().min(1),
	version: z.string().optional()
});

export const PLUGIN_MANIFEST_SCHEMA = z.object({
	contributes: z.array(PLUGIN_CONTRIBUTION_TYPE_SCHEMA).optional(),
	description: z.string().optional(),
	engines: z.object({ valora: z.string().optional() }).optional(),
	homepage: z.string().url().optional(),
	name: z
		.string()
		.min(1)
		.regex(/^[a-z0-9][a-z0-9-]*$/, 'Plugin name must be lowercase kebab-case'),
	permissions: z.array(PLUGIN_PERMISSION_SCHEMA).optional(),
	requires: z.array(z.string()).optional(),
	requiresBinary: z.array(PLUGIN_BINARY_REQUIREMENT_SCHEMA).optional(),
	version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must follow semver (major.minor.patch)')
});

export const PLUGIN_HOOKS_FILE_SCHEMA = z.object({ hooks: HOOKS_CONFIG_SCHEMA.optional() });
