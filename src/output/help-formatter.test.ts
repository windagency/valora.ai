/**
 * Tests for help formatter
 */

import { describe, expect, it } from 'vitest';

import { getCommandHelp } from 'utils/help-content';
import { HelpFormatter } from './help-formatter';

describe('HelpFormatter', () => {
	const formatter = new HelpFormatter();

	describe('formatHeader', () => {
		it('should format a header with title', () => {
			const header = formatter.formatHeader('Test Command');
			expect(header).toContain('Test Command');
			expect(header).toContain('╔');
			expect(header).toContain('╚');
		});

		it('should format a header with title and subtitle', () => {
			const header = formatter.formatHeader('Test Command', 'Test subtitle');
			expect(header).toContain('Test Command');
			expect(header).toContain('Test subtitle');
		});
	});

	describe('formatSection', () => {
		it('should format a section with separator', () => {
			const section = formatter.formatSection('EXAMPLES');
			expect(section).toContain('EXAMPLES');
			expect(section).toContain('─');
		});
	});

	describe('formatUsage', () => {
		it('should format basic usage', () => {
			const usage = formatter.formatUsage('plan');
			expect(usage).toContain('valora plan');
			expect(usage).toContain('[options]');
		});

		it('should format usage with argument hint', () => {
			const usage = formatter.formatUsage('plan', '<task-description>');
			expect(usage).toContain('valora plan <task-description>');
		});
	});

	describe('formatExamples', () => {
		it('should format examples with descriptions', () => {
			const examples = [
				{ code: 'valora plan "Add auth"', description: 'Plan a feature' },
				{ code: 'valora plan --help', description: 'Show help' }
			];

			const formatted = formatter.formatExamples(examples);
			expect(formatted).toContain('valora plan "Add auth"');
			expect(formatted).toContain('Plan a feature');
			expect(formatted).toContain('valora plan --help');
		});

		it('should handle empty examples', () => {
			const formatted = formatter.formatExamples([]);
			expect(formatted).toBe('');
		});
	});

	describe('formatOptions', () => {
		it('should format options with descriptions', () => {
			const options = [
				{ description: 'Session ID', flag: '--session <id>' },
				{ default: 'auto', description: 'Model name', flag: '--model <name>' }
			];

			const formatted = formatter.formatOptions(options);
			expect(formatted).toContain('--session <id>');
			expect(formatted).toContain('Session ID');
			expect(formatted).toContain('--model <name>');
			expect(formatted).toContain('(default: auto)');
		});
	});

	describe('formatRelatedCommands', () => {
		it('should format related commands as tree', () => {
			const commands = ['implement', 'test', 'review-plan'];

			const formatted = formatter.formatRelatedCommands(commands);
			expect(formatted).toContain('implement');
			expect(formatted).toContain('test');
			expect(formatted).toContain('review-plan');
			expect(formatted).toContain('└─');
		});

		it('should handle empty related commands', () => {
			const formatted = formatter.formatRelatedCommands([]);
			expect(formatted).toContain('None');
		});
	});

	describe('formatAgent', () => {
		it('should format agent information', () => {
			const formatted = formatter.formatAgent('@lead');
			expect(formatted).toContain('@lead');
			expect(formatted).toContain('Agent:');
		});
	});

	describe('formatCommandHelp', () => {
		it('should format complete command help', () => {
			const help = getCommandHelp('plan');
			if (!help) throw new Error('Plan command help not found');

			const formatted = formatter.formatCommandHelp(help);

			expect(formatted).toContain('plan');
			expect(formatted).toContain('WORKFLOW POSITION');
			expect(formatted).toContain('USAGE');
			expect(formatted).toContain('EXAMPLES');
			expect(formatted).toContain('AGENT ASSIGNED');
		});
	});

	describe('formatCommandList', () => {
		it('should format command list in columns', () => {
			const commands = ['plan', 'implement', 'test', 'commit', 'review-code', 'assert'];

			const formatted = formatter.formatCommandList(commands);
			commands.forEach((cmd) => {
				expect(formatted).toContain(cmd);
			});
		});
	});

	describe('formatSearchResults', () => {
		it('should format search results', () => {
			const help = getCommandHelp('plan');
			if (!help) throw new Error('Plan command help not found');

			const formatted = formatter.formatSearchResults([help]);
			expect(formatted).toContain('Found 1 command');
			expect(formatted).toContain('plan');
		});

		it('should handle no results', () => {
			const formatted = formatter.formatSearchResults([]);
			expect(formatted).toContain('No commands found');
		});
	});

	describe('formatOverview', () => {
		it('should format complete overview', () => {
			const formatted = formatter.formatOverview();

			expect(formatted).toContain('VALORA');
			expect(formatted).toContain('WORKFLOW PHASES');
			expect(formatted).toContain('QUICK START');
			expect(formatted).toContain('GETTING HELP');
		});
	});
});
