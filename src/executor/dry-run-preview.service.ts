/**
 * Dry Run Preview Service
 *
 * Displays a comprehensive summary of simulated operations from dry-run mode.
 * Shows file changes with diffs, terminal commands, and token/cost estimates.
 */

import type { LLMMessage } from 'types/llm.types';

import { type ColorAdapter, getColorAdapter } from 'output/color-adapter.interface';
import { type ConsoleOutput, getConsoleOutput } from 'output/console-output';
import { estimateTokens, formatTokenEstimate, type TokenEstimate } from 'utils/token-estimator';

import type { SimulatedOperation, SimulatedOperationType } from './tools/dry-run-simulator.service';

/**
 * Options for displaying the dry-run preview
 */
export interface DryRunPreviewOptions {
	/** Model name for cost estimation */
	model?: string;
	/** Show diff previews for file changes */
	showDiffs?: boolean;
	/** Show token/cost estimates */
	showTokenEstimates?: boolean;
}

/**
 * Summary of dry-run execution
 */
export interface DryRunSummary {
	/** Total estimated cost */
	estimatedCost?: TokenEstimate;
	/** File operations (create, modify, delete) */
	fileOperations: SimulatedOperation[];
	/** Terminal commands that would be executed */
	terminalCommands: SimulatedOperation[];
	/** Total number of simulated operations */
	totalOperations: number;
}

const DEFAULT_OPTIONS: DryRunPreviewOptions = {
	showDiffs: true,
	showTokenEstimates: true
};

/**
 * Service for displaying dry-run preview summaries
 */
export class DryRunPreviewService {
	private readonly color: ColorAdapter;
	private readonly console: ConsoleOutput;

	constructor(console?: ConsoleOutput, color?: ColorAdapter) {
		this.console = console ?? getConsoleOutput();
		this.color = color ?? getColorAdapter();
	}

	/**
	 * Build a summary from simulated operations
	 */
	buildSummary(operations: SimulatedOperation[], messages?: LLMMessage[], model?: string): DryRunSummary {
		const fileOperations = operations.filter((op) => op.type === 'write' || op.type === 'delete');
		const terminalCommands = operations.filter((op) => op.type === 'command');

		const summary: DryRunSummary = {
			fileOperations,
			terminalCommands,
			totalOperations: operations.length
		};

		// Estimate tokens if messages provided
		if (messages && messages.length > 0) {
			summary.estimatedCost = estimateTokens(messages, model);
		}

		return summary;
	}

	/**
	 * Display the full dry-run preview
	 */
	display(operations: SimulatedOperation[], options: DryRunPreviewOptions = DEFAULT_OPTIONS): void {
		const opts = { ...DEFAULT_OPTIONS, ...options };

		this.displayHeader();
		this.displayFileOperations(operations, opts.showDiffs ?? true);
		this.displayTerminalCommands(operations);
		this.displayExternalOperations(operations);
		this.displayFooter();
	}

	/**
	 * Display the preview with token estimates
	 */
	displayWithEstimates(
		operations: SimulatedOperation[],
		messages: LLMMessage[],
		options: DryRunPreviewOptions = DEFAULT_OPTIONS
	): void {
		const opts = { ...DEFAULT_OPTIONS, ...options };
		const summary = this.buildSummary(operations, messages, opts.model);

		this.displayHeader();
		this.displayFileOperations(operations, opts.showDiffs ?? true);
		this.displayTerminalCommands(operations);
		this.displayExternalOperations(operations);

		if (opts.showTokenEstimates && summary.estimatedCost) {
			this.displayTokenEstimates(summary.estimatedCost);
		}

		this.displayFooter();
	}

	/**
	 * Display header
	 */
	private displayHeader(): void {
		this.console.blank();
		this.console.print(this.color.dim('='.repeat(60)));
		this.console.print(this.color.bold('DRY RUN SUMMARY - No changes made'));
		this.console.print(this.color.dim('='.repeat(60)));
		this.console.blank();
	}

	/**
	 * Display file operations section
	 */
	private displayFileOperations(operations: SimulatedOperation[], showDiffs: boolean): void {
		const fileOps = operations.filter((op) => op.type === 'write' || op.type === 'delete');

		if (fileOps.length === 0) {
			return;
		}

		this.console.print(this.color.bold(`File Operations (${fileOps.length}):`));
		fileOps.forEach((op) => this.displayFileOperation(op));

		// Show diffs if enabled
		if (showDiffs) {
			const opsWithDiffs = fileOps.filter((op) => op.diff?.hasChanges);

			if (opsWithDiffs.length > 0) {
				this.console.blank();
				this.console.print(this.color.bold('Diff Preview:'));
				opsWithDiffs.forEach((op) => this.displayDiff(op));
			}
		}

		this.console.blank();
	}

