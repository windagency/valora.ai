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

		return (
			this.exceedsStageTokenLimit(estimate) ||
			this.exceedsPerCommandLimit(estimate) ||
			this.exceedsPerSessionLimit(sessionId, estimate)
		);
	}

	private exceedsPerCommandLimit(estimate: BudgetEstimate): boolean {
		const perCommandUsd = this.budgetConfig?.per_command_usd;
		if (perCommandUsd === undefined || estimate.estimatedCostUsd === undefined) return false;
		return estimate.estimatedCostUsd > perCommandUsd;
	}

	private exceedsPerSessionLimit(sessionId: string, estimate: BudgetEstimate): boolean {
		const perSessionUsd = this.budgetConfig?.per_session_usd;
		if (perSessionUsd === undefined || estimate.estimatedCostUsd === undefined) return false;
		const { totalCostUsd } = this.getSessionTotal(sessionId);
		return totalCostUsd + estimate.estimatedCostUsd > perSessionUsd;
	}

	private exceedsStageTokenLimit(estimate: BudgetEstimate): boolean {
		const perStageTokens = this.budgetConfig?.per_stage_tokens;
		if (perStageTokens === undefined || estimate.estimatedTokens === undefined) return false;
		return estimate.estimatedTokens > perStageTokens;
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
