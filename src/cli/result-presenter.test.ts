/**
 * Unit tests for result-presenter.ts
 *
 * Tests the ResultPresenter class functionality, including command output formatting
 * and agent/model information display.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Create mock console output before importing ResultPresenter
const mockConsoleOutput = {
	blank: vi.fn(),
	endGroup: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
	isInMcpMode: vi.fn(() => false),
	list: vi.fn(),
	print: vi.fn(),
	startGroup: vi.fn(),
	success: vi.fn()
};

// Mock the dependencies
vi.mock('output/console-output', () => ({
	getConsoleOutput: vi.fn(() => mockConsoleOutput)
}));

vi.mock('output/markdown', () => ({
	getRenderer: vi.fn(() => ({
		box: vi.fn((content, title) => {
			if (title) {
				return `┌─────────────┐\n│ ${content} │\n├─────────────┤\n│ ${title} │\n└─────────────┘`;
			}
			return `┌─────────────┐\n│ ${content} │\n└─────────────┘`;
		}),
		json: vi.fn((data) => JSON.stringify(data, null, 2))
	}))
}));

vi.mock('utils/data-sanitizer', () => ({
	sanitizeData: vi.fn((data) => data)
}));

vi.mock('output/logger', () => ({
	getLogger: vi.fn(() => ({
		error: vi.fn(),
		info: vi.fn()
	}))
}));

vi.mock('utils/number-format', () => ({
	formatNumber: vi.fn((n) => String(n))
}));

import { ResultPresenter } from './result-presenter';

describe('ResultPresenter', () => {
	let presenter: ResultPresenter;

	beforeEach(() => {
		// Clear all mocks
		vi.clearAllMocks();

		// Create presenter instance
		presenter = new ResultPresenter();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('displayCommandStart', () => {
		it('should display command start message', () => {
			const commandName = 'test-command';
			const description = 'Test command description';

			presenter.displayCommandStart(commandName, description);

			// Check that blank and print were called
			expect(mockConsoleOutput.blank).toHaveBeenCalled();
			expect(mockConsoleOutput.print).toHaveBeenCalled();

			// Check that print was called with a box containing the key elements
			const printCalls = mockConsoleOutput.print.mock.calls;
			const boxCall = printCalls.find((call: string[]) => call[0] && call[0].includes('Executing: test-command'));
			expect(boxCall).toBeDefined();
			expect(boxCall[0]).toContain('Test command description');
		});
	});

	describe('displaySuccess', () => {
		const baseParams = {
			commandName: 'test-command',
			duration: 1500,
			outputs: { data: [1, 2, 3], result: 'success' },
			sessionId: 'session-123'
		};

		it('should display successful command results without agent/model info', () => {
			presenter.displaySuccess(
				baseParams.commandName,
				baseParams.outputs,
				baseParams.duration,
				baseParams.sessionId,
				undefined,
				undefined,
				{ context: 100, generation: 50, total: 150 },
				150
			);

			// Should not display agent/model info when not provided
			const printCalls = mockConsoleOutput.print.mock.calls.map((call: string[]) => call[0]);
			const hasAgentInfo = printCalls.some((msg: string) => msg && msg.includes('🤖 Agent:'));
			expect(hasAgentInfo).toBe(false);

			// Should display results in structured format via startGroup
			expect(mockConsoleOutput.startGroup).toHaveBeenCalled();
			expect(mockConsoleOutput.print).toHaveBeenCalledWith(JSON.stringify(baseParams.outputs, null, 2));
			expect(mockConsoleOutput.endGroup).toHaveBeenCalled();
			expect(mockConsoleOutput.success).toHaveBeenCalledWith('Command completed successfully');
		});

		it('should display agent and model information when provided', () => {
			const agent = 'software-engineer-typescript';
			const model = 'gpt-5-thinking-high';

			presenter.displaySuccess(
				baseParams.commandName,
				baseParams.outputs,
				baseParams.duration,
				baseParams.sessionId,
				agent,
				model,
				{ context: 180, generation: 70, total: 250 },
				500
			);

			// Should display agent/model info at the beginning
			expect(mockConsoleOutput.print).toHaveBeenCalledWith(`🤖 Agent: ${agent} | Model: ${model}`);

			// Should still display results
			expect(mockConsoleOutput.startGroup).toHaveBeenCalled();
			expect(mockConsoleOutput.print).toHaveBeenCalledWith(JSON.stringify(baseParams.outputs, null, 2));
			expect(mockConsoleOutput.endGroup).toHaveBeenCalled();
			expect(mockConsoleOutput.success).toHaveBeenCalledWith('Command completed successfully');
		});

		it('should handle missing agent gracefully', () => {
			const model = 'gpt-5-thinking-high';

			presenter.displaySuccess(
				baseParams.commandName,
				baseParams.outputs,
				baseParams.duration,
				baseParams.sessionId,
				undefined,
				model,
				{ context: 70, generation: 30, total: 100 },
				200
			);

			// Should not display agent/model info when agent is missing
			const printCalls = mockConsoleOutput.print.mock.calls.map((call: string[]) => call[0]);
			const hasAgentInfo = printCalls.some((msg: string) => msg && msg.includes('🤖 Agent:'));
			expect(hasAgentInfo).toBe(false);

			// Should still display results normally
			expect(mockConsoleOutput.startGroup).toHaveBeenCalled();
			expect(mockConsoleOutput.endGroup).toHaveBeenCalled();
		});

		it('should handle missing model gracefully', () => {
			const agent = 'software-engineer-typescript';

			presenter.displaySuccess(
				baseParams.commandName,
				baseParams.outputs,
				baseParams.duration,
				baseParams.sessionId,
				agent,
				undefined,
				{ context: 50, generation: 25, total: 75 },
				150
			);

			// Should not display agent/model info when model is missing
			const printCalls = mockConsoleOutput.print.mock.calls.map((call: string[]) => call[0]);
			const hasAgentInfo = printCalls.some((msg: string) => msg && msg.includes('🤖 Agent:'));
			expect(hasAgentInfo).toBe(false);

			// Should still display results normally
			expect(mockConsoleOutput.startGroup).toHaveBeenCalled();
			expect(mockConsoleOutput.endGroup).toHaveBeenCalled();
		});

		it('should handle empty agent and model gracefully', () => {
			presenter.displaySuccess(
				baseParams.commandName,
				baseParams.outputs,
				baseParams.duration,
				baseParams.sessionId,
				'',
				'',
				{ context: 30, generation: 20, total: 50 },
				100
			);

			// Should not display agent/model info when both are empty
			const printCalls = mockConsoleOutput.print.mock.calls.map((call: string[]) => call[0]);
			const hasAgentInfo = printCalls.some((msg: string) => msg && msg.includes('🤖 Agent:'));
			expect(hasAgentInfo).toBe(false);

			// Should still display results normally
			expect(mockConsoleOutput.startGroup).toHaveBeenCalled();
			expect(mockConsoleOutput.endGroup).toHaveBeenCalled();
		});

		it('should handle complex output data', () => {
			const complexOutputs = {
				boolean: true,
				nested: {
					array: [1, 2, { key: 'value' }],
					object: { prop: 'value' }
				},
				number: 42,
				string: 'test'
			};

			presenter.displaySuccess(
				baseParams.commandName,
				complexOutputs,
				baseParams.duration,
				baseParams.sessionId,
				undefined,
				undefined,
				undefined,
				undefined
			);

			expect(mockConsoleOutput.print).toHaveBeenCalledWith(JSON.stringify(complexOutputs, null, 2));
		});

		it('should alert when architectural requirements context drops below 35%', () => {
			const lowContextBreakdown = { context: 25, generation: 75, total: 100 }; // 25% context

			expect(() => {
				presenter.displaySuccess(
					baseParams.commandName,
					baseParams.outputs,
					baseParams.duration,
					baseParams.sessionId,
					undefined,
					undefined,
					lowContextBreakdown,
					150
				);
			}).toThrow('Architectural requirements context influence too low: 25% (threshold: 35%)');

			// Should still display the token usage before throwing
			expect(mockConsoleOutput.print).toHaveBeenCalledWith('📊 Token Usage:');
			expect(mockConsoleOutput.print).toHaveBeenCalledWith('   • This interaction: 100 tokens');
			expect(mockConsoleOutput.print).toHaveBeenCalledWith('     └─ Context: 25 tokens (25%)');
			expect(mockConsoleOutput.print).toHaveBeenCalledWith('     └─ Generation: 75 tokens (75%)');
			expect(mockConsoleOutput.error).toHaveBeenCalledWith(
				expect.stringContaining('🚨 ARCHITECTURAL REQUIREMENTS ALERT 🚨')
			);
		});

		it('should not alert when context is at or above 35%', () => {
			const acceptableContextBreakdown = { context: 35, generation: 65, total: 100 }; // 35% context

			expect(() => {
				presenter.displaySuccess(
					baseParams.commandName,
					baseParams.outputs,
					baseParams.duration,
					baseParams.sessionId,
					undefined,
					undefined,
					acceptableContextBreakdown,
					150
				);
			}).not.toThrow();

			expect(mockConsoleOutput.print).toHaveBeenCalledWith('📊 Token Usage:');
			expect(mockConsoleOutput.print).toHaveBeenCalledWith('   • This interaction: 100 tokens');
			expect(mockConsoleOutput.print).toHaveBeenCalledWith('     └─ Context: 35 tokens (35%)');
			expect(mockConsoleOutput.print).toHaveBeenCalledWith('     └─ Generation: 65 tokens (65%)');
			expect(mockConsoleOutput.error).not.toHaveBeenCalledWith(
				expect.stringContaining('ARCHITECTURAL REQUIREMENTS ALERT')
			);
		});
	});

	describe('displayFailure', () => {
		const baseParams = {
			commandName: 'test-command',
			duration: 500,
			error: 'Test error message',
			sessionId: 'session-123'
		};

		it('should display command failure with error message', () => {
			presenter.displayFailure(
				baseParams.commandName,
				baseParams.error,
				baseParams.duration,
				baseParams.sessionId,
				{ context: 15, generation: 10, total: 25 },
				75
			);

			expect(mockConsoleOutput.error).toHaveBeenCalledWith('Command failed');
			expect(mockConsoleOutput.print).toHaveBeenCalledWith(`Error: ${baseParams.error}`);
			expect(mockConsoleOutput.blank).toHaveBeenCalled();
		});

		it('should handle undefined error gracefully', () => {
			presenter.displayFailure(
				baseParams.commandName,
				undefined,
				baseParams.duration,
				baseParams.sessionId,
				undefined,
				undefined
			);

			expect(mockConsoleOutput.error).toHaveBeenCalledWith('Command failed');
			// Should not display error message when undefined
			const printCalls = mockConsoleOutput.print.mock.calls.map((call: string[]) => call[0]);
			const hasError = printCalls.some((msg: string) => msg && msg.startsWith('Error:'));
			expect(hasError).toBe(false);
		});
	});

	describe('displaySandboxedEnvironmentError', () => {
		it('should display sandboxed environment error hints', () => {
			const errorMessage = 'Network access blocked';

			presenter.displaySandboxedEnvironmentError(errorMessage);

			expect(mockConsoleOutput.blank).toHaveBeenCalled();
			expect(mockConsoleOutput.error).toHaveBeenCalledWith('Command failed in sandboxed environment');
			expect(mockConsoleOutput.print).toHaveBeenCalledWith(`Error: ${errorMessage}`);
			expect(mockConsoleOutput.print).toHaveBeenCalledWith('💡 Sandboxed Environment Notes:');
			expect(mockConsoleOutput.list).toHaveBeenCalledWith([
				'File system access is restricted (logs/sessions may not persist)',
				'Network access may be blocked (API calls may fail)',
				'Configure API keys for full LLM functionality',
				'Some commands may work with local processing only'
			]);
		});
	});

	describe('displayGeneralError', () => {
		it('should display general error message', () => {
			const errorMessage = 'Something went wrong';

			presenter.displayGeneralError(errorMessage);

			expect(mockConsoleOutput.blank).toHaveBeenCalled();
			expect(mockConsoleOutput.error).toHaveBeenCalledWith(errorMessage);
		});
	});

	describe('integration scenarios', () => {
		it('should handle complete successful command flow', () => {
			const agent = 'software-engineer-typescript';
			const model = 'gpt-5-thinking-high';

			// Start command
			presenter.displayCommandStart('plan', 'Planning implementation');

			// Check that print was called with a box containing the command name
			const printCalls = mockConsoleOutput.print.mock.calls;
			const startBoxCall = printCalls.find((call: string[]) => call[0] && call[0].includes('Executing: plan'));
			expect(startBoxCall).toBeDefined();
			expect(startBoxCall[0]).toContain('Planning implementation');

			// Clear mocks for the next part of the flow
			vi.clearAllMocks();

			// Display success with agent/model
			const outputs = { plan: 'detailed plan', steps: 5 };
			presenter.displaySuccess(
				'plan',
				outputs,
				2000,
				'session-456',
				agent,
				model,
				{ context: 220, generation: 80, total: 300 },
				800
			);

			expect(mockConsoleOutput.print).toHaveBeenCalledWith(`🤖 Agent: ${agent} | Model: ${model}`);
			expect(mockConsoleOutput.startGroup).toHaveBeenCalled();
			expect(mockConsoleOutput.print).toHaveBeenCalledWith(JSON.stringify(outputs, null, 2));
			expect(mockConsoleOutput.endGroup).toHaveBeenCalled();
			// Should display token usage
			expect(mockConsoleOutput.print).toHaveBeenCalledWith('📊 Token Usage:');
			expect(mockConsoleOutput.print).toHaveBeenCalledWith('   • This interaction: 300 tokens');
			expect(mockConsoleOutput.print).toHaveBeenCalledWith('     └─ Context: 220 tokens (73%)');
			expect(mockConsoleOutput.print).toHaveBeenCalledWith('     └─ Generation: 80 tokens (27%)');
			expect(mockConsoleOutput.print).toHaveBeenCalledWith('   • Session total: 800 tokens');
			expect(mockConsoleOutput.success).toHaveBeenCalledWith('Command completed successfully');
		});

		it('should handle command failure flow', () => {
			// Start command
			presenter.displayCommandStart('invalid-command', 'Testing invalid command');

			// Display failure
			presenter.displayFailure(
				'invalid-command',
				'Command not found',
				100,
				'session-789',
				{ context: 6, generation: 4, total: 10 },
				50
			);

			expect(mockConsoleOutput.error).toHaveBeenCalledWith('Command failed');
			expect(mockConsoleOutput.print).toHaveBeenCalledWith('Error: Command not found');
		});
	});
});
