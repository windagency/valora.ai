/**
 * Rich formatting utilities for progress display
 */

import type { StageProgress } from './multi-stage-progress';

import { getBoxFormatter } from './box-formatter';
import { getColorAdapter } from './color-adapter.interface';

/**
 * Rendering context for box-drawing operations
 * Consolidates shared parameters to avoid long parameter lists
 */
interface BoxRenderContext {
	chars: ReturnType<ReturnType<typeof getBoxFormatter>['getBoxChars']>;
	color: ReturnType<typeof getColorAdapter>;
	lines: string[];
	width: number;
}

export class ProgressFormatter {
	/**
	 * Format a stage with box-drawing
	 */
	formatStageBox(stage: StageProgress): string {
		const color = getColorAdapter();
		const boxFormatter = getBoxFormatter();
		const chars = boxFormatter.getBoxChars('single');

		const statusIcon = this.getStatusIcon(stage.status);
		const title = `${statusIcon} ${stage.name}`;
		const contentWidth = Math.max(title.length, stage.metadata?.message?.length ?? 0, 40);
		const width = Math.min(contentWidth, 60);
		const lines: string[] = [];

		const ctx: BoxRenderContext = { chars, color, lines, width };

		this.addBoxHeader(ctx, title);
		this.addProgressBarLine(ctx, stage);
		this.addMetadataLine(ctx, stage);
		this.addItemsLine(ctx, stage);
		this.addETALine(ctx, stage);
		this.addErrorLine(ctx, stage);
		this.addBoxFooter(ctx);

		return lines.join('\n');
	}

	/**
	 * Add box header with title
	 */
	private addBoxHeader(ctx: BoxRenderContext, title: string): void {
		const { chars, color, lines, width } = ctx;
		const titlePadding = Math.max(0, width - title.length - 8);
		lines.push(
			color.gray('  ' + chars.topLeft + chars.horizontal.repeat(2) + ' ') +
				color.bold(title) +
				color.gray(' ' + chars.horizontal.repeat(titlePadding) + chars.topRight)
		);
	}

	/**
	 * Add progress bar line for running stages
	 */
	private addProgressBarLine(ctx: BoxRenderContext, stage: StageProgress): void {
		const { chars, color, lines } = ctx;
		if (stage.status === 'running') {
			const progressBar = this.formatProgressBar(stage.progress, 100);
			lines.push(color.gray('  ' + chars.vertical + '  ') + progressBar + color.gray('  ' + chars.vertical));
		}
	}

	/**
	 * Add metadata message line
	 */
	private addMetadataLine(ctx: BoxRenderContext, stage: StageProgress): void {
		const { chars, color, lines, width } = ctx;
		if (stage.metadata?.message) {
			const message = stage.metadata.message;
			const truncated = message.length > width - 8 ? message.substring(0, width - 11) + '...' : message;
			const padding = ' '.repeat(Math.max(0, width - truncated.length - 4));
			lines.push(
				color.gray('  ' + chars.vertical + '  ') + color.gray(truncated) + color.gray(padding + chars.vertical)
			);
		}
	}

	/**
	 * Add items processed line
	 */
	private addItemsLine(ctx: BoxRenderContext, stage: StageProgress): void {
		const { chars, color, lines, width } = ctx;
		if (stage.metadata?.totalItems && stage.metadata?.itemsProcessed !== undefined) {
			const items = `${stage.metadata.itemsProcessed}/${stage.metadata.totalItems} items`;
			const padding = ' '.repeat(Math.max(0, width - items.length - 4));
			lines.push(color.gray('  ' + chars.vertical + '  ') + color.cyan(items) + color.gray(padding + chars.vertical));
		}
	}

	/**
	 * Add ETA line for running stages
	 */
	private addETALine(ctx: BoxRenderContext, stage: StageProgress): void {
		const { chars, color, lines, width } = ctx;
		if (stage.status === 'running' && stage.startTime) {
			const elapsed = Date.now() - stage.startTime;
			const eta = this.estimateStageETA(stage, elapsed);
			if (eta) {
				const padding = ' '.repeat(Math.max(0, width - eta.length - 4));
				lines.push(color.gray('  ' + chars.vertical + '  ') + color.yellow(eta) + color.gray(padding + chars.vertical));
			}
		}
	}

