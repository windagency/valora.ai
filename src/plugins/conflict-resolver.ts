import { ProviderConflictError } from 'llm/registry';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';

import {
	getResolvedConflict,
	preloadConflictResolutions as loadResolutions,
	saveResolvedConflict
} from './conflict-resolver-config';

export { preloadConflictResolutions } from './conflict-resolver-config';

export interface ConflictContext {
	existingOwner: string;
	incomingOwner: string;
	key: string;
}

export async function resolveProviderConflict(ctx: ConflictContext): Promise<string> {
	const { existingOwner, incomingOwner, key } = ctx;

	// Always check persisted resolutions first, before gating on TTY
	await loadResolutions();
	const cached = getResolvedConflict(key);
	if (cached !== undefined) {
		return cached;
	}

	if (!isInteractiveSession()) {
		throw new ProviderConflictError(key, existingOwner, incomingOwner);
	}

	const { winner } = await getPromptAdapter().prompt<{ winner: string }>([
		{
			choices: [
				{ name: `Keep "${existingOwner}" (currently registered)`, value: existingOwner },
				{ name: `Use "${incomingOwner}" (incoming plugin)`, value: incomingOwner }
			],
			message: `Provider key conflict: two plugins claim "${key}". Which should win?`,
			name: 'winner',
			type: 'list'
		}
	]);

	await saveResolvedConflict(key, winner);
	return winner;
}

function isInteractiveSession(): boolean {
	return (
		Boolean(process.stdout.isTTY) &&
		Boolean(process.stdin.isTTY) &&
		!process.env['CI'] &&
		process.env['VALORA_PLUGIN_CONFLICT'] !== 'error'
	);
}
