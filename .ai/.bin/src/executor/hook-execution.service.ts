/**
 * Hook Execution Service
 *
 * Intercepts tool calls before (PreToolUse) and after (PostToolUse) execution,
 * running user-configured shell commands that can validate, block, modify, or
 * observe tool operations.
 *
 * Hooks are configured in .ai/hooks.json (primary) or .ai/config.json (fallback).
 * Hook commands receive tool call info via stdin JSON and control execution
 * via exit codes (0=allow, 2=deny for PreToolUse; PostToolUse is non-blocking).
 */

import type {
	HookCommand,
	HookEventName,
	HookExecutionResult,
	HookInput,
	HookMatcher,
	HookOutput,
	HooksConfig
} from 'types/hook.types';
import type { LLMToolCall } from 'types/llm.types';

import { exec } from 'child_process';
import { HOOKS_CONFIG_FILE } from 'config/constants';
import { getConfigLoader } from 'config/loader';
import fs from 'fs';
import { getLogger } from 'output/logger';
import { getPipelineEmitter } from 'output/pipeline-emitter';
import path from 'path';
import { formatErrorMessage } from 'utils/error-utils';
import { getAIRoot } from 'utils/file-utils';
import { checkReDoSRisk, safeRegexTest } from 'utils/safe-regex';

const DEFAULT_HOOK_TIMEOUT_MS = 10_000;

export class HookExecutionService {
	private hooksFileCache: null | { hooks?: HooksConfig } = null;
	private hooksFileMtime: number = 0;
	private readonly logger = getLogger();
	private sessionId?: string;

	/**
	 * Fast check to skip processing when no hooks are configured.
	 * Returns false for zero-overhead path when hooks are not in use.
	 */
	hasHooks(eventName: HookEventName): boolean {
		const config = this.getHooksConfig();
		if (!config) {
			return false;
		}
		const matchers = config[eventName];
		return Array.isArray(matchers) && matchers.length > 0;
	}

	/**
	 * Set the session ID included in hook input payloads.
	 */
	setSessionId(sessionId: string): void {
		this.sessionId = sessionId;
	}

	/**
	 * Execute PreToolUse hooks for a tool call.
	 * Hooks can block execution (exit code 2) or modify tool input (exit code 0 with updatedInput).
	 * Hooks execute sequentially; first deny stops the chain.
	 */
	async executePreToolUseHooks(toolCall: LLMToolCall): Promise<HookExecutionResult> {
		const result: HookExecutionResult = {
			allowed: true,
			errors: [],
			hooksExecuted: 0
		};

		const config = this.getHooksConfig();
		if (!config?.PreToolUse) {
			return result;
		}

		const matchingHooks = this.findMatchingHooks(toolCall.name, config.PreToolUse);
		if (matchingHooks.length === 0) {
			return result;
		}

		const input = this.buildHookInput('PreToolUse', toolCall);
		const emitter = getPipelineEmitter();

		for (const hook of matchingHooks) {
			emitter.emitToolHookTriggered({
				eventName: 'PreToolUse',
				hookCommand: hook.command,
				toolName: toolCall.name
			});

			const blocked = await this.runPreToolUseHook(hook, input, result, toolCall.name, emitter);
			if (blocked) {
				return result;
			}
		}

		return result;
	}

	/**
	 * Run a single PreToolUse hook and apply its result.
	 * Returns true if the hook blocked execution (deny).
	 */
	private async runPreToolUseHook(
		hook: HookCommand,
		input: HookInput,
		result: HookExecutionResult,
		toolName: string,
		emitter: ReturnType<typeof getPipelineEmitter>
	): Promise<boolean> {
		try {
			const { exitCode, stderr, stdout } = await this.executeHookCommand(hook, input);
			result.hooksExecuted++;

			if (exitCode === 2) {
				return this.handlePreToolUseDeny(stdout, stderr, result, toolName, emitter);
			}

			if (exitCode === 0) {
				this.handlePreToolUseAllow(stdout, input, result);
			} else {
				this.logger.warn(`PreToolUse hook exited with code ${exitCode}, allowing (fail-open)`, {
					command: hook.command,
					stderr: stderr.trim()
				});
				result.errors.push(`Hook "${hook.command}" exited with code ${exitCode}`);
			}
		} catch (error) {
			const errorMsg = formatErrorMessage(error);
			this.logger.warn(`PreToolUse hook error, allowing (fail-open)`, {
				command: hook.command,
				error: errorMsg
			});
			result.errors.push(`Hook "${hook.command}" error: ${errorMsg}`);
			result.hooksExecuted++;
		}
		return false;
	}

