/**
 * Doctor command for system diagnostics
 */

import type { CommandAdapter } from 'cli/command-adapter.interface';

import * as fs from 'fs';
import { getColorAdapter } from 'output/color-adapter.interface';
import { getDiagnosticFormatter } from 'output/diagnostic-formatter';
import { DiagnosticsService } from 'services/diagnostics.service';
import { formatErrorMessage } from 'utils/error-utils';
import { writeFile } from 'utils/file-utils';
import { getGlobalConfigDir, getPackageDataDir, getPackageRoot, getProjectConfigDir } from 'utils/paths';
import { getResourceResolver } from 'utils/resource-resolver';

/**
 * CLI options for doctor command
 */
interface DoctorOptions extends Record<string, unknown> {
	export?: string;
	fix?: boolean;
}

/**
 * Configure doctor command
 */
export function configureDoctorCommand(program: CommandAdapter): void {
	program
		.command('doctor')
		.description('Run diagnostic checks on the system')
		.option('--fix', 'Attempt to auto-fix issues')
		.option('--export <path>', 'Export diagnostics report to file')
		.action(async (options: DoctorOptions) => {
			const color = getColorAdapter();
			try {
				const diagnostics = new DiagnosticsService();
				const formatter = getDiagnosticFormatter();

				// Run all checks
				const checkNames = [
					'Configuration file',
					'Provider setup',
					'API keys',
					'Config validation',
					'Environment vars'
				];

				const results = await diagnostics.runAllChecks();

				// Pair results with names
				const pairedResults = results.map((result, index) => ({
					name: checkNames[index] ?? `Check ${index + 1}`,
					result
				}));

				// Display report

				console.log(formatter.formatReport(pairedResults));

				// Display installation info
				const packageRoot = getPackageRoot();
				const dataDir = getPackageDataDir();
				const projectDir = getProjectConfigDir();
				const globalDir = getGlobalConfigDir();

				console.log(color.cyan('\nInstallation:'));
				console.log(`  Package root:     ${packageRoot}`);
				console.log(
					`  Data directory:    ${dataDir} ${fs.existsSync(dataDir) ? color.green('[OK]') : color.red('[MISSING]')}`
				);
				console.log(
					`  Global config:     ${globalDir} ${fs.existsSync(globalDir) ? color.green('[OK]') : color.gray('[not created]')}`
				);
				console.log(`  Project config:    ${projectDir ?? color.gray('(none)')}`);

				// Show resource override report
				const resolver = getResourceResolver();
				const resourceTypes = ['agents', 'commands', 'prompts', 'templates'] as const;
				const overrides = resourceTypes.flatMap((type) =>
					resolver
						.listResources(type)
						.filter((r) => r.source === 'project')
						.map((r) => `${type}/${r.name}`)
				);

				if (overrides.length > 0) {
					console.log(color.cyan('\nProject overrides:'));
					overrides.forEach((o) => console.log(`  ${o}`));
				}

				console.log();

				// Auto-fix if requested
				if (options.fix) {
					console.log(color.cyan('\nAttempting to auto-fix issues...\n'));

					const fixResults = pairedResults;
					pairedResults
						.filter(({ result }) => result.autoFixable)
						.map(({ name, result }) => {
							const fixed = diagnostics.autoFix(result);
							if (fixed) {
								console.log(color.green(`  Fixed: ${name}`));
							}
							return fixed;
						});

					const fixedCount = fixResults.filter(Boolean).length;

					if (fixedCount === 0) {
						console.log(color.yellow('  No issues were auto-fixable. Manual intervention required.'));
					} else {
						console.log(color.green(`\n  Fixed ${fixedCount} issue(s)`));
					}

					console.log();
				}

				// Export if requested
				if (options.export) {
					const exportPath = options.export;
					const jsonReport = formatter.exportToJSON(pairedResults);
					await writeFile(exportPath, jsonReport);

					console.log(color.gray(`\n  Report exported to: ${exportPath}\n`));
				}

				// Exit with appropriate code
				const hasErrors = pairedResults.some((r) => r.result.status === 'fail');
				process.exit(hasErrors ? 1 : 0);
			} catch (error) {
				console.error(color.red('\nDiagnostic check failed:'), formatErrorMessage(error));
				process.exit(1);
			}
		});
}