	/**
	 * Display a single file operation
	 */
	private displayFileOperation(op: SimulatedOperation): void {
		const path = op.args['path'] as string;

		// Object literal lookup for operation type styling
		const operationStyles = {
			'[CREATE]': { icon: this.color.green('+'), label: this.color.green('[CREATE]') },
			'[DELETE]': { icon: this.color.red('-'), label: this.color.red('[DELETE]') },
			'[ERROR]': { icon: this.color.red('!'), label: this.color.red('[ERROR]') },
			'[MODIFY]': { icon: this.color.yellow('~'), label: this.color.yellow('[MODIFY]') }
		} as const;

		// Extract operation type from description prefix
		const opType = Object.keys(operationStyles).find((key) => op.description.startsWith(key)) as
			| keyof typeof operationStyles
			| undefined;
		const style = opType ? operationStyles[opType] : { icon: ' ', label: '' };

		// Add stats if available
		const stats =
			op.diff && (op.diff.additions > 0 || op.diff.deletions > 0)
				? this.color.dim(` (+${op.diff.additions} -${op.diff.deletions})`)
				: '';

		this.console.print(`  ${style.icon} ${style.label} ${path}${stats}`);
	}

	/**
	 * Display diff for a file operation
	 */
	private displayDiff(op: SimulatedOperation): void {
		if (!op.diff?.hasChanges) {
			return;
		}

		const path = op.args['path'] as string;

		this.console.print(this.color.dim('-'.repeat(60)));
		this.console.print(this.color.bold(` ${path}`));
		this.console.print(this.color.dim('-'.repeat(60)));

		// Display diff lines with colours
		op.diff.diffText.split('\n').forEach((line) => this.console.print(this.colorizeDiffLine(line)));
	}

	/**
	 * Apply colour to a diff line based on its prefix
	 */
	private colorizeDiffLine(line: string): string {
		// File headers get bold styling
		if (line.startsWith('---') || line.startsWith('+++')) {
			return this.color.bold(line);
		}
		// Hunk headers get cyan
		if (line.startsWith('@@')) {
			return this.color.cyan(line);
		}
		// Added lines get green
		if (line.startsWith('+')) {
			return this.color.green(line);
		}
		// Removed lines get red
		if (line.startsWith('-')) {
			return this.color.red(line);
		}
		// Context lines remain unchanged
		return line;
	}

	/**
	 * Display terminal commands section
	 */
	private displayTerminalCommands(operations: SimulatedOperation[]): void {
		const commands = operations.filter((op) => op.type === 'command');

		if (commands.length === 0) {
			return;
		}

		this.console.print(this.color.bold(`Terminal Commands (${commands.length}):`));
		commands.forEach((op) => {
			const command = op.args['command'] as string;
			this.console.print(`  ${this.color.cyan('$')} ${command}`);
		});
		this.console.blank();
	}

	/**
	 * Display external operations section (web search, MCP, etc.)
	 */
	private displayExternalOperations(operations: SimulatedOperation[]): void {
		const external = operations.filter((op) => op.type === 'external');

		if (external.length === 0) {
			return;
		}

		this.console.print(this.color.bold(`External Operations (${external.length}):`));
		external.forEach((op) => this.console.print(`  ${this.color.dim('•')} ${op.description}`));
		this.console.blank();
	}

	/**
	 * Display token estimates section
	 */
	private displayTokenEstimates(estimate: TokenEstimate): void {
		this.console.print(this.color.bold('Estimated Token Usage:'));
		this.console.print(formatTokenEstimate(estimate));
		this.console.blank();
	}

	/**
	 * Display footer
	 */
	private displayFooter(): void {
		this.console.print(this.color.dim('='.repeat(60)));
		this.console.print(this.color.yellow('Run without --dry-run to execute these changes.'));
		this.console.print(this.color.dim('='.repeat(60)));
		this.console.blank();
	}

	/**
	 * Display a compact summary (single line)
	 */
	displayCompact(operations: SimulatedOperation[]): void {
		const byType = this.groupByType(operations);

		// Category definitions for summary display
		const categories = [
			{ label: 'file change', types: ['write', 'delete'] as const },
			{ label: 'command', types: ['command'] as const },
			{ label: 'external call', types: ['external'] as const }
		];

		const parts = categories
			.map(({ label, types }) => {
				const count = types.reduce((sum, type) => sum + (byType[type]?.length ?? 0), 0);
				return count > 0 ? `${count} ${label}${count !== 1 ? 's' : ''}` : null;
			})
			.filter((part): part is string => part !== null);

		if (parts.length === 0) {
			this.console.print(this.color.dim('[DRY RUN] No changes would be made'));
		} else {
			this.console.print(this.color.yellow(`[DRY RUN] Would perform: ${parts.join(', ')}`));
		}
	}

	/**
	 * Group operations by type using reduce
	 */
	private groupByType(operations: SimulatedOperation[]): Record<SimulatedOperationType, SimulatedOperation[]> {
		const initial: Record<SimulatedOperationType, SimulatedOperation[]> = {
			command: [],
			delete: [],
			external: [],
			read: [],
			search: [],
			write: []
		};

		return operations.reduce((grouped, op) => {
			grouped[op.type].push(op);
			return grouped;
		}, initial);
	}
}

/**
 * Get the singleton preview service instance
 */
let previewService: DryRunPreviewService | null = null;

export function getDryRunPreviewService(): DryRunPreviewService {
	previewService ??= new DryRunPreviewService();
	return previewService;
}
