/**
 * Variable resolver - resolves $ARG_*, $STAGE_*, $CONTEXT_* placeholders
 */

import { ValidationError } from 'utils/error-handler';

export interface VariableContext {
	args: Record<string, unknown>;
	context: Record<string, unknown>;
	env?: Record<string, string>;
	stages: Record<string, Record<string, unknown>>;
}

export type VariableScope = 'ARG' | 'CONTEXT' | 'ENV' | 'STAGE';

export class VariableResolver {
	private context: VariableContext;
	private strict: boolean;

	constructor(context: VariableContext, strict = true) {
		this.context = context;
		this.strict = strict;
	}

	/**
	 * Resolve all variables in a value (string, object, or array)
	 */
	resolve<T>(value: T): T {
		if (typeof value === 'string') {
			return this.resolveString(value) as T;
		}
		if (Array.isArray(value)) {
			return value.map((item: unknown) => this.resolve(item)) as T;
		}
		if (typeof value === 'object' && value !== null) {
			return this.resolveObject(value) as T;
		}
		return value;
	}

	/**
	 * Resolve variables in a string
	 */
	private resolveString(str: string): string {
		// Match $SCOPE_path or $SCOPE_path.nested.property
		// Note: supports hyphens in argument names for CLI flags like --concept-file
		const variablePattern = /\$([A-Z]+)_([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)/g;

		return str.replace(variablePattern, (match, scope: string, path: string) => {
			try {
				const value = this.resolveVariable(scope as VariableScope, path);
				return this.valueToString(value);
			} catch (error) {
				if (this.strict) {
					throw error;
				}
				// In non-strict mode, leave unresolved variables as-is
				return match;
			}
		});
	}

	/**
	 * Resolve variables in an object
	 */
	private resolveObject(obj: object): Record<string, unknown> {
		return Object.entries(obj).reduce(
			(acc, [key, value]) => {
				acc[key] = this.resolve(value);
				return acc;
			},
			{} as Record<string, unknown>
		);
	}

	/**
	 * Resolve a single variable
	 */
	private resolveVariable(scope: VariableScope, path: string): unknown {
		// Map scope to resolver method
		const scopeResolverMap = new Map<VariableScope, () => unknown>([
			['ARG', () => this.resolveArg(path)],
			['CONTEXT', () => this.resolveContext(path)],
			['ENV', () => this.resolveEnv(path)],
			['STAGE', () => this.resolveStage(path)]
		]);

		const resolver = scopeResolverMap.get(scope);
		if (!resolver) {
			throw new ValidationError(`Unknown variable scope: ${scope}`, {
				path,
				scope
			});
		}

		return resolver();
	}

	/**
	 * Resolve argument variable ($ARG_name)
	 */
	private resolveArg(path: string): unknown {
		// Handle positional args like $ARG_1, $ARG_2
		if (/^\d+$/.test(path)) {
			const index = parseInt(path, 10);
			const value = this.context.args[index.toString()];
			if (value === undefined) {
				// Return 'Not specified' for optional positional arguments
				// consistent with named argument handling in resolvePath
				return 'Not specified';
			}
			return value;
		}

		// Handle named args
		const value = this.resolvePath(this.context.args, path, `$ARG_${path}`);
		return value;
	}

	/**
	 * Resolve nested path in an object
	 */
	private resolvePath(obj: Record<string, unknown>, path: string, fullVariable: string): unknown {
		const parts = path.split('.');

		return parts.reduce((current: unknown, part: string) => {
			if (typeof current !== 'object' || current === null) {
				throw new ValidationError(`Cannot access property ${part} on non-object`, {
					path,
					variable: fullVariable
				});
			}

			// Safe access to the property
			const next = (current as Record<string, unknown>)[part];

			if (next === undefined) {
				// Special handling for optional arguments and context variables
				if (fullVariable.startsWith('$ARG_') || fullVariable.startsWith('$CONTEXT_')) {
					return 'Not specified';
				}

				// Enhanced error message for stage outputs with recovery suggestions
				const availableKeys =
					typeof current === 'object' && current !== null ? Object.keys(current as Record<string, unknown>) : [];

				// For stage outputs, provide more context about potential LLM parsing issues
				if (fullVariable.startsWith('$STAGE_')) {
					throw new ValidationError(
						`Stage output property not found: ${part}. This may indicate the LLM response was incomplete or malformed. ` +
							`Available properties: ${availableKeys.length > 0 ? availableKeys.join(', ') : 'none'}`,
						{
							availableKeys,
							path,
							suggestion:
								'The LLM may not have provided all required outputs. Consider re-running the command or adjusting the prompt.',
							variable: fullVariable
						}
					);
				}

				throw new ValidationError(`Property not found: ${part}`, {
					availableKeys,
					path,
					variable: fullVariable
				});
			}

			return next;
		}, obj);
	}

	/**
	 * Resolve stage variable ($STAGE_stageName.outputName)
	 * Returns null for missing stages (e.g., skipped due to conditional)
	 */
	private resolveStage(path: string): unknown {
		const [stageName, ...rest] = path.split('.');

		if (!stageName) {
			throw new ValidationError('Stage name is required', {
				variable: `$STAGE_${path}`
			});
		}

		const stageOutputs = this.context.stages[stageName];
		if (!stageOutputs) {
			// Return null for missing stages (e.g., skipped due to conditional)
			// This allows downstream stages to handle skipped stages gracefully
			return null;
		}

		if (rest.length === 0) {
			return stageOutputs;
		}

		return this.resolvePath(stageOutputs, rest.join('.'), `$STAGE_${path}`);
	}

	/**
	 * Resolve context variable ($CONTEXT_key)
	 */
	private resolveContext(path: string): unknown {
		return this.resolvePath(this.context.context, path, `$CONTEXT_${path}`);
	}

	/**
	 * Resolve environment variable ($ENV_NAME)
	 */
	private resolveEnv(path: string): unknown {
		const envVars = this.context.env ?? process.env;
		const value = envVars[path];

		if (value === undefined) {
			throw new ValidationError(`Environment variable not found: ${path}`, {
				variable: `$ENV_${path}`
			});
		}

		return value;
	}

	/**
	 * Convert value to string for replacement
	 */
	private valueToString(value: unknown): string {
		if (value === null || value === undefined) {
			return '';
		}

		if (typeof value === 'string') {
			return value;
		}

		if (typeof value === 'number' || typeof value === 'boolean') {
			return value.toString();
		}

		if (typeof value === 'object') {
			return JSON.stringify(value);
		}

		return String(value);
	}

	/**
	 * Update context with new values
	 */
	updateContext(updates: Partial<VariableContext>): void {
		if (updates.args) {
			this.context.args = { ...this.context.args, ...updates.args };
		}
		if (updates.stages) {
			this.context.stages = { ...this.context.stages, ...updates.stages };
		}
		if (updates.context) {
			this.context.context = { ...this.context.context, ...updates.context };
		}
		if (updates.env) {
			this.context.env = { ...this.context.env, ...updates.env };
		}
	}

	/**
	 * Add stage outputs to context
	 */
	addStageOutputs(stageName: string, outputs: Record<string, unknown>): void {
		this.context.stages[stageName] = outputs;
	}

	/**
	 * Get current context
	 */
	getContext(): VariableContext {
		return this.context;
	}

	/**
	 * Extract variable references from a string
	 */
	static extractVariables(str: string): Array<{ full: string; path: string; scope: string }> {
		const variablePattern = /\$([A-Z]+)_([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)/g;
		const variables: Array<{ full: string; path: string; scope: string }> = [];
		let match;

		while ((match = variablePattern.exec(str)) !== null) {
			const fullMatch = match[0];
			const scopeMatch = match[1];
			const pathMatch = match[2];

			if (fullMatch && scopeMatch && pathMatch) {
				variables.push({
					full: fullMatch,
					path: pathMatch,
					scope: scopeMatch
				});
			}
		}

		return variables;
	}

	/**
	 * Check if a string contains any variables
	 */
	static hasVariables(str: string): boolean {
		return /\$[A-Z]+_[a-zA-Z0-9_-]+/.test(str);
	}

	/**
	 * Validate that all required variables can be resolved
	 */
	validateVariables(value: unknown): string[] {
		const errors: string[] = [];

		const validate = (val: unknown, path: string = ''): void => {
			if (typeof val === 'string') {
				const variables = VariableResolver.extractVariables(val);
				const variableErrors = variables
					.map((variable) => {
						try {
							this.resolveVariable(variable.scope as VariableScope, variable.path);
							return null;
						} catch (error) {
							return `${path ? path + ': ' : ''}${(error as Error).message}`;
						}
					})
					.filter((error): error is string => error !== null);

				errors.push(...variableErrors);
			} else if (Array.isArray(val)) {
				val.forEach((item, idx) => validate(item, `${path}[${idx}]`));
			} else if (typeof val === 'object' && val !== null) {
				Object.entries(val).forEach(([key, value]) => {
					validate(value, path ? `${path}.${key}` : key);
				});
			}
		};

		validate(value);
		return errors;
	}
}

/**
 * Helper function to create a variable resolver with common context
 */
export function createVariableResolver(
	args: string[],
	flags: Record<string, boolean | string>,
	stageOutputs: Record<string, Record<string, unknown>> = {},
	sessionContext: Record<string, unknown> = {},
	strict = true
): VariableResolver {
	// Convert positional args to indexed object
	const argsObj = args.reduce(
		(acc, arg, idx) => {
			acc[(idx + 1).toString()] = arg;
			return acc;
		},
		{} as Record<string, unknown>
	);

	// Merge flags into args
	const mergedArgs = Object.entries(flags).reduce((acc, [key, value]) => {
		acc[key] = value;
		return acc;
	}, argsObj);

	const context: VariableContext = {
		args: mergedArgs,
		context: sessionContext,
		stages: stageOutputs
	};

	return new VariableResolver(context, strict);
}
