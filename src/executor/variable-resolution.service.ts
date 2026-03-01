/**
 * Variable Resolution Service - Decoupled variable resolution logic
 *
 * This service separates variable resolution concerns from execution context,
 * implementing proper dependency injection and single responsibility principle.
 *
 * The service is responsible for:
 * - Resolving variables ($ARG_*, $STAGE_*, $CONTEXT_*, $ENV_*)
 * - Managing variable context state
 * - Validating variable references
 */

import { type VariableContext, VariableResolver, type VariableScope } from './variables';

export interface VariableDefinition {
	full: string;
	path: string;
	scope: VariableScope;
}

export interface VariableResolutionOptions {
	strict?: boolean;
}

/**
 * Variable Resolution Service - Handles all variable resolution logic
 *
 * This service encapsulates variable resolution logic, making it injectable
 * and testable independently of execution context.
 */
export class VariableResolutionService {
	private resolver: VariableResolver;

	constructor(context: VariableContext, options: VariableResolutionOptions = {}) {
		this.resolver = new VariableResolver(context, options.strict ?? true);
	}

	/**
	 * Resolve all variables in a value (string, object, or array)
	 */
	resolve<T>(value: T): T {
		return this.resolver.resolve(value);
	}

	/**
	 * Resolve a single variable by scope and path
	 */
	resolveVariable(scope: VariableScope, path: string): unknown {
		// Use the private method from VariableResolver via a wrapper
		return this.resolver['resolveVariable'](scope, path);
	}

	/**
	 * Validate that all variables in a value can be resolved
	 */
	validateVariables(value: unknown): string[] {
		return this.resolver.validateVariables(value);
	}

	/**
	 * Update the variable context with new values
	 */
	updateContext(updates: Partial<VariableContext>): void {
		this.resolver.updateContext(updates);
	}

	/**
	 * Add stage outputs to the context
	 */
	addStageOutputs(stageName: string, outputs: Record<string, unknown>): void {
		this.resolver.addStageOutputs(stageName, outputs);
	}

	/**
	 * Get the current variable context
	 */
	getContext(): VariableContext {
		return this.resolver.getContext();
	}

	/**
	 * Extract variable references from a string
	 */
	static extractVariables(str: string): VariableDefinition[] {
		const variables = VariableResolver.extractVariables(str);
		return variables.map((v) => ({
			full: v.full,
			path: v.path,
			scope: v.scope as VariableScope
		}));
	}

	/**
	 * Check if a string contains variables
	 */
	static hasVariables(str: string): boolean {
		return VariableResolver.hasVariables(str);
	}

	/**
	 * Create a new VariableResolutionService with initial context
	 */
	static createWithContext(
		args: Record<string, unknown> = {},
		stages: Record<string, Record<string, unknown>> = {},
		sessionContext: Record<string, unknown> = {},
		options: VariableResolutionOptions = {}
	): VariableResolutionService {
		// Convert process.env to the expected Record<string, string> format
		const env = Object.entries(process.env).reduce(
			(acc, [key, value]) => {
				if (value !== undefined) {
					acc[key] = value;
				}
				return acc;
			},
			{} as Record<string, string>
		);

		const context: VariableContext = {
			args,
			context: sessionContext,
			env,
			stages
		};

		return new VariableResolutionService(context, options);
	}

	/**
	 * Export stage outputs for session storage
	 * Allows persisting stage outputs between commands in the same session
	 */
	exportStageOutputs(): Record<string, Record<string, unknown>> {
		const context = this.resolver.getContext();
		return { ...context.stages };
	}

	/**
	 * Import stage outputs from a previous session
	 * Allows resuming with access to previous command outputs
	 */
	importStageOutputs(stages: Record<string, Record<string, unknown>>): void {
		for (const [stageName, outputs] of Object.entries(stages)) {
			this.resolver.addStageOutputs(stageName, outputs);
		}
	}
}
