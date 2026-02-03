/**
 * Tests for help content
 */

import { describe, expect, it } from 'vitest';

import { getAllCommandNames, getCommandHelp, getCommandsByPhase, hasCommandHelp, searchCommands } from './help-content';

describe('Help Content', () => {
	describe('getCommandHelp', () => {
		it('should return help for valid command', () => {
			const help = getCommandHelp('plan');
			expect(help).toBeDefined();
			expect(help?.name).toBe('plan');
			expect(help?.description).toBeTruthy();
			expect(help?.examples).toBeInstanceOf(Array);
		});

		it('should return undefined for invalid command', () => {
			const help = getCommandHelp('invalid-command');
			expect(help).toBeUndefined();
		});
	});

	describe('getAllCommandNames', () => {
		it('should return array of command names', () => {
			const commands = getAllCommandNames();
			expect(commands).toBeInstanceOf(Array);
			expect(commands.length).toBeGreaterThan(0);
		});

		it('should include all 32 commands', () => {
			const commands = getAllCommandNames();
			expect(commands.length).toBe(32);
		});

		it('should include known commands', () => {
			const commands = getAllCommandNames();
			expect(commands).toContain('plan');
			expect(commands).toContain('implement');
			expect(commands).toContain('test');
			expect(commands).toContain('commit');
		});

		it('should return sorted command names', () => {
			const commands = getAllCommandNames();
			const sorted = [...commands].sort();
			expect(commands).toEqual(sorted);
		});
	});

	describe('hasCommandHelp', () => {
		it('should return true for valid command', () => {
			expect(hasCommandHelp('plan')).toBe(true);
			expect(hasCommandHelp('implement')).toBe(true);
		});

		it('should return false for invalid command', () => {
			expect(hasCommandHelp('invalid')).toBe(false);
		});
	});

	describe('searchCommands', () => {
		it('should find commands by name', () => {
			const results = searchCommands('plan');
			expect(results.length).toBeGreaterThan(0);
			expect(results.some((r) => r.name === 'plan')).toBe(true);
		});

		it('should find commands by description keyword', () => {
			const results = searchCommands('test');
			expect(results.length).toBeGreaterThan(0);
		});

		it('should find commands by workflow phase', () => {
			const results = searchCommands('implement');
			expect(results.length).toBeGreaterThan(0);
		});

		it('should be case insensitive', () => {
			const lower = searchCommands('plan');
			const upper = searchCommands('PLAN');
			expect(lower.length).toBe(upper.length);
		});

		it('should return empty array for no matches', () => {
			const results = searchCommands('xyz123notfound');
			expect(results).toEqual([]);
		});
	});

	describe('getCommandsByPhase', () => {
		it('should return commands for valid phase', () => {
			const commands = getCommandsByPhase('workflow');
			expect(commands.length).toBeGreaterThan(0);
		});

		it('should return empty array for invalid phase', () => {
			const commands = getCommandsByPhase('invalid-phase');
			expect(commands).toEqual([]);
		});

		it('should return only commands from specified phase', () => {
			const commands = getCommandsByPhase('implement');
			commands.forEach((cmd) => {
				expect(cmd.workflowPhase).toBe('implement');
			});
		});
	});

	describe('Command Help Structure', () => {
		it('all commands should have required fields', () => {
			const commands = getAllCommandNames();

			commands.forEach((name) => {
				const help = getCommandHelp(name);
				expect(help).toBeDefined();
				expect(help?.name).toBe(name);
				expect(help?.description).toBeTruthy();
				expect(help?.agent).toBeTruthy();
				expect(help?.workflowPhase).toBeTruthy();
				expect(help?.examples).toBeInstanceOf(Array);
				expect(help?.options).toBeInstanceOf(Array);
				expect(help?.relatedCommands).toBeInstanceOf(Array);
			});
		});

		it('all commands should have at least one example', () => {
			const commands = getAllCommandNames();

			commands.forEach((name) => {
				const help = getCommandHelp(name);
				expect(help?.examples.length).toBeGreaterThan(0);
			});
		});

		it('all examples should have code and description', () => {
			const commands = getAllCommandNames();

			commands.forEach((name) => {
				const help = getCommandHelp(name);
				help?.examples.forEach((example) => {
					expect(example.code).toBeTruthy();
					expect(example.description).toBeTruthy();
				});
			});
		});
	});
});
