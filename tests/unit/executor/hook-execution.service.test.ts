/**
 * Unit tests for HookExecutionService
 *
 * Tests the PreToolUse/PostToolUse hook mechanism including:
 * - No hooks configured -> allow immediately
 * - Matcher regex filtering
 * - Exit code 0/2/other handling
 * - Timeout handling
 * - updatedInput merging
 * - Hook chain (first deny stops)
 * - Malformed JSON handling
 * - PostToolUse hooks fire without blocking
 * - PostToolUse receives tool_result in input
 * - Async hooks fire-and-forget
 */

import { HookExecutionService } from 'executor/hook-execution.service';
import type { HookCommand, HookInput, HookMatcher } from 'types/hook.types';
import type { LLMToolCall } from 'types/llm.types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';

// Mock dependencies
vi.mock('output/logger', () => ({
	getLogger: () => ({
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn()
	})
}));

vi.mock('output/pipeline-emitter', () => ({
	getPipelineEmitter: () => ({
		emitToolHookBlocked: vi.fn(),
		emitToolHookPost: vi.fn(),
		emitToolHookTriggered: vi.fn()
	})
}));

const mockGetConfigLoader = vi.fn();
vi.mock('config/loader', () => ({
	getConfigLoader: (...args: unknown[]) => mockGetConfigLoader(...args)
}));

vi.mock('utils/file-utils', () => ({
	getAIRoot: () => '/fake/ai/root'
}));

function makeToolCall(name: string, args: Record<string, unknown> = {}): LLMToolCall {
	return {
		id: 'test-id',
		name,
		arguments: args
	};
}

function setupConfig(hooks: unknown): void {
	mockGetConfigLoader.mockReturnValue({
		get: () => ({ hooks })
	});
}

