import type { EscalationSignal } from 'types/escalation.types';
import type { SpendingTracker } from 'utils/spending-tracker';

export interface BudgetConfig {
	per_command_usd?: number;
	per_session_usd?: number;
	per_stage_tokens?: number;
	policy: 'strict' | 'tolerant';
}

export interface BudgetEstimate {
	estimatedCostUsd?: number;
	estimatedTokens?: number;
}

export interface SessionTotal {
	totalCostUsd: number;
	totalTokens: number;
}

export class SessionBudgetService {
	constructor(
		private readonly tracker: Pick<SpendingTracker, 'getRecords'>,
		private readonly budgetConfig: BudgetConfig | undefined
	) {}

	buildBudgetEscalationSignal(spentUsd: number, limitUsd: number, stageName: string): EscalationSignal {
		return {
			confidence: 100,
			confidenceSource: 'defaulted',
			proposed_action: `Halt stage '${stageName}' — session budget exhausted (spent $${spentUsd.toFixed(4)} of $${limitUsd.toFixed(4)} limit)`,
			reasoning: 'The configured session budget has been reached. Human review is required before proceeding.',
			requires_escalation: true,
			risk_level: 'high',
			triggered_criteria: ['budget_exhausted']
		};
	}

	getSessionTotal(sessionId: string): SessionTotal {
		const records = this.tracker.getRecords().filter((r) => r.sessionId === sessionId);
		return records.reduce(
			(acc, r) => ({
				totalCostUsd: acc.totalCostUsd + r.costUsd,
				totalTokens: acc.totalTokens + r.totalTokens
			}),
			{ totalCostUsd: 0, totalTokens: 0 }
		);
	}

	wouldExceed(sessionId: string, estimate: BudgetEstimate): boolean {
		if (!this.budgetConfig) return false;

		const { per_session_usd: perSessionUsd, per_stage_tokens: perStageTokens } = this.budgetConfig;

		if (perStageTokens !== undefined && estimate.estimatedTokens !== undefined) {
			if (estimate.estimatedTokens > perStageTokens) return true;
		}

		if (perSessionUsd !== undefined && estimate.estimatedCostUsd !== undefined) {
			const { totalCostUsd } = this.getSessionTotal(sessionId);
			if (totalCostUsd + estimate.estimatedCostUsd > perSessionUsd) return true;
		}

		return false;
	}
}

let serviceInstance: null | SessionBudgetService = null;

export function getSessionBudgetService(
	tracker: Pick<SpendingTracker, 'getRecords'>,
	budgetConfig: BudgetConfig | undefined
): SessionBudgetService {
	serviceInstance ??= new SessionBudgetService(tracker, budgetConfig);
	return serviceInstance;
}

export function resetSessionBudgetService(): void {
	serviceInstance = null;
}
