/**
 * Dry Run Tool Simulator Service
 *
 * Simulates tool execution in dry-run mode without making actual changes.
 * Read-only tools execute normally; write operations return simulated results.
 */

import type { AllowedTool } from 'types/command.types';
import type { LLMToolCall, LLMToolResult } from 'types/llm.types';

import { existsSync, statSync } from 'fs';
import { getLogger } from 'output/logger';
import { createDeletedFileDiff, createNewFileDiff, type DiffResult, generateUnifiedDiff } from 'utils/diff-generator';
import { readFile } from 'utils/file-utils';

/** Type of simulated operation */
export type SimulatedOperationType = 'command' | 'delete' | 'external' | 'read' | 'search' | 'write';

/**
 * A simulated operation that would be performed
 */
export interface SimulatedOperation {
	/** Tool arguments */
	args: Record<string, unknown>;
	/** Diff result for file operations */
	diff?: DiffResult;
	/** Human-readable description */
	description: string;
	/** Simulated result message */
	simulatedResult: string;
	/** Tool name */
	tool: string;
	/** Operation type */
	type: SimulatedOperationType;
}

/**
 * Result of simulating a tool call
 */
export interface SimulatedToolResult {
	/** The operation that was simulated */
	operation: SimulatedOperation;
	/** The LLM tool result to return */
	result: LLMToolResult;
}

/** Read-only tools that can execute normally in dry-run mode */
const READ_ONLY_TOOLS: Set<AllowedTool> = new Set([
	'codebase_search',
	'glob_file_search',
	'grep',
	'list_dir',
	'query_session',
	'read_file'
]);

/**
 * Service for simulating tool execution in dry-run mode
 */
export class DryRunToolSimulator {
	private readonly logger = getLogger();
	private readonly operations: SimulatedOperation[] = [];
	private readonly workingDir: string;

	constructor(workingDir: string = process.cwd()) {
		this.workingDir = workingDir;
	}

	/**
	 * Check if a tool is read-only and can execute normally
	 */
	isReadOnlyTool(toolName: string): boolean {
		return READ_ONLY_TOOLS.has(toolName as AllowedTool);
	}

	/**
	 * Simulate a tool call without making actual changes
	 */
	async simulateTool(toolCall: LLMToolCall): Promise<SimulatedToolResult> {
		const { arguments: args, id, name } = toolCall;

		this.logger.debug(`Simulating tool: ${name}`, { args });

		const simulators: Record<string, (args: Record<string, unknown>) => Promise<SimulatedOperation>> = {
			['delete_file']: (a) => this.simulateDeleteFile(a),
			['mcp_tool_call']: (a) => this.simulateMcpToolCall(a),
			['run_terminal_cmd']: (a) => this.simulateTerminalCmd(a),
			['search_replace']: (a) => this.simulateSearchReplace(a),
			['web_search']: (a) => this.simulateWebSearch(a),
			['write']: (a) => this.simulateWrite(a)
		};

		const simulator = simulators[name];
		if (!simulator) {
			// Unknown tool - create a generic simulation
			const operation: SimulatedOperation = {
				args,
				description: `Unknown tool: ${name}`,
				simulatedResult: `[DRY RUN] Tool ${name} would be executed`,
				tool: name,
				type: 'external'
			};
			this.operations.push(operation);
			return {
				operation,
				result: { output: operation.simulatedResult, tool_call_id: id }
			};
		}

		const operation = await simulator(args);
		this.operations.push(operation);

		return {
			operation,
			result: { output: operation.simulatedResult, tool_call_id: id }
		};
	}

	/**
	 * Get all simulated operations collected so far
	 */
	getSimulatedOperations(): SimulatedOperation[] {
		return [...this.operations];
	}

	/**
	 * Get operations grouped by type
	 */
	getOperationsByType(): Record<SimulatedOperationType, SimulatedOperation[]> {
		const initial: Record<SimulatedOperationType, SimulatedOperation[]> = {
			command: [],
			delete: [],
			external: [],
			read: [],
			search: [],
			write: []
		};

		return this.operations.reduce((grouped, op) => {
			grouped[op.type].push(op);
			return grouped;
		}, initial);
	}

	/**
	 * Get file operations (write, delete) with diffs
	 */
	getFileOperations(): SimulatedOperation[] {
		return this.operations.filter((op) => op.type === 'write' || op.type === 'delete');
	}

	/**
	 * Get terminal commands that would be executed
	 */
	getTerminalCommands(): SimulatedOperation[] {
		return this.operations.filter((op) => op.type === 'command');
	}

	/**
	 * Clear all collected operations
	 */
	clear(): void {
		this.operations.length = 0;
	}

	// =========================================================================
	// Tool Simulators
	// =========================================================================