	/**
	 * Add error message line for failed stages
	 */
	private addErrorLine(ctx: BoxRenderContext, stage: StageProgress): void {
		const { chars, color, lines, width } = ctx;
		if (stage.status === 'failed' && stage.error) {
			const error = stage.error;
			const truncated = error.length > width - 8 ? error.substring(0, width - 11) + '...' : error;
			const padding = ' '.repeat(Math.max(0, width - truncated.length - 4));
			lines.push(
				color.gray('  ' + chars.vertical + '  ') + color.red(truncated) + color.gray(padding + chars.vertical)
			);
		}
	}

	/**
	 * Add box footer
	 */
	private addBoxFooter(ctx: BoxRenderContext): void {
		const { chars, color, lines, width } = ctx;
		lines.push(color.gray('  ' + chars.bottomLeft + chars.horizontal.repeat(width) + chars.bottomRight));
	}

	/**
	 * Format a progress bar
	 */
	formatProgressBar(current: number, total: number): string {
		const color = getColorAdapter();
		const percentage = Math.floor((current / total) * 100);
		const barWidth = 30;
		const filled = Math.floor((current / total) * barWidth);
		const empty = barWidth - filled;

		const filledChars = '█'.repeat(filled);
		const emptyChars = '░'.repeat(empty);

		return `${color.green(filledChars)}${color.gray(emptyChars)} ${color.cyan(percentage + '%')}`;
	}

	/**
	 * Format ETA (estimated time remaining)
	 */
	formatETA(milliseconds: number): string {
		if (milliseconds < 1000) {
			return 'Est. < 1s';
		}

		const seconds = Math.floor(milliseconds / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (hours > 0) {
			const remainingMinutes = minutes % 60;
			return `Est. ${hours}h ${remainingMinutes}m`;
		}

		if (minutes > 0) {
			const remainingSeconds = seconds % 60;
			return `Est. ${minutes}m ${remainingSeconds}s`;
		}

		return `Est. ${seconds}s`;
	}

	/**
	 * Format overall summary footer
	 */
	formatOverallSummary(stages: StageProgress[], estimatedTimeRemaining?: number): string {
		const color = getColorAdapter();
		// Count all statuses in a single pass
		const counts = stages.reduce(
			(acc, stage) => {
				acc[stage.status]++;
				return acc;
			},
			{ completed: 0, failed: 0, pending: 0, running: 0 }
		);

		// Build status parts using map/filter for functional approach
		const statusParts = [
			counts.running > 0 && color.cyan(`${counts.running} running`),
			counts.completed > 0 && color.green(`${counts.completed} completed`),
			counts.failed > 0 && color.red(`${counts.failed} failed`),
			counts.pending > 0 && color.gray(`${counts.pending} pending`)
		].filter(Boolean);

		const etaPart =
			estimatedTimeRemaining && estimatedTimeRemaining > 0
				? ` • ${color.yellow(this.formatETA(estimatedTimeRemaining))}`
				: '';

		return `  ⚡ ${statusParts.join(' • ')}${etaPart}`;
	}

	/**
	 * Format a simple progress line (for non-rich mode)
	 */
	formatSimpleProgress(stageName: string, progress: number): string {
		const color = getColorAdapter();
		const bar = this.formatProgressBar(progress, 100);
		return `  ${color.bold(stageName)}: ${bar}`;
	}

	/**
	 * Format spinner with message (for simple mode)
	 */
	formatSpinnerMessage(frame: string, message: string): string {
		const color = getColorAdapter();
		return `${color.cyan(frame)} ${message}`;
	}

	/**
	 * Get status icon for stage
	 */
	private getStatusIcon(status: StageProgress['status']): string {
		const color = getColorAdapter();
		const statusIcons: Record<StageProgress['status'], string> = {
			completed: color.green('✓'),
			failed: color.red('✗'),
			pending: color.gray('○'),
			running: color.cyan('⠋')
		};

		return statusIcons[status];
	}

	/**
	 * Estimate ETA for a single stage
	 */
	private estimateStageETA(stage: StageProgress, elapsed: number): null | string {
		if (stage.progress === 0) return null;

		// Estimate based on current progress rate
		const estimatedTotal = (elapsed / stage.progress) * 100;
		const estimatedRemaining = estimatedTotal - elapsed;

		if (estimatedRemaining < 1000) return null;

		return this.formatETA(estimatedRemaining);
	}
}

/**
 * Singleton instance
 */
let formatterInstance: null | ProgressFormatter = null;

export function getProgressFormatter(): ProgressFormatter {
	formatterInstance ??= new ProgressFormatter();
	return formatterInstance;
}