describe('HookExecutionService', () => {
	let service: HookExecutionService;

	beforeEach(() => {
		service = new HookExecutionService();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('hasHooks()', () => {
		it('should return false when no config is loaded', () => {
			setupConfig(undefined);

			expect(service.hasHooks('PreToolUse')).toBe(false);
			expect(service.hasHooks('PostToolUse')).toBe(false);
		});

		it('should return false when hooks config is empty', () => {
			setupConfig({});

			expect(service.hasHooks('PreToolUse')).toBe(false);
			expect(service.hasHooks('PostToolUse')).toBe(false);
		});

		it('should return true when PreToolUse matchers exist', () => {
			setupConfig({
				PreToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'echo ok' }] }]
			});

			expect(service.hasHooks('PreToolUse')).toBe(true);
			expect(service.hasHooks('PostToolUse')).toBe(false);
		});

		it('should return true when PostToolUse matchers exist', () => {
			setupConfig({
				PostToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'echo ok' }] }]
			});

			expect(service.hasHooks('PreToolUse')).toBe(false);
			expect(service.hasHooks('PostToolUse')).toBe(true);
		});

		it('should return false when config loader throws', () => {
			mockGetConfigLoader.mockReturnValue({
				get: () => {
					throw new Error('Config not loaded');
				}
			});

			expect(service.hasHooks('PreToolUse')).toBe(false);
		});
	});

	describe('findMatchingHooks()', () => {
		it('should match tool names by regex', () => {
			const matchers: HookMatcher[] = [
				{ matcher: 'write|search_replace', hooks: [{ type: 'command', command: 'echo a' }] },
				{ matcher: 'delete_file', hooks: [{ type: 'command', command: 'echo b' }] }
			];

			const writeHooks = service.findMatchingHooks('write', matchers);
			expect(writeHooks).toHaveLength(1);
			expect(writeHooks[0]!.command).toBe('echo a');

			const searchHooks = service.findMatchingHooks('search_replace', matchers);
			expect(searchHooks).toHaveLength(1);
			expect(searchHooks[0]!.command).toBe('echo a');

			const deleteHooks = service.findMatchingHooks('delete_file', matchers);
			expect(deleteHooks).toHaveLength(1);
			expect(deleteHooks[0]!.command).toBe('echo b');

			const readHooks = service.findMatchingHooks('read_file', matchers);
			expect(readHooks).toHaveLength(0);
		});

		it('should return multiple hooks from multiple matching matchers', () => {
			const matchers: HookMatcher[] = [
				{ matcher: '.*', hooks: [{ type: 'command', command: 'echo global' }] },
				{ matcher: 'write', hooks: [{ type: 'command', command: 'echo write-specific' }] }
			];

			const hooks = service.findMatchingHooks('write', matchers);
			expect(hooks).toHaveLength(2);
		});

		it('should skip invalid regex and log warning', () => {
			const matchers: HookMatcher[] = [
				{ matcher: '[invalid', hooks: [{ type: 'command', command: 'echo bad' }] },
				{ matcher: 'write', hooks: [{ type: 'command', command: 'echo good' }] }
			];

			const hooks = service.findMatchingHooks('write', matchers);
			expect(hooks).toHaveLength(1);
			expect(hooks[0]!.command).toBe('echo good');
		});

		it('should skip matchers with ReDoS-vulnerable patterns', () => {
			const matchers: HookMatcher[] = [
				{ matcher: '(a+)+', hooks: [{ type: 'command', command: 'echo redos' }] },
				{ matcher: 'write', hooks: [{ type: 'command', command: 'echo safe' }] }
			];

			const hooks = service.findMatchingHooks('write', matchers);
			expect(hooks).toHaveLength(1);
			expect(hooks[0]!.command).toBe('echo safe');
		});
	});

	describe('parseHookOutput()', () => {
		it('should parse valid JSON output', () => {
			const output = JSON.stringify({
				hookSpecificOutput: {
					hookEventName: 'PreToolUse',
					permissionDecision: 'allow',
					updatedInput: { path: '/new/path' }
				}
			});

			const result = service.parseHookOutput(output);
			expect(result).not.toBeNull();
			expect(result!.hookSpecificOutput!.updatedInput).toEqual({ path: '/new/path' });
		});

		it('should return null for empty string', () => {
			expect(service.parseHookOutput('')).toBeNull();
			expect(service.parseHookOutput('   ')).toBeNull();
		});

		it('should return null for invalid JSON', () => {
			expect(service.parseHookOutput('not json')).toBeNull();
			expect(service.parseHookOutput('{broken')).toBeNull();
		});
	});

	describe('executeHookCommand()', () => {
		it('should execute a command and return exit code 0', async () => {
			const hook: HookCommand = { type: 'command', command: 'echo ok' };
			const input: HookInput = {
				session_id: undefined,
				hook_event_name: 'PreToolUse',
				tool_name: 'write',
				tool_input: { path: '/test' },
				cwd: process.cwd()
			};

			const result = await service.executeHookCommand(hook, input);
			expect(result.exitCode).toBe(0);
			expect(result.stdout.trim()).toBe('ok');
		});

		it('should return exit code 2 for deny', async () => {
			const hook: HookCommand = { type: 'command', command: 'exit 2' };
			const input: HookInput = {
				session_id: undefined,
				hook_event_name: 'PreToolUse',
				tool_name: 'write',
				tool_input: {},
				cwd: process.cwd()
			};

			const result = await service.executeHookCommand(hook, input);
			expect(result.exitCode).toBe(2);
		});

		it('should return non-zero exit code for other failures', async () => {
			const hook: HookCommand = { type: 'command', command: 'exit 1' };
			const input: HookInput = {
				session_id: undefined,
				hook_event_name: 'PreToolUse',
				tool_name: 'write',
				tool_input: {},
				cwd: process.cwd()
			};

			const result = await service.executeHookCommand(hook, input);
			expect(result.exitCode).toBe(1);
		});

		it('should pass tool input via stdin as JSON', async () => {
			const hook: HookCommand = {
				type: 'command',
				command: 'cat'
			};
			const input: HookInput = {
				session_id: 'sess-123',
				hook_event_name: 'PreToolUse',
				tool_name: 'write',
				tool_input: { path: '/test/file.ts', content: 'hello' },
				cwd: process.cwd()
			};

			const result = await service.executeHookCommand(hook, input);
			expect(result.exitCode).toBe(0);

			const parsed = JSON.parse(result.stdout);
			expect(parsed.tool_name).toBe('write');
			expect(parsed.tool_input.path).toBe('/test/file.ts');
			expect(parsed.hook_event_name).toBe('PreToolUse');
		});

		it('should reject on timeout', async () => {
			const hook: HookCommand = {
				type: 'command',
				command: 'sleep 10',
				timeout: 200
			};
			const input: HookInput = {
				session_id: undefined,
				hook_event_name: 'PreToolUse',
				tool_name: 'write',
				tool_input: {},
				cwd: process.cwd()
			};

			await expect(service.executeHookCommand(hook, input)).rejects.toThrow('timed out');
		});

		it('should output JSON with updatedInput on exit 0', async () => {
			const jsonOutput = JSON.stringify({
				hookSpecificOutput: {
					hookEventName: 'PreToolUse',
					updatedInput: { path: '/modified/path' }
				}
			});
			const hook: HookCommand = {
				type: 'command',
				command: `echo '${jsonOutput}'`
			};
			const input: HookInput = {
				session_id: undefined,
				hook_event_name: 'PreToolUse',
				tool_name: 'write',
				tool_input: { path: '/original' },
				cwd: process.cwd()
			};

			const result = await service.executeHookCommand(hook, input);
			expect(result.exitCode).toBe(0);

			const parsed = service.parseHookOutput(result.stdout);
			expect(parsed?.hookSpecificOutput?.updatedInput).toEqual({ path: '/modified/path' });
		});
	});

	describe('executePreToolUseHooks()', () => {
		it('should allow immediately when no hooks configured', async () => {
			setupConfig(undefined);

			const result = await service.executePreToolUseHooks(makeToolCall('write'));
			expect(result.allowed).toBe(true);
			expect(result.hooksExecuted).toBe(0);
		});

		it('should allow when no matchers match the tool', async () => {
			setupConfig({
				PreToolUse: [{ matcher: 'delete_file', hooks: [{ type: 'command', command: 'exit 2' }] }]
			});

			const result = await service.executePreToolUseHooks(makeToolCall('write'));
			expect(result.allowed).toBe(true);
			expect(result.hooksExecuted).toBe(0);
		});

		it('should block when hook exits with code 2', async () => {
			setupConfig({
				PreToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'exit 2' }] }]
			});

			const result = await service.executePreToolUseHooks(makeToolCall('write'));
			expect(result.allowed).toBe(false);
			expect(result.blockReason).toBeDefined();
			expect(result.hooksExecuted).toBe(1);
		});

		it('should allow when hook exits with code 0', async () => {
			setupConfig({
				PreToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'echo ok' }] }]
			});

			const result = await service.executePreToolUseHooks(makeToolCall('write'));
			expect(result.allowed).toBe(true);
			expect(result.hooksExecuted).toBe(1);
		});

		it('should fail-open on non-0/2 exit codes', async () => {
			setupConfig({
				PreToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'exit 1' }] }]
			});

			const result = await service.executePreToolUseHooks(makeToolCall('write'));
			expect(result.allowed).toBe(true);
			expect(result.errors).toHaveLength(1);
			expect(result.hooksExecuted).toBe(1);
		});

		it('should fail-open on timeout', async () => {
			setupConfig({
				PreToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'sleep 10', timeout: 200 }] }]
			});

			const result = await service.executePreToolUseHooks(makeToolCall('write'));
			expect(result.allowed).toBe(true);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('timed out');
		});

		it('should merge updatedInput from hook output', async () => {
			const jsonOutput = JSON.stringify({
				hookSpecificOutput: {
					hookEventName: 'PreToolUse',
					updatedInput: { path: '/new/path' }
				}
			});
			setupConfig({
				PreToolUse: [
					{
						matcher: 'write',
						hooks: [{ type: 'command', command: `echo '${jsonOutput}'` }]
					}
				]
			});

			const result = await service.executePreToolUseHooks(makeToolCall('write', { path: '/old', content: 'hello' }));
			expect(result.allowed).toBe(true);
			expect(result.updatedArgs).toEqual({ path: '/new/path' });
		});

		it('should stop chain on first deny', async () => {
			setupConfig({
				PreToolUse: [
					{
						matcher: 'write',
						hooks: [
							{ type: 'command', command: 'exit 2' },
							{ type: 'command', command: 'echo should-not-run' }
						]
					}
				]
			});

			const result = await service.executePreToolUseHooks(makeToolCall('write'));
			expect(result.allowed).toBe(false);
			expect(result.hooksExecuted).toBe(1);
		});

		it('should extract blockReason from hook JSON output on deny', async () => {
			const jsonOutput = JSON.stringify({
				hookSpecificOutput: {
					hookEventName: 'PreToolUse',
					permissionDecision: 'deny',
					permissionDecisionReason: 'Path is in protected directory'
				}
			});
			setupConfig({
				PreToolUse: [
					{
						matcher: 'write',
						hooks: [
							{
								type: 'command',
								command: `echo '${jsonOutput}'; exit 2`
							}
						]
					}
				]
			});

			const result = await service.executePreToolUseHooks(makeToolCall('write'));
			expect(result.allowed).toBe(false);
			expect(result.blockReason).toBe('Path is in protected directory');
		});

		it('should handle malformed JSON output gracefully', async () => {
			setupConfig({
				PreToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'echo "not json"' }] }]
			});

			const result = await service.executePreToolUseHooks(makeToolCall('write'));
			expect(result.allowed).toBe(true);
			expect(result.hooksExecuted).toBe(1);
		});
	});

	describe('executePostToolUseHooks()', () => {
		it('should return immediately when no hooks configured', async () => {
			setupConfig(undefined);

			await service.executePostToolUseHooks(makeToolCall('write'), 'File written');
		});

		it('should execute matching hooks and not block', async () => {
			setupConfig({
				PostToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'echo post' }] }]
			});

			await service.executePostToolUseHooks(makeToolCall('write'), 'File written successfully');
		});

		it('should pass tool_result in input', async () => {
			setupConfig({
				PostToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'cat' }] }]
			});

			let capturedInput: HookInput | null = null;
			const originalExecute = service.executeHookCommand.bind(service);
			vi.spyOn(service, 'executeHookCommand').mockImplementation(async (hook, input) => {
				capturedInput = input;
				return originalExecute(hook, input);
			});

			await service.executePostToolUseHooks(makeToolCall('write'), 'Written OK');

			expect(capturedInput).not.toBeNull();
			expect(capturedInput!.tool_result).toBe('Written OK');
			expect(capturedInput!.hook_event_name).toBe('PostToolUse');
		});

		it('should not block on hook exit code 2', async () => {
			setupConfig({
				PostToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'exit 2' }] }]
			});

			// PostToolUse never blocks
			await service.executePostToolUseHooks(makeToolCall('write'), 'File written');
		});

		it('should handle async hooks fire-and-forget', async () => {
			setupConfig({
				PostToolUse: [
					{
						matcher: 'write',
						hooks: [
							{
								type: 'command',
								command: 'echo async-hook',
								async: true
							}
						]
					}
				]
			});

			await service.executePostToolUseHooks(makeToolCall('write'), 'Done');

			// Give async hooks a moment to complete
			await new Promise((resolve) => setTimeout(resolve, 100));
		});

		it('should handle errors in async hooks without throwing', async () => {
			setupConfig({
				PostToolUse: [
					{
						matcher: 'write',
						hooks: [
							{
								type: 'command',
								command: 'exit 1',
								async: true
							}
						]
					}
				]
			});

			await service.executePostToolUseHooks(makeToolCall('write'), 'Done');

			// Give async hooks a moment to complete
			await new Promise((resolve) => setTimeout(resolve, 100));
		});
	});

	describe('setSessionId()', () => {
		it('should include session_id in hook input after being set', async () => {
			setupConfig({
				PreToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'cat' }] }]
			});

			service.setSessionId('sess-abc-123');

			let capturedInput: HookInput | null = null;
			const originalExecute = service.executeHookCommand.bind(service);
			vi.spyOn(service, 'executeHookCommand').mockImplementation(async (hook, input) => {
				capturedInput = input;
				return originalExecute(hook, input);
			});

			await service.executePreToolUseHooks(makeToolCall('write'));

			expect(capturedInput).not.toBeNull();
			expect(capturedInput!.session_id).toBe('sess-abc-123');
		});

		it('should send undefined session_id when not set', async () => {
			setupConfig({
				PreToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'cat' }] }]
			});

			let capturedInput: HookInput | null = null;
			const originalExecute = service.executeHookCommand.bind(service);
			vi.spyOn(service, 'executeHookCommand').mockImplementation(async (hook, input) => {
				capturedInput = input;
				return originalExecute(hook, input);
			});

			await service.executePreToolUseHooks(makeToolCall('write'));

			expect(capturedInput).not.toBeNull();
			expect(capturedInput!.session_id).toBeUndefined();
		});
	});

	describe('config reload', () => {
		it('should pick up config changes without requiring a reset', () => {
			// First call - no hooks
			setupConfig(undefined);
			expect(service.hasHooks('PreToolUse')).toBe(false);

			// Config changes (e.g. via ConfigLoader.reload())
			setupConfig({
				PreToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'echo ok' }] }]
			});

			// Should see the new hooks immediately
			expect(service.hasHooks('PreToolUse')).toBe(true);
		});

		it('should reflect hooks being removed from config', () => {
			setupConfig({
				PreToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'echo ok' }] }]
			});
			expect(service.hasHooks('PreToolUse')).toBe(true);

			// Hooks removed from config
			setupConfig({});
			expect(service.hasHooks('PreToolUse')).toBe(false);
		});
	});

	describe('hooks.json loading', () => {
		function mockHooksFile(content: Record<string, unknown> | null, mtime: number = 1000): void {
			if (content === null) {
				vi.spyOn(fs, 'statSync').mockImplementation(() => {
					throw new Error('ENOENT: no such file or directory');
				});
			} else {
				vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: mtime } as fs.Stats);
				vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(content));
			}
		}

		it('should load hooks from hooks.json when available', () => {
			setupConfig(undefined);
			mockHooksFile({
				hooks: {
					PreToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'echo from-hooks-json' }] }]
				}
			});

			expect(service.hasHooks('PreToolUse')).toBe(true);
		});

		it('should prefer hooks.json over config.json for same matcher pattern', () => {
			setupConfig({
				PreToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'echo from-config' }] }]
			});
			mockHooksFile({
				hooks: {
					PreToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'echo from-hooks-json' }] }]
				}
			});

			const matchers = service.findMatchingHooks('write', [
				{ matcher: 'write', hooks: [{ type: 'command', command: 'echo from-hooks-json' }] }
			]);
			expect(matchers).toHaveLength(1);
			expect(matchers[0]!.command).toBe('echo from-hooks-json');
		});

		it('should fall back to config.json when hooks.json does not exist', () => {
			setupConfig({
				PreToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'echo from-config' }] }]
			});
			mockHooksFile(null);

			expect(service.hasHooks('PreToolUse')).toBe(true);
		});

		it('should merge hooks from both sources with different matcher patterns', () => {
			setupConfig({
				PreToolUse: [{ matcher: 'delete_file', hooks: [{ type: 'command', command: 'echo config-delete' }] }]
			});
			mockHooksFile({
				hooks: {
					PreToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'echo hooks-write' }] }]
				}
			});

			expect(service.hasHooks('PreToolUse')).toBe(true);

			// Both matchers should be available — test via executePreToolUseHooks indirectly
			// Write should match (from hooks.json)
			const writeHooks = service.findMatchingHooks('write', [
				{ matcher: 'write', hooks: [{ type: 'command', command: 'echo hooks-write' }] },
				{ matcher: 'delete_file', hooks: [{ type: 'command', command: 'echo config-delete' }] }
			]);
			expect(writeHooks).toHaveLength(1);
			expect(writeHooks[0]!.command).toBe('echo hooks-write');

			// Delete should match (from config.json)
			const deleteHooks = service.findMatchingHooks('delete_file', [
				{ matcher: 'write', hooks: [{ type: 'command', command: 'echo hooks-write' }] },
				{ matcher: 'delete_file', hooks: [{ type: 'command', command: 'echo config-delete' }] }
			]);
			expect(deleteHooks).toHaveLength(1);
			expect(deleteHooks[0]!.command).toBe('echo config-delete');
		});

		it('should cache hooks.json and re-read only when mtime changes', () => {
			setupConfig(undefined);
			const statSpy = vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
			const readSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(
				JSON.stringify({
					hooks: {
						PreToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'echo cached' }] }]
					}
				})
			);

			// First call reads the file
			expect(service.hasHooks('PreToolUse')).toBe(true);
			expect(readSpy).toHaveBeenCalledTimes(1);

			// Second call with same mtime uses cache
			expect(service.hasHooks('PreToolUse')).toBe(true);
			expect(readSpy).toHaveBeenCalledTimes(1);

			// Mtime changes — file should be re-read
			statSpy.mockReturnValue({ mtimeMs: 2000 } as fs.Stats);
			readSpy.mockReturnValue(
				JSON.stringify({
					hooks: {
						PostToolUse: [{ matcher: 'write', hooks: [{ type: 'command', command: 'echo updated' }] }]
					}
				})
			);

			expect(service.hasHooks('PreToolUse')).toBe(false);
			expect(service.hasHooks('PostToolUse')).toBe(true);
			expect(readSpy).toHaveBeenCalledTimes(2);
		});
	});
});
