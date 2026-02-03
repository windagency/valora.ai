/**
 * Welcome banner for first-run experience
 */

import pkg from '../../package.json' with { type: 'json' };
import { getColorAdapter } from './color-adapter.interface';
import { getHeaderFormatter } from './header-formatter';

/**
 * Get package version
 */
function getVersion(): string {
	try {
		return pkg.version ?? '1.0.0';
	} catch {
		return '1.0.0';
	}
}

/**
 * Get environment info
 */
function getEnvironmentInfo(): string {
	const nodeVersion = process.version;
	const platform = process.platform;
	return `Node ${nodeVersion} on ${platform}`;
}

/**
 * Create welcome banner
 */
export function createWelcomeBanner(): string {
	const color = getColorAdapter();
	const version = getVersion();
	const envInfo = getEnvironmentInfo();

	const lines: string[] = [];

	const headerFormatter = getHeaderFormatter();
	const header = headerFormatter.formatMultiLineHeader(['', '✨ Welcome to VALORA!', ''], {
		minWidth: 57
	});

	lines.push(header.trim());
	lines.push('');
	lines.push(color.gray('  VALORA - AI-Assisted Development Workflow Orchestration v') + color.yellow(version));
	lines.push(color.gray('  ' + envInfo));
	lines.push('');
	lines.push(color.gray('  Looks like this is your first time here.'));
	lines.push(color.gray("  Let's get you set up (takes ~2 minutes)"));
	lines.push('');

	return lines.join('\n');
}

/**
 * Create next steps message
 */
export function createNextStepsMessage(): string {
	const color = getColorAdapter();
	const lines: string[] = [];

	lines.push('');
	lines.push(color.getRawFn('cyan.bold')("  🎉 You're all set!"));
	lines.push('');
	lines.push(color.gray('  Here are some commands to try:'));
	lines.push('');
	lines.push('  ' + color.green('$ valora help') + '                 ' + color.gray('View all commands'));
	lines.push('  ' + color.green('$ valora plan "task"') + '         ' + color.gray('Create an implementation plan'));
	lines.push('  ' + color.green('$ valora implement') + '           ' + color.gray('Execute the plan'));
	lines.push('  ' + color.green('$ valora test') + '                ' + color.gray('Run tests'));
	lines.push('  ' + color.green('$ valora commit') + '              ' + color.gray('Create conventional commit'));
	lines.push('');
	lines.push(color.gray('  💡 TIP: Run ') + color.cyan('valora doctor') + color.gray(' to check your setup'));
	lines.push('');

	return lines.join('\n');
}

/**
 * Create setup progress indicator
 */
export function createSetupProgress(step: number, total: number, message: string): string {
	const color = getColorAdapter();
	const percentage = Math.floor((step / total) * 100);
	const filled = Math.floor((step / total) * 20);
	const empty = 20 - filled;

	const bar = color.green('▓'.repeat(filled)) + color.gray('░'.repeat(empty));
	return `  [${bar}] ${percentage}% - ${color.gray(message)}`;
}
