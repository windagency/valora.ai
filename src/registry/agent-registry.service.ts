import type { AgentDefinition } from 'types/agent.types';

export interface AgentAuditReport {
	expired: string[];
	expiring_soon: string[];
	unowned: string[];
}

export interface AuditOptions {
	warningDays?: number;
}

export class AgentRegistryService {
	private readonly agents: AgentDefinition[];

	constructor(agents: AgentDefinition[]) {
		this.agents = agents;
	}

	audit(options: AuditOptions = {}): AgentAuditReport {
		const warningDays = options.warningDays ?? 30;
		const now = Date.now();
		const warnMs = warningDays * 24 * 60 * 60 * 1000;

		const unowned: string[] = [];
		const expired: string[] = [];
		const expiringSoon: string[] = [];

		for (const agent of this.agents) {
			if (!agent.owner) {
				unowned.push(agent.role);
			}

			if (agent.expires) {
				const expiresMs = new Date(agent.expires).getTime();
				if (expiresMs < now) {
					expired.push(agent.role);
				} else if (expiresMs - now <= warnMs) {
					expiringSoon.push(agent.role);
				}
			}
		}

		return { expired, expiring_soon: expiringSoon, unowned };
	}

	hasFailures(report: AgentAuditReport): boolean {
		return report.expired.length > 0 || report.unowned.length > 0;
	}
}
