/**
 * Base Presenter - Common presentation utilities and interface
 */

import type { ConsoleOutput } from 'output/console-output';
import type { MarkdownRenderer } from 'output/markdown';

/**
 * Interface for command-specific presenters
 */
export interface CommandPresenter {
	/**
	 * Display the command summary
	 */
	display(outputs: Record<string, unknown>): void;

	/**
	 * Get the command name this presenter handles
	 */
	getCommandName(): string;
}

/**
 * Base presenter with common utilities
 */
export abstract class BasePresenter implements CommandPresenter {
	protected readonly console: ConsoleOutput;
	protected readonly renderer: MarkdownRenderer;

	constructor(console: ConsoleOutput, renderer: MarkdownRenderer) {
		this.console = console;
		this.renderer = renderer;
	}

	abstract display(outputs: Record<string, unknown>): void;
	abstract getCommandName(): string;

	/**
	 * Display a summary box with title
	 */
	protected displaySummaryBox(title: string): void {
		this.console.blank();
		this.console.divider();
		this.console.print(this.renderer.box(title, 'Summary'));
	}

	/**
	 * Display summary footer
	 */
	protected displaySummaryFooter(): void {
		this.console.divider();
		this.console.blank();
	}

	/**
	 * Format a key name as readable title
	 */
	protected formatKey(key: string): string {
		return key
			.replace(/_/g, ' ')
			.replace(/([a-z])([A-Z])/g, '$1 $2')
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	/**
	 * Get status icon based on status string
	 */
	protected getStatusIcon(status: string): string {
		const normalizedStatus = status.toLowerCase();
		if (['approve', 'approved', 'complete', 'excellent', 'pass', 'passed', 'success'].includes(normalizedStatus)) {
			return '✓';
		}
		if (['block', 'blocked', 'critical', 'error', 'fail', 'failed'].includes(normalizedStatus)) {
			return '✗';
		}
		return '○';
	}

	/**
	 * Get decision icon based on decision string
	 */
	protected getDecisionIcon(decision: string): string {
		const normalizedDecision = decision.toUpperCase();
		if (['APPROVE', 'APPROVED', 'GO', 'PASS', 'PASSED'].includes(normalizedDecision)) {
			return '✅';
		}
		if (['BLOCK', 'BLOCKED', 'FAIL', 'FAILED', 'NO-GO'].includes(normalizedDecision)) {
			return '❌';
		}
		return '⚠️';
	}

	/**
	 * Get severity icon
	 */
	protected getSeverityIcon(severity: string): string {
		const severityIcons: Record<string, string> = {
			critical: '🔴',
			high: '🟠',
			low: '🟢',
			medium: '🟡'
		};
		return severityIcons[severity.toLowerCase()] ?? '○';
	}

	/**
	 * Truncate text with ellipsis
	 */
	protected truncate(text: string, maxLength: number): string {
		return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
	}

	/**
	 * Display a list with optional limit
	 */
	protected displayList<T>(
		items: T[],
		formatter: (item: T) => string,
		options: { indent?: string; limit?: number } = {}
	): void {
		const { indent = '   ', limit = 5 } = options;
		const displayItems = items.slice(0, limit);

		for (const item of displayItems) {
			this.console.print(`${indent}• ${formatter(item)}`);
		}

		if (items.length > limit) {
			this.console.print(`${indent}... and ${items.length - limit} more`);
		}
	}

	/**
	 * Safely extract string from outputs
	 */
	protected getString(outputs: Record<string, unknown>, key: string): string | undefined {
		const value = outputs[key];
		return typeof value === 'string' ? value : undefined;
	}

	/**
	 * Safely extract number from outputs
	 */
	protected getNumber(outputs: Record<string, unknown>, key: string): number | undefined {
		const value = outputs[key];
		return typeof value === 'number' ? value : undefined;
	}

	/**
	 * Safely extract array from outputs
	 */
	protected getArray<T>(outputs: Record<string, unknown>, key: string): T[] | undefined {
		const value = outputs[key];
		return Array.isArray(value) ? (value as T[]) : undefined;
	}

	/**
	 * Safely extract object from outputs
	 */
	protected getObject<T>(outputs: Record<string, unknown>, key: string): T | undefined {
		const value = outputs[key];
		return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : undefined;
	}
}
