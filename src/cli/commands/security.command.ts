import fs from 'node:fs/promises';
import { getSecurityAuditExporter } from 'security/audit-exporter';

import type { CommandAdapter } from 'cli/command-adapter.interface';

import { getColorAdapter } from 'output/color-adapter.interface';
import { InputValidator } from 'utils/input-validator';

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
				// --out previously wrote with zero path validation — an agent
				// that can run this command could clobber vault-signing.key/
				// trusted-workspaces.json/mcp-baselines.json/security-audit.jsonl
				// themselves, the exact files this security infrastructure is
				// meant to protect from tampering.
				let validatedPath: string;
				try {
					validatedPath = InputValidator.validatePath(options.out, process.cwd());
				} catch (error) {
					console.error(color.red('Invalid --out path:'), (error as Error).message);
					process.exit(1);
					return;
				}
				await fs.writeFile(validatedPath, json, 'utf-8');
				console.log(color.green(`Security audit exported to ${validatedPath} (${report.totalEvents} events)`));
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
