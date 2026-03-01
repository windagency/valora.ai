/**
 * Progress indicators and spinners
 */

import { getSpinnerAdapter, type Spinner } from 'ui/spinner-adapter.interface';

import { getColorAdapter } from './color-adapter.interface';
import { getConsoleOutput } from './console-output';
import { getHeaderFormatter } from './header-formatter';
import { getProgressTracker, type MultiStageProgressTracker } from './multi-stage-progress';
import { getProgressFormatter, type ProgressFormatter } from './progress-formatter';

const spinner = getSpinnerAdapter();

export type ProgressMode = 'off' | 'rich' | 'simple';

export class ProgressIndicator {
	private enabled: boolean;
	private formatter: ProgressFormatter;
	private mode: ProgressMode = 'simple';
	private spinnerInstance: null | Spinner = null;
	private tracker: MultiStageProgressTracker;

	constructor(enabled = true, mode: ProgressMode = 'simple') {
		this.enabled = enabled;
		this.mode = mode;
		this.tracker = getProgressTracker();
		this.formatter = getProgressFormatter();
	}

	/**
	 * Start a spinner
	 */
	start(message: string): void {
		if (!this.enabled) return;

		this.spinnerInstance = spinner
			.create({
				color: 'cyan',
				text: message
			})
			.start();
	}

	/**
	 * Update spinner text
	 */
	update(message: string): void {
		if (!this.enabled || !this.spinnerInstance) return;
		this.spinnerInstance.text = message;
	}

	/**
	 * Mark spinner as successful
	 */
	succeed(message?: string): void {
		if (!this.enabled || !this.spinnerInstance) return;
		this.spinnerInstance.succeed(message);
		this.spinnerInstance = null;
	}

	/**
	 * Mark spinner as failed
	 */
	fail(message?: string): void {
		if (!this.enabled || !this.spinnerInstance) return;
		this.spinnerInstance.fail(message);
		this.spinnerInstance = null;
	}

	/**
	 * Mark spinner as warning
	 */
	warn(message?: string): void {
		if (!this.enabled || !this.spinnerInstance) return;
		this.spinnerInstance.warn(message);
		this.spinnerInstance = null;
	}

	/**
	 * Stop spinner without icon
	 */
	stop(): void {
		if (!this.enabled || !this.spinnerInstance) return;
		this.spinnerInstance.stop();
		this.spinnerInstance = null;
	}

	/**
	 * Create a progress bar (simple text-based)
	 */
	static createProgressBar(current: number, total: number, width = 40): string {
		const color = getColorAdapter();
		const percentage = Math.floor((current / total) * 100);
		const filled = Math.floor((current / total) * width);
		const empty = width - filled;

		const bar = color.green('█'.repeat(filled)) + color.gray('░'.repeat(empty));
		return `${bar} ${percentage}% (${current}/${total})`;
	}

	/**
	 * Display a progress bar
	 */
	displayProgress(current: number, total: number, message?: string): void {
		if (!this.enabled) return;

		const bar = ProgressIndicator.createProgressBar(current, total);
		const text = message ? `${message}\n${bar}` : bar;

		if (this.spinnerInstance) {
			this.spinnerInstance.text = text;
		} else {
			getConsoleOutput().print(text);
		}
	}

	/**
	 * Show step indicator (e.g., "Step 1/5: Loading data")
	 */
	static formatStep(current: number, total: number, message: string): string {
		const color = getColorAdapter();
		return color.cyan(`[${current}/${total}]`) + ` ${message}`;
	}

