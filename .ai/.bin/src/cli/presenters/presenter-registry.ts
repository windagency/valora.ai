/**
 * Presenter Registry - Manages command-specific presenters
 *
 * Implements Open/Closed Principle: new presenters can be added
 * without modifying existing code.
 */

import type { ConsoleOutput } from 'output/console-output';
import type { MarkdownRenderer } from 'output/markdown';

import type { CommandPresenter } from './base-presenter';

import { AssertPresenter } from './assert-presenter';
import { FeedbackPresenter } from './feedback-presenter';
import { FetchTaskPresenter } from './fetch-task-presenter';
import { ImplementationPresenter } from './implementation-presenter';
import { ReviewCodePresenter } from './review-code-presenter';
import { ReviewPlanPresenter } from './review-plan-presenter';

/**
 * Factory function type for creating presenters
 */
type PresenterFactory = (console: ConsoleOutput, renderer: MarkdownRenderer) => CommandPresenter;

/**
 * Registry for command-specific presenters
 */
export class PresenterRegistry {
	private readonly cache: Map<string, CommandPresenter> = new Map();
	private readonly console: ConsoleOutput;
	private readonly factories: Map<string, PresenterFactory> = new Map();
	private readonly renderer: MarkdownRenderer;

	constructor(console: ConsoleOutput, renderer: MarkdownRenderer) {
		this.console = console;
		this.renderer = renderer;
		this.registerDefaultPresenters();
	}

	/**
	 * Register default command presenters
	 */
	private registerDefaultPresenters(): void {
		this.register('implement', (c, r) => new ImplementationPresenter(c, r));
		this.register('review-plan', (c, r) => new ReviewPlanPresenter(c, r));
		this.register('assert', (c, r) => new AssertPresenter(c, r));
		this.register('review-code', (c, r) => new ReviewCodePresenter(c, r));
		this.register('fetch-task', (c, r) => new FetchTaskPresenter(c, r));
		this.register('feedback', (c, r) => new FeedbackPresenter(c, r));
	}

	/**
	 * Register a presenter factory for a command
	 */
	register(commandName: string, factory: PresenterFactory): void {
		this.factories.set(commandName, factory);
		// Clear cache when registering new factory
		this.cache.delete(commandName);
	}

	/**
	 * Check if a presenter exists for a command
	 */
	has(commandName: string): boolean {
		return this.factories.has(commandName);
	}

	/**
	 * Get the presenter for a command
	 * Returns undefined if no presenter is registered
	 */
	get(commandName: string): CommandPresenter | undefined {
		// Check cache first
		const cached = this.cache.get(commandName);
		if (cached) {
			return cached;
		}

		// Create new presenter from factory
		const factory = this.factories.get(commandName);
		if (!factory) {
			return undefined;
		}

		const presenter = factory(this.console, this.renderer);
		this.cache.set(commandName, presenter);
		return presenter;
	}

	/**
	 * Display command summary using the appropriate presenter
	 * Returns true if a presenter was found and used
	 */
	displaySummary(commandName: string, outputs: Record<string, unknown>): boolean {
		const presenter = this.get(commandName);
		if (!presenter) {
			return false;
		}

		presenter.display(outputs);
		return true;
	}

	/**
	 * Get list of registered command names
	 */
	getRegisteredCommands(): string[] {
		return Array.from(this.factories.keys());
	}
}
