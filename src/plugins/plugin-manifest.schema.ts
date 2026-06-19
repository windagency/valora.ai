import { z } from 'zod';

import { HOOKS_CONFIG_SCHEMA } from 'config/schema';

export const PLUGIN_MANIFEST_FILE = 'valora-plugin.json';
export const PLUGIN_HOOKS_FILE = 'hooks.json';
export const PLUGIN_MCPS_FILE = 'mcps.json';

/**
 * Plugin names must be lowercase kebab-case starting with an alphanumeric.
 * Enforced both at manifest validation time (Zod schema) and at every site that
 * uses the name as a path segment (path-join into install/staging/scope dirs).
 */
export const PLUGIN_NAME_REGEX = /^[a-z0-9][a-z0-9-]*$/;

export function assertValidPluginName(name: unknown): asserts name is string {
	if (typeof name !== 'string' || !PLUGIN_NAME_REGEX.test(name)) {
		throw new Error(
			`Invalid plugin name "${String(name)}". Plugin names must be lowercase kebab-case (matching ${PLUGIN_NAME_REGEX.source}).`
		);
	}
}

export const PLUGIN_CONTRIBUTION_TYPE_SCHEMA = z.enum([
	'agent-context',
	'agents',
	'code',
	'commands',
	'hooks',
	'mcps',
	'prompts',
	'templates',
	'validators'
]);

export const PLUGIN_PERMISSION_SCHEMA = z.enum([
	'code-exec',
	'fs-read',
	'fs-write',
	'mcp-connect',
	'network',
	'shell-hooks'
]);

export const PLUGIN_BINARY_REQUIREMENT_SCHEMA = z.object({
	autoInstall: z.boolean().optional(),
	checkCommand: z.string().optional(),
	install: z.string().optional(),
	installCommand: z.string().optional(),
	name: z.string().min(1),
	postInstallCommand: z.string().optional(),
	version: z.string().optional()
});

export const PLUGIN_CLI_ENTRY_SCHEMA = z.object({
	description: z.string(),
	name: z
		.string()
		.regex(/^[a-z][a-z0-9-]*( [a-z][a-z0-9-]*)?$/, 'CLI entry name must be one or two lowercase kebab-case words')
});

export const PLUGIN_MANIFEST_SCHEMA = z.object({
	cli: z.array(PLUGIN_CLI_ENTRY_SCHEMA).optional(),
	codeEntrypoint: z.string().optional(),
	contributes: z.array(PLUGIN_CONTRIBUTION_TYPE_SCHEMA).optional(),
	description: z.string().optional(),
	engines: z.object({ valora: z.string().optional() }).optional(),
	homepage: z.string().url().optional(),
	name: z.string().min(1).regex(PLUGIN_NAME_REGEX, 'Plugin name must be lowercase kebab-case'),
	overrides: z.array(z.string()).optional(),
	permissions: z.array(PLUGIN_PERMISSION_SCHEMA).optional(),
	requires: z.array(z.string()).optional(),
	requiresBinary: z.array(PLUGIN_BINARY_REQUIREMENT_SCHEMA).optional(),
	validators: z.array(z.object({ module: z.string().min(1), stage: z.string().min(1) })).optional(),
	version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must follow semver (major.minor.patch)')
});

export const PLUGIN_HOOKS_FILE_SCHEMA = z.object({ hooks: HOOKS_CONFIG_SCHEMA.optional() });
