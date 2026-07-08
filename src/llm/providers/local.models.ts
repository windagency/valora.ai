/**
 * Local model catalog — single source of truth for the Local provider.
 * SDK-free: imports only from the types layer. See anthropic.models.ts for rationale.
 *
 * The Local provider targets any OpenAI-compatible server; model names are fully
 * dynamic (whatever the user has loaded), so only a representative default is listed.
 */

import type { ProviderDescriptor } from 'plugins/plugin-api.types';

const DEFAULT_LOCAL_MODEL = 'llama3.1';

export const LOCAL_DESCRIPTOR: ProviderDescriptor = {
	defaultModel: DEFAULT_LOCAL_MODEL,
	description: 'Local OpenAI-compatible model server',
	helpText: 'Connect to a local OpenAI-compatible server.',
	label: 'Local',
	modelModes: [{ mode: 'default', model: DEFAULT_LOCAL_MODEL }],
	requiresApiKey: false
};
