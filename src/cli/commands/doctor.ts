/**
 * Doctor command for system diagnostics
 */

import * as fs from 'fs';

import type { CommandAdapter } from 'cli/command-adapter.interface';
import type { LoadedPlugin } from 'types/plugin.types';

import { getLoadedPlugins } from 'di/container';
import { type ColorAdapter, getColorAdapter } from 'output/color-adapter.interface';
import { getDiagnosticFormatter } from 'output/diagnostic-formatter';
import { DiagnosticsService } from 'services/diagnostics.service';
import { formatErrorMessage } from 'utils/error-utils';
import { writeFile } from 'utils/file-utils';
import { getGlobalConfigDir, getPackageDataDir, getPackageRoot, getProjectConfigDir } from 'utils/paths';
import { getResourceResolver } from 'utils/resource-resolver';

interface DoctorOptions extends Record<string, unknown> {
	export?: string;
	fix?: boolean;
}

interface PairedResult {
	name: string;
	result: Awaited<ReturnType<DiagnosticsService['runAllChecks']>>[number];
}

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

				const checkNames = [
					'Configuration file',
					'Provider setup',
					'API keys',
					'Config validation',
					'Environment vars'
				];
				const results = await diagnostics.runAllChecks();
				const pairedResults = results.map((result, index) => ({
					name: checkNames[index] ?? `Check ${index + 1}`,
					result
				}));

				console.log(formatter.formatReport(pairedResults));

				printInstallationInfo(color);
				printProjectOverrides(color);
				printPluginsSection(color, getLoadedPlugins());

				console.log();

				if (options.fix) {
					runAutoFix(color, diagnostics, pairedResults);
				}

				if (options.export) {
					const jsonReport = formatter.exportToJSON(pairedResults);
					await writeFile(options.export, jsonReport);
					console.log(color.gray(`\n  Report exported to: ${options.export}\n`));
				}

				const hasErrors = pairedResults.some((r) => r.result.status === 'fail');
				process.exit(hasErrors ? 1 : 0);
			} catch (error) {
				console.error(color.red('\nDiagnostic check failed:'), formatErrorMessage(error));
				process.exit(1);
			}
		});
}

function printInstallationInfo(color: ColorAdapter): void {
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
}

function printPluginsSection(color: ColorAdapter, plugins: LoadedPlugin[]): void {
	console.log(color.cyan('\nPlugins:'));
	if (plugins.length === 0) {
		console.log(`  ${color.gray('(none)')}`);
		return;
	}
	for (const plugin of plugins) {
		const contribs = plugin.manifest.contributes?.join(', ') ?? 'none';
		const perms = plugin.manifest.permissions?.join(', ') ?? 'none';
		const binaries = plugin.manifest.requiresBinary?.map((b) => b.name).join(', ');
		console.log(`  ${color.green(plugin.manifest.name)}@${plugin.manifest.version}`);
		console.log(`    contributes: ${contribs}`);
		console.log(`    permissions: ${perms}`);
		if (binaries) console.log(`    requires:    ${binaries}`);
		console.log(`    path:        ${plugin.pluginDir}`);
	}
}

function printProjectOverrides(color: ColorAdapter): void {
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
}

function runAutoFix(color: ColorAdapter, diagnostics: DiagnosticsService, pairedResults: PairedResult[]): void {
	console.log(color.cyan('\nAttempting to auto-fix issues...\n'));

	const fixedCount = pairedResults
		.filter(({ result }) => result.autoFixable)
		.filter(({ name, result }) => {
			const fixed = diagnostics.autoFix(result);
			if (fixed) console.log(color.green(`  Fixed: ${name}`));
			return fixed;
		}).length;

	if (fixedCount === 0) {
		console.log(color.yellow('  No issues were auto-fixable. Manual intervention required.'));
	} else {
		console.log(color.green(`\n  Fixed ${fixedCount} issue(s)`));
	}

	console.log();
}
