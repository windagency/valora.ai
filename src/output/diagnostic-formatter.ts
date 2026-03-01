/**
 * Diagnostic output formatter for doctor command
 */

import type { DiagnosticResult, DiagnosticStatus } from 'types/diagnostics.types';

import { getColorAdapter } from './color-adapter.interface';
import { getHeaderFormatter } from './header-formatter';

export class DiagnosticFormatter {
	/**
	 * Format diagnostic header
	 */
	formatHeader(): string {
		const headerFormatter = getHeaderFormatter();
		const title = '🏥 AI ORCHESTRATION ENGINE DIAGNOSTICS';

		return headerFormatter.formatHeader(title, { centered: false });
	}

	/**
	 * Format status icon
	 */
	private formatStatusIcon(status: DiagnosticStatus): string {
		const color = getColorAdapter();
		const statusIcons: Record<DiagnosticStatus, string> = {
			fail: color.red('❌'),
			pass: color.green('✓'),
			warn: color.yellow('⚠')
		};

		return statusIcons[status];
	}

	/**
	 * Format a single diagnostic result
	 */
	formatResult(name: string, result: DiagnosticResult): string {
		const color = getColorAdapter();
		const icon = this.formatStatusIcon(result.status);
		const nameWidth = 25;
		const padding = ' '.repeat(Math.max(0, nameWidth - name.length));

		return `  ${icon} ${color.bold(name)}${padding}${color.gray(result.message)}`;
	}

	/**
	 * Format all diagnostic results
	 */
	formatResults(results: Array<{ name: string; result: DiagnosticResult }>): string {
		const color = getColorAdapter();
		const lines: string[] = [];

		lines.push(color.gray('Running health checks...\n'));

		results.forEach(({ name, result }) => {
			lines.push(this.formatResult(name, result));
		});

		return lines.join('\n');
	}

	/**
	 * Format warnings section
	 */
	formatWarnings(results: Array<{ name: string; result: DiagnosticResult }>): string {
		const color = getColorAdapter();
		const warnings = results.filter((r) => r.result.status === 'warn');

		if (warnings.length === 0) {
			return '';
		}

		const lines: string[] = [];
		const headerText = `WARNINGS (${warnings.length})`;
		const width = Math.min(headerText.length, 60);

		lines.push('');
		lines.push(color.gray('─'.repeat(width)));
		lines.push('');
		lines.push(color.getRawFn('yellow.bold')(`WARNINGS (${warnings.length})`));
		lines.push('');

		warnings.forEach(({ name, result }, index) => {
			lines.push(color.yellow(`${index + 1}. ${name}`));
			if (result.suggestion) {
				lines.push(color.gray(`   ➜ ${result.suggestion}`));
			}
			lines.push('');
		});

		return lines.join('\n');
	}

	/**
	 * Format errors section
	 */
	formatErrors(results: Array<{ name: string; result: DiagnosticResult }>): string {
		const color = getColorAdapter();
		const errors = results.filter((r) => r.result.status === 'fail');

		if (errors.length === 0) {
			return '';
		}

		const lines: string[] = [];
		const headerText = `ERRORS (${errors.length})`;
		const width = Math.min(headerText.length, 60);

		lines.push('');
		lines.push(color.gray('─'.repeat(width)));
		lines.push('');
		lines.push(color.getRawFn('red.bold')(`ERRORS (${errors.length})`));
		lines.push('');

		errors.forEach(({ name, result }, index) => {
			lines.push(color.red(`${index + 1}. ${name}`));
			if (result.suggestion) {
				lines.push(color.gray(`   ➜ ${result.suggestion}`));
			}
			lines.push('');
		});

		return lines.join('\n');
	}

	/**
	 * Format summary
	 */
	formatSummary(results: Array<{ name: string; result: DiagnosticResult }>): string {
		const color = getColorAdapter();
		const errors = results.filter((r) => r.result.status === 'fail').length;
		const warnings = results.filter((r) => r.result.status === 'warn').length;
		const passed = results.filter((r) => r.result.status === 'pass').length;

		// Determine status message and color using handler pattern
		const statusHandlers: Array<{
			condition: () => boolean;
			formatter: (msg: string) => string;
			message: () => string;
		}> = [
			{
				condition: () => errors === 0 && warnings === 0,
				formatter: (msg) => color.getRawFn('green.bold')(msg),
				message: () => '✅ System is healthy'
			},
			{
				condition: () => errors === 0,
				formatter: (msg) => color.getRawFn('yellow.bold')(msg),
				message: () => `✅ System is healthy (${warnings} warning${warnings > 1 ? 's' : ''})`
			},
			{
				condition: () => true, // Default case
				formatter: (msg) => color.getRawFn('red.bold')(msg),
				message: () => `❌ System has issues (${errors} error${errors > 1 ? 's' : ''})`
			}
		];

		const statusHandler = statusHandlers.find((handler) => handler.condition())!;
		const statusMessage = statusHandler.message();

		const lines: string[] = [];
		const width = Math.min(statusMessage.length, 60);

		lines.push(color.gray('─'.repeat(width)));
		lines.push('');
		lines.push(statusHandler.formatter(statusMessage));

		lines.push('');
		lines.push(
			color.gray(`  ${passed} passed, ${warnings} warnings, ${errors} errors (${results.length} checks total)`)
		);
		lines.push('');

		// Add auto-fix suggestion if there are fixable issues
		const fixableCount = results.filter((r) => r.result.autoFixable).length;
		if (fixableCount > 0) {
			lines.push(
				color.gray(`  💡 Run 'valora doctor --fix' to auto-fix ${fixableCount} issue${fixableCount > 1 ? 's' : ''}`)
			);
			lines.push('');
		}

		return lines.join('\n');
	}

	/**
	 * Format complete diagnostic report
	 */
	formatReport(results: Array<{ name: string; result: DiagnosticResult }>): string {
		const lines: string[] = [];

		lines.push(this.formatHeader());
		lines.push(this.formatResults(results));
		lines.push(this.formatErrors(results));
		lines.push(this.formatWarnings(results));
		lines.push(this.formatSummary(results));

		return lines.join('\n');
	}

	/**
	 * Export diagnostic results to JSON
	 */
	exportToJSON(results: Array<{ name: string; result: DiagnosticResult }>): string {
		return JSON.stringify(
			{
				checks: results.map((r) => ({
					autoFixable: r.result.autoFixable ?? false,
					message: r.result.message,
					name: r.name,
					status: r.result.status,
					suggestion: r.result.suggestion
				})),
				summary: {
					errors: results.filter((r) => r.result.status === 'fail').length,
					passed: results.filter((r) => r.result.status === 'pass').length,
					timestamp: new Date().toISOString(),
					warnings: results.filter((r) => r.result.status === 'warn').length
				}
			},
			null,
			2
		);
	}
}

/**
 * Get singleton diagnostic formatter instance
 */
let formatterInstance: DiagnosticFormatter | null = null;

export function getDiagnosticFormatter(): DiagnosticFormatter {
	formatterInstance ??= new DiagnosticFormatter();
	return formatterInstance;
}
