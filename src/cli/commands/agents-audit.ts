import { type AgentAuditReport, AgentRegistryService } from 'registry/agent-registry.service';

import type { CommandAdapter } from 'cli/command-adapter.interface';

import { AgentLoader } from 'executor/agent-loader';
import { getColorAdapter } from 'output/color-adapter.interface';

export function configureAgentsAuditCommand(program: CommandAdapter): void {
	const agents = program.command('agents').description('Manage and audit agent registry');

	agents
		.command('audit')
		.description('Audit agent ownership and expiry metadata')
		.option('--warning-days <days>', 'Days before expiry to warn (default: 30)', '30')
		.action(async (...rawArgs: Array<Record<string, unknown>>) => {
			const opts = rawArgs[rawArgs.length - 1] as { warningDays?: string };
			const warningDays = parseInt(opts.warningDays ?? '30', 10);

			const loader = new AgentLoader();
			const allAgents = await loader.loadAllAgents();
			const registry = new AgentRegistryService([...allAgents.values()]);
			const report = registry.audit({ warningDays });

			printAuditReport(report, registry, warningDays);

			if (registry.hasFailures(report)) {
				process.exit(1);
			}
		});
}

function printAuditReport(report: AgentAuditReport, registry: AgentRegistryService, warningDays: number): void {
	const color = getColorAdapter();

	if (report.unowned.length > 0) {
		console.log(color.bold('\nUnowned agents (missing owner field):'));
		for (const role of report.unowned) {
			console.log(`  ${color.yellow('!')} ${role}`);
		}
	}

	if (report.expired.length > 0) {
		console.log(color.bold('\nExpired agents (past expires date):'));
		for (const role of report.expired) {
			console.log(`  ${color.red('✗')} ${role}`);
		}
	}

	if (report.expiring_soon.length > 0) {
		console.log(color.bold(`\nExpiring soon (within ${warningDays} days):`));
		for (const role of report.expiring_soon) {
			console.log(`  ${color.yellow('⚠')} ${role}`);
		}
	}

	const isClean = registry.hasFailures(report) === false && report.expiring_soon.length === 0;
	if (isClean) {
		console.log(color.green('✓ All agents have valid ownership and expiry metadata'));
	} else {
		console.log('');
	}
}