	/**
	 * Handle a PreToolUse hook deny (exit code 2).
	 */
	private handlePreToolUseDeny(
		stdout: string,
		stderr: string,
		result: HookExecutionResult,
		toolName: string,
		emitter: ReturnType<typeof getPipelineEmitter>
	): boolean {
		const parsed = this.parseHookOutput(stdout);
		const reason =
			parsed?.hookSpecificOutput?.permissionDecisionReason ?? (stderr.trim() || 'Blocked by PreToolUse hook');

		result.allowed = false;
		result.blockReason = reason;

		emitter.emitToolHookBlocked({ reason, toolName });
		return true;
	}

	/**
	 * Handle a PreToolUse hook allow (exit code 0), applying any updatedInput.
	 */
	private handlePreToolUseAllow(stdout: string, input: HookInput, result: HookExecutionResult): void {
		const parsed = this.parseHookOutput(stdout);
		if (parsed?.hookSpecificOutput?.updatedInput) {
			result.updatedArgs = {
				...result.updatedArgs,
				...parsed.hookSpecificOutput.updatedInput
			};
			input.tool_input = { ...input.tool_input, ...parsed.hookSpecificOutput.updatedInput };
		}
	}

	/**
	 * Execute PostToolUse hooks for a tool call (non-blocking, informational only).
	 * Exit codes are logged but never block the pipeline.
	 * Async hooks fire-and-forget without awaiting completion.
	 */
	async executePostToolUseHooks(toolCall: LLMToolCall, toolResult: string): Promise<void> {
		const config = this.getHooksConfig();
		if (!config?.PostToolUse) {
			return;
		}

		const matchingHooks = this.findMatchingHooks(toolCall.name, config.PostToolUse);
		if (matchingHooks.length === 0) {
			return;
		}

		const input = this.buildHookInput('PostToolUse', toolCall, toolResult);
		const emitter = getPipelineEmitter();

		for (const hook of matchingHooks) {
			emitter.emitToolHookTriggered({
				eventName: 'PostToolUse',
				hookCommand: hook.command,
				toolName: toolCall.name
			});

			if (hook.async) {
				// Fire-and-forget
				this.executeHookCommand(hook, input)
					.then(({ exitCode }) => {
						emitter.emitToolHookPost({
							hookCommand: hook.command,
							success: exitCode === 0,
							toolName: toolCall.name
						});
					})
					.catch((err) => {
						this.logger.warn('PostToolUse async hook error', {
							command: hook.command,
							error: formatErrorMessage(err)
						});
						emitter.emitToolHookPost({
							hookCommand: hook.command,
							success: false,
							toolName: toolCall.name
						});
					});
			} else {
				try {
					const { exitCode } = await this.executeHookCommand(hook, input);
					emitter.emitToolHookPost({
						hookCommand: hook.command,
						success: exitCode === 0,
						toolName: toolCall.name
					});

					if (exitCode !== 0) {
						this.logger.warn(`PostToolUse hook exited with code ${exitCode}`, {
							command: hook.command
						});
					}
				} catch (error) {
					this.logger.warn('PostToolUse hook error', {
						command: hook.command,
						error: formatErrorMessage(error)
					});
					emitter.emitToolHookPost({
						hookCommand: hook.command,
						success: false,
						toolName: toolCall.name
					});
				}
			}
		}
	}

	/**
	 * Spawn a shell command, writing JSON to stdin.
	 * Returns the exit code, stdout, and stderr.
	 */
	executeHookCommand(
		hook: HookCommand,
		input: HookInput
	): Promise<{ exitCode: number; stderr: string; stdout: string }> {
		const timeout = hook.timeout ?? DEFAULT_HOOK_TIMEOUT_MS;
		const inputJson = JSON.stringify(input);

		return new Promise((resolve, reject) => {
			const child = exec(hook.command, { cwd: input.cwd, timeout }, (error, stdout, stderr) => {
				if (error && 'killed' in error && error.killed) {
					// Timeout
					reject(new Error(`Hook command timed out after ${timeout}ms: ${hook.command}`));
					return;
				}

				// exec error with exit code is not a fatal error — the hook ran but exited non-zero
				const exitCode = error?.code ?? 0;
				resolve({
					exitCode: typeof exitCode === 'number' ? exitCode : 1,
					stderr: stderr ?? '',
					stdout: stdout ?? ''
				});
			});

			// Write input JSON to stdin
			if (child.stdin) {
				child.stdin.on('error', () => {
					// Ignore EPIPE errors — the process may exit before reading stdin
				});
				child.stdin.write(inputJson);
				child.stdin.end();
			}
		});
	}

