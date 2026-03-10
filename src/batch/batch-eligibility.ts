/**
 * Batch eligibility checks
 *
 * A stage is batch-eligible when all three conditions hold:
 * 1. stage.batch === true  (explicit opt-in)
 * 2. --batch flag is set   (user intent)
 * 3. provider.isBatchableProvider() (provider capability)
 */

import type { ExecutionContext } from 'executor/execution-context';
import type { PipelineStage } from 'types/command.types';
import type { LLMProvider } from 'types/llm.types';

import { isBatchableProvider } from './batch-provider.interface';

export interface EligibilityResult {
	eligible: boolean;
	reason?: string;
}

export function isEligible(
	stage: PipelineStage,
	executionContext: ExecutionContext,
	provider: LLMProvider
): EligibilityResult {
	if (!stage.batch) {
		return { eligible: false, reason: 'stage does not have batch: true' };
	}

	if (!executionContext.flags['batch']) {
		return { eligible: false, reason: '--batch flag not set' };
	}

	if (!isBatchableProvider(provider)) {
		return { eligible: false, reason: `provider "${provider.name}" does not support batch API` };
	}

	return { eligible: true };
}
