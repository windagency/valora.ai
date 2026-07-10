import fs from 'node:fs/promises';
import { getSecurityAuditExporter } from 'security/audit-exporter';

import type { CommandAdapter } from 'cli/command-adapter.interface';

import { getColorAdapter } from 'output/color-adapter.interface';

export function configureSecurityCommand(program: CommandAdapter): void {
	const color = getColorAdapter();
	const security = program.command('security').description('Security audit and reporting commands');

	security
		.command('audit-export')
		.description('Export a snapshot of all security events to JSON')
		.option('--out <path>', 'Output file path (default: stdout)')
		.action(async (options: { out?: string }) => {
			const exporter = getSecurityAuditExporter();
			const report = exporter();
			const json = JSON.stringify(report, null, 2);

			if (options.out) {
				await fs.writeFile(options.out, json, 'utf-8');
				console.log(color.green(`Security audit exported to ${options.out} (${report.totalEvents} events)`));
			} else {
				console.log(json);
			}

			if (!report.chainVerified) {
				console.log(
					color.red(
						'WARNING: audit log hash chain verification failed — a prior entry may have been deleted, reordered, or edited.'
					)
				);
			}
		});
}