	/**
	 * Test regex matchers against tool name and collect matching hook commands.
	 * Invalid regexes are skipped with a warning (graceful degradation).
	 */
	findMatchingHooks(toolName: string, matchers: HookMatcher[]): HookCommand[] {
		const hooks: HookCommand[] = [];

		for (const matcher of matchers) {
			try {
				const risk = checkReDoSRisk(matcher.matcher);
				if (!risk.safe) {
					this.logger.warn(`Skipping hook matcher with ReDoS risk: "${matcher.matcher}"`, {
						reason: risk.reason
					});
					continue;
				}

				const regex = new RegExp(matcher.matcher);
				if (safeRegexTest(regex, toolName)) {
					hooks.push(...matcher.hooks);
				}
			} catch (error) {
				this.logger.warn(`Invalid regex in hook matcher: "${matcher.matcher}"`, {
					error: formatErrorMessage(error)
				});
			}
		}

		return hooks;
	}

	/**
	 * Safely parse JSON output from a hook command's stdout.
	 * Returns null if stdout is empty or not valid JSON.
	 */
	parseHookOutput(stdout: string): HookOutput | null {
		const trimmed = stdout.trim();
		if (!trimmed) {
			return null;
		}

		try {
			return JSON.parse(trimmed) as HookOutput;
		} catch {
			return null;
		}
	}

	/**
	 * Load hooks from .ai/hooks.json with mtime-based caching.
	 * Returns null if the file doesn't exist or can't be parsed.
	 */
	private loadHooksFile(): null | { hooks?: HooksConfig } {
		try {
			const hooksPath = path.join(getAIRoot(), HOOKS_CONFIG_FILE);
			const stat = fs.statSync(hooksPath);
			const mtime = stat.mtimeMs;

			if (this.hooksFileCache && mtime === this.hooksFileMtime) {
				return this.hooksFileCache;
			}

			const content = fs.readFileSync(hooksPath, 'utf-8');
			const parsed = JSON.parse(content) as { hooks?: HooksConfig };
			this.hooksFileCache = parsed;
			this.hooksFileMtime = mtime;
			return parsed;
		} catch {
			// File missing or invalid — no hooks from hooks.json
			return null;
		}
	}

	/**
	 * Read hooks config, merging .ai/hooks.json (primary) with config.json (fallback).
	 * For each event name, hooks.json matchers come first; duplicates by matcher pattern
	 * are resolved in favour of hooks.json.
	 */
	private getHooksConfig(): HooksConfig | undefined {
		const hooksFromFile = this.loadHooksFile()?.hooks;

		let hooksFromConfig: HooksConfig | undefined;
		try {
			hooksFromConfig = getConfigLoader().get().hooks as HooksConfig | undefined;
		} catch {
			// Config not yet loaded
		}

		if (hooksFromFile && hooksFromConfig) {
			return this.mergeHooksConfigs(hooksFromFile, hooksFromConfig);
		}

		return hooksFromFile ?? hooksFromConfig;
	}

	/**
	 * Merge two HooksConfig objects. Primary (hooks.json) takes priority;
	 * config.json matchers with the same pattern are skipped.
	 */
	private mergeHooksConfigs(primary: HooksConfig, fallback: HooksConfig): HooksConfig | undefined {
		const merged: HooksConfig = {};
		const eventNames = new Set([...Object.keys(fallback), ...Object.keys(primary)]) as Set<HookEventName>;

		for (const eventName of eventNames) {
			const primaryMatchers = (primary as Record<string, HookMatcher[]>)[eventName] ?? [];
			const fallbackMatchers = (fallback as Record<string, HookMatcher[]>)[eventName] ?? [];

			const primaryPatterns = new Set(primaryMatchers.map((m) => m.matcher));
			const deduped = [...primaryMatchers, ...fallbackMatchers.filter((m) => !primaryPatterns.has(m.matcher))];

			if (deduped.length > 0) {
				merged[eventName] = deduped;
			}
		}

		return Object.keys(merged).length > 0 ? merged : undefined;
	}

	/**
	 * Build the HookInput object sent to hook commands via stdin.
	 */
	private buildHookInput(eventName: HookEventName, toolCall: LLMToolCall, toolResult?: string): HookInput {
		const input: HookInput = {
			cwd: process.cwd(),
			hook_event_name: eventName,
			session_id: this.sessionId,
			tool_input: (toolCall.arguments ?? {}) as Record<string, unknown>,
			tool_name: toolCall.name
		};

		if (toolResult !== undefined) {
			input.tool_result = toolResult;
		}

		return input;
	}
}

// Singleton instance
let hookExecutionService: HookExecutionService | null = null;

export function getHookExecutionService(): HookExecutionService {
	hookExecutionService ??= new HookExecutionService();
	return hookExecutionService;
}

export function setHookExecutionService(service: HookExecutionService): void {
	hookExecutionService = service;
}