	/**
	 * Simulate write tool
	 */
	private async simulateWrite(args: Record<string, unknown>): Promise<SimulatedOperation> {
		const path = args['path'] as string;
		const content = args['content'] as string;
		const fullPath = this.resolvePath(path);

		let diff: DiffResult;
		let description: string;

		if (existsSync(fullPath)) {
			// File exists - compute diff
			const oldContent = await readFile(fullPath);
			diff = generateUnifiedDiff(oldContent, content, path);
			description = `[MODIFY] ${path}`;
		} else {
			// New file
			diff = createNewFileDiff(content, path);
			description = `[CREATE] ${path} (${content.split('\n').length} lines)`;
		}

		return {
			args,
			description,
			diff,
			simulatedResult: `[DRY RUN] Would write ${content.length} characters to ${path}`,
			tool: 'write',
			type: 'write'
		};
	}

	/**
	 * Simulate search_replace tool
	 */
	private async simulateSearchReplace(args: Record<string, unknown>): Promise<SimulatedOperation> {
		const path = args['path'] as string;
		const oldStr = args['old_str'] as string;
		const newStr = args['new_str'] as string;
		const fullPath = this.resolvePath(path);

		if (!existsSync(fullPath)) {
			return {
				args,
				description: `[ERROR] File not found: ${path}`,
				simulatedResult: `[DRY RUN] Error: File not found: ${path}`,
				tool: 'search_replace',
				type: 'write'
			};
		}

		const oldContent = await readFile(fullPath);

		if (!oldContent.includes(oldStr)) {
			return {
				args,
				description: `[ERROR] Text not found in ${path}`,
				simulatedResult: `[DRY RUN] Error: Text not found in file`,
				tool: 'search_replace',
				type: 'write'
			};
		}

		const newContent = oldContent.replace(oldStr, newStr);
		const diff = generateUnifiedDiff(oldContent, newContent, path);

		return {
			args,
			description: `[MODIFY] ${path}`,
			diff,
			simulatedResult: `[DRY RUN] Would replace text in ${path}`,
			tool: 'search_replace',
			type: 'write'
		};
	}

	/**
	 * Simulate delete_file tool
	 */
	private async simulateDeleteFile(args: Record<string, unknown>): Promise<SimulatedOperation> {
		const path = args['path'] as string;
		const fullPath = this.resolvePath(path);

		if (!existsSync(fullPath)) {
			return {
				args,
				description: `[ERROR] File not found: ${path}`,
				simulatedResult: `[DRY RUN] Error: File not found: ${path}`,
				tool: 'delete_file',
				type: 'delete'
			};
		}

		const stat = statSync(fullPath);
		let diff: DiffResult | undefined;

		if (stat.isFile()) {
			const content = await readFile(fullPath);
			diff = createDeletedFileDiff(content, path);
		}

		return {
			args,
			description: `[DELETE] ${path}`,
			diff,
			simulatedResult: `[DRY RUN] Would delete ${path}`,
			tool: 'delete_file',
			type: 'delete'
		};
	}

	/**
	 * Simulate run_terminal_cmd tool
	 */
	private simulateTerminalCmd(args: Record<string, unknown>): Promise<SimulatedOperation> {
		const command = args['command'] as string;
		const timeoutMs = args['timeout_ms'] as number | undefined;

		return Promise.resolve({
			args,
			description: `$ ${command}${timeoutMs ? ` (timeout: ${timeoutMs}ms)` : ''}`,
			simulatedResult: `[DRY RUN] Would execute: ${command}`,
			tool: 'run_terminal_cmd',
			type: 'command'
		});
	}

	/**
	 * Simulate web_search tool
	 */
	private simulateWebSearch(args: Record<string, unknown>): Promise<SimulatedOperation> {
		const query = args['query'] as string;

		return Promise.resolve({
			args,
			description: `Web search: "${query}"`,
			simulatedResult: `[DRY RUN] Would search the web for: ${query}`,
			tool: 'web_search',
			type: 'external'
		});
	}

	/**
	 * Simulate mcp_tool_call tool
	 */
	private simulateMcpToolCall(args: Record<string, unknown>): Promise<SimulatedOperation> {
		const toolName = args['tool_name'] as string;
		const toolArgs = args['arguments'] as Record<string, unknown> | undefined;

		return Promise.resolve({
			args,
			description: `MCP tool: ${toolName}`,
			simulatedResult: `[DRY RUN] Would call MCP tool: ${toolName}${toolArgs ? ` with args: ${JSON.stringify(toolArgs)}` : ''}`,
			tool: 'mcp_tool_call',
			type: 'external'
		});
	}

	/**
	 * Resolve a path relative to the working directory
	 */
	private resolvePath(path: string): string {
		if (path.startsWith('/')) {
			return path;
		}
		return `${this.workingDir}/${path}`;
	}
}

/**
 * Singleton instance for the dry-run simulator
 */
let simulatorInstance: DryRunToolSimulator | null = null;

export function getDryRunSimulator(workingDir?: string): DryRunToolSimulator {
	if (!simulatorInstance || workingDir) {
		simulatorInstance = new DryRunToolSimulator(workingDir);
	}
	return simulatorInstance;
}

/**
 * Reset the singleton (for testing or new sessions)
 */
export function resetDryRunSimulator(): void {
	if (simulatorInstance) {
		simulatorInstance.clear();
	}
	simulatorInstance = null;
}
