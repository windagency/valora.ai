/**
 * Dashboard command - Real-time TUI dashboard for monitoring sessions and system health
 */

import type { CommandAdapter } from 'cli/command-adapter.interface';

import { getColorAdapter } from 'output/color-adapter.interface';
import { formatError } from 'utils/error-handler';

/**
 * Configure dashboard command
 */
export function configureDashboardCommand(program: CommandAdapter): void {
	program
		.command('dashboard')
		.alias('dash')
		.description('Launch real-time dashboard for monitoring sessions and system health')
		.option('--no-auto-refresh', 'Disable auto-refresh (default: enabled, 2s interval)')
		.action(async () => {
			const color = getColorAdapter();
			try {
				console.log(color.cyan('Starting VALORA Dashboard...\n'));
				console.log(color.gray('Press q or Ctrl+C to exit\n'));

				// Lazy import to avoid loading ink module graph during CLI startup
				const { startDashboard } = await import('ui/dashboard-tui');
				startDashboard();
			} catch (error) {
				console.error(color.red('Failed to start dashboard:'), formatError(error as Error));
				console.error(color.yellow('\nTip: Make sure your terminal supports TUI applications and has sufficient size'));
				process.exit(1);
			}
		});
}
