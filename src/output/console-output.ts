/**
 * Console Output Service
 *
 * Centralised service for all CLI output that respects MCP mode.
 * All console output should flow through this service to ensure
 * consistent behaviour and MCP JSON-RPC compatibility.
 *
 * In MCP mode, output is suppressed to avoid interfering with
 * stdout JSON-RPC communication. All output uses stderr to leave
 * stdout available for structured data.
 */

import { type BoxFormatter, getBoxFormatter } from './box-formatter';
import { type ColorAdapter, getColorAdapter } from './color-adapter.interface';

export interface ConsoleOutputOptions {
	/** Force mute regardless of MCP mode */
	muted?: boolean;
}

/**
 * Console Output Service
 *
 * Provides consistent console output across the CLI with:
 * - MCP mode awareness (automatic suppression)
 * - Styled output methods (success, error, warn, info)
 * - Box formatting for structured content
 * - Group support for hierarchical output
 */
export class ConsoleOutput {
	private readonly boxFormatter: BoxFormatter;
	private readonly color: ColorAdapter;
	private groupDepth = 0;
	private muted: boolean;

	constructor(options: ConsoleOutputOptions = {}) {
		this.muted = options.muted ?? false;
		this.color = getColorAdapter();
		this.boxFormatter = getBoxFormatter();
	}

	/**
	 * Check if running in MCP mode
	 * MCP mode uses stdout for JSON-RPC, so we should not print to stdout
	 */
	private isMcpMode(): boolean {
		return process.env['AI_MCP_ENABLED'] === 'true';
	}

	/**
	 * Check if output should be suppressed
	 */
	private shouldSuppress(): boolean {
		return this.muted || this.isMcpMode();
	}

	/**
	 * Get indentation for current group depth
	 */
	private getIndent(): string {
		return '  '.repeat(this.groupDepth);
	}

	/**
	 * Write to stderr (used for all output to avoid MCP stdout conflicts)
	 */
	private write(message: string): void {
		if (this.shouldSuppress()) return;
		process.stderr.write(this.getIndent() + message + '\n');
	}

	/**
	 * Write to stderr without indentation
	 */
	private writeRaw(message: string): void {
		if (this.shouldSuppress()) return;
		process.stderr.write(message + '\n');
	}

	// ============================================
	// Standard output methods
	// ============================================

	/**
	 * Print a basic message
	 */
	print(message: string): void {
		this.write(message);
	}

	/**
	 * Print a success message with green checkmark prefix
	 */
	success(message: string): void {
		this.write(`${this.color.green('✓')} ${message}`);
	}

	/**
	 * Print an info message with gray bullet prefix
	 */
	info(message: string): void {
		this.write(`${this.color.gray('●')} ${message}`);
	}

	/**
	 * Print a warning message with yellow prefix
	 */
	warn(message: string): void {
		this.write(`${this.color.yellow('⚠')} ${message}`);
	}

	/**
	 * Print an error message with red prefix
	 */
	error(message: string): void {
		this.write(`${this.color.red('✗')} ${this.color.red(message)}`);
	}

	/**
	 * Print dimmed text (for secondary information)
	 */
	dim(message: string): void {
		this.write(this.color.dim(message));
	}

	/**
	 * Print bold text (for emphasis)
	 */
	bold(message: string): void {
		this.write(this.color.bold(message));
	}

	// ============================================
	// Formatted output methods
	// ============================================

	/**
	 * Print a box with optional title
	 */
	box(content: string | string[], title?: string): void {
		if (this.shouldSuppress()) return;

		const lines = Array.isArray(content) ? content : [content];

		const formatted = title ? this.boxFormatter.formatBoxWithTitle(title, lines) : this.boxFormatter.formatBox(lines);

		this.writeRaw(formatted);
	}

	/**
	 * Print a header (double-line box style)
	 */
	header(title: string): void {
		if (this.shouldSuppress()) return;

		const formatted = this.boxFormatter.formatBox([this.color.bold(title)], {
			color: 'cyan',
			style: 'double'
		});

		this.writeRaw(formatted);
	}

	/**
	 * Print a divider line
	 */
	divider(width = 60): void {
		this.writeRaw(this.color.gray('-'.repeat(width)));
	}

	/**
	 * Print a blank line
	 */
	blank(): void {
		if (this.shouldSuppress()) return;
		process.stderr.write('\n');
	}

	// ============================================
	// Group methods (replacement for console.group)
	// ============================================

	/**
	 * Start a group with a label
	 */
	startGroup(label: string): void {
		this.write(this.color.bold(label));
		this.groupDepth++;
	}

	/**
	 * End the current group
	 */
	endGroup(): void {
		if (this.groupDepth > 0) {
			this.groupDepth--;
		}
	}

	// ============================================
	// Conditional output methods
	// ============================================

	/**
	 * Print only if in interactive (non-MCP) mode
	 * Same as print() but more semantically clear
	 */
	printIfInteractive(message: string): void {
		if (this.isMcpMode()) return;
		this.write(message);
	}

	/**
	 * Force output even in MCP mode (for critical messages)
	 * Use sparingly - this writes to stderr which is safe in MCP mode
	 */
	always(message: string): void {
		if (this.muted) return;
		process.stderr.write(this.getIndent() + message + '\n');
	}

	/**
	 * Print a labeled value
	 */
	labelValue(label: string, value: string): void {
		this.write(`${this.color.bold(label)}: ${value}`);
	}

	/**
	 * Print a bulleted list
	 */
	list(items: string[], bullet = '•'): void {
		for (const item of items) {
			this.write(`${this.color.gray(bullet)} ${item}`);
		}
	}

	/**
	 * Print a numbered list
	 */
	numberedList(items: string[]): void {
		items.forEach((item, index) => {
			this.write(`${this.color.cyan(`${index + 1}.`)} ${item}`);
		});
	}

	// ============================================
	// State management
	// ============================================

	/**
	 * Mute all output
	 */
	mute(): void {
		this.muted = true;
	}

	/**
	 * Unmute output
	 */
	unmute(): void {
		this.muted = false;
	}

	/**
	 * Check if muted
	 */
	isMuted(): boolean {
		return this.muted;
	}

	/**
	 * Check if currently in MCP mode
	 */
	isInMcpMode(): boolean {
		return this.isMcpMode();
	}

	/**
	 * Get the color adapter for custom styling
	 */
	getColorAdapter(): ColorAdapter {
		return this.color;
	}
}

// ============================================
// Singleton instance
// ============================================

let instance: ConsoleOutput | null = null;

/**
 * Get the singleton ConsoleOutput instance
 */
export function getConsoleOutput(): ConsoleOutput {
	instance ??= new ConsoleOutput();
	return instance;
}

/**
 * Set a custom ConsoleOutput instance (useful for testing)
 */
export function setConsoleOutput(output: ConsoleOutput): void {
	instance = output;
}