	/**
	 * Enable or disable progress indicators
	 */
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		if (!enabled && this.spinnerInstance) {
			this.spinnerInstance.stop();
			this.spinnerInstance = null;
		}
	}

	/**
	 * Check if enabled
	 */
	isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Set progress mode
	 */
	setMode(mode: ProgressMode): void {
		this.mode = mode;
		if (mode === 'off') {
			this.enabled = false;
		}
	}

	/**
	 * Get progress mode
	 */
	getMode(): ProgressMode {
		return this.mode;
	}

	/**
	 * Get multi-stage tracker
	 */
	getTracker(): MultiStageProgressTracker {
		return this.tracker;
	}

	/**
	 * Display multi-stage progress (rich mode)
	 */
	displayMultiStage(): void {
		if (!this.enabled || this.mode !== 'rich') return;

		const stages = this.tracker.getStages();
		if (stages.length === 0) return;

		// Clear previous output (this is a simplified version)
		// In a real implementation, we'd use a library like 'cli-cursor' or 'log-update'
		const lines: string[] = [];

		// Header
		const headerFormatter = getHeaderFormatter();
		const header = headerFormatter.formatHeader('🚀 EXECUTION PROGRESS', {
			centered: false,
			width: 56
		});
		lines.push(header, '');

		// Display each stage
		const runningStages = stages.filter((s) => s.status === 'running');
		const completedStages = stages.filter((s) => s.status === 'completed');
		const failedStages = stages.filter((s) => s.status === 'failed');

		// Show running stages in detail
		lines.push(...runningStages.flatMap((stage) => [this.formatter.formatStageBox(stage), '']));

		// Show completed stages (compact)
		if (completedStages.length > 0) {
			const color = getColorAdapter();
			lines.push(`  ${color.green(`✓ Completed: ${completedStages.map((s) => s.name).join(', ')}`)}`, '');
		}

		// Show failed stages
		if (failedStages.length > 0) {
			const color = getColorAdapter();
			lines.push(`  ${color.red(`✗ Failed: ${failedStages.map((s) => s.name).join(', ')}`)}`, '');
		}

		// Summary
		const eta = this.tracker.getEstimatedTimeRemaining();
		lines.push(this.formatter.formatOverallSummary(stages, eta));

		getConsoleOutput().print(lines.join('\n'));
	}

	/**
	 * Start a stage (multi-stage mode)
	 */
	startStage(name: string, message?: string): void {
		if (!this.enabled) return;

		this.tracker.startStage(name, { message });

		const modeHandlers: Record<ProgressMode, () => void> = {
			off: () => {},
			rich: () => this.displayMultiStage(),
			simple: () => this.start(`${name}: ${message ?? 'Processing...'}`)
		};

		modeHandlers[this.mode]();
	}

	/**
	 * Update a stage (multi-stage mode)
	 */
	updateStageProgress(name: string, progress: number, message?: string): void {
		if (!this.enabled) return;

		this.tracker.updateStage(name, progress, message);

		const modeHandlers: Record<ProgressMode, () => void> = {
			off: () => {},
			rich: () => this.displayMultiStage(),
			simple: () => this.update(message ?? `${name}: ${progress}%`)
		};

		modeHandlers[this.mode]();
	}

	/**
	 * Complete a stage (multi-stage mode)
	 */
	completeStage(name: string): void {
		if (!this.enabled) return;

		this.tracker.completeStage(name);

		const modeHandlers: Record<ProgressMode, () => void> = {
			off: () => {},
			rich: () => this.displayMultiStage(),
			simple: () => this.succeed(`${name}: Complete`)
		};

		modeHandlers[this.mode]();
	}

	/**
	 * Fail a stage (multi-stage mode)
	 */
	failStage(name: string, error: string): void {
		if (!this.enabled) return;

		this.tracker.failStage(name, error);

		const modeHandlers: Record<ProgressMode, () => void> = {
			off: () => {},
			rich: () => this.displayMultiStage(),
			simple: () => this.fail(`${name}: ${error}`)
		};

		modeHandlers[this.mode]();
	}
}

// Singleton instance
let progressInstance: null | ProgressIndicator = null;

export function getProgress(): ProgressIndicator {
	progressInstance ??= new ProgressIndicator();
	return progressInstance;
}

export function setProgress(progress: ProgressIndicator): void {
	progressInstance = progress;
}
