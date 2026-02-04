/**
 * External MCP Tool Proxy
 *
 * Wraps external tool calls with:
 * - Execution timeout enforcement
 * - Audit logging
 * - Error handling
 * - Risk assessment
 */

import type { MCPAuditLoggerService } from 'services/mcp-audit-logger.service';
import type { MCPClientManagerService } from 'services/mcp-client-manager.service';
import type {
	ExternalMCPServerConfig,
	ExternalMCPTool,
	ExternalMCPToolCallRequest,
	ExternalMCPToolCallResult,
	MCPRiskLevel
} from 'types/mcp-client.types';

import { getLogger } from 'output/logger';

/**
 * Risk score thresholds
 */
const RISK_SCORES: Record<MCPRiskLevel, number> = {
	critical: 4,
	high: 3,
	low: 1,
	medium: 2
};

/**
 * Default timeout in milliseconds
 */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Risk factors for tool assessment
 */
interface RiskAssessment {
	factors: string[];
	overallRisk: MCPRiskLevel;
	score: number;
}

/**
 * Tool execution options
 */
export interface ToolProxyOptions {
	/** Override timeout for this call */
	timeout_ms?: number;
	/** Skip audit logging */
	skipAudit?: boolean;
	/** Allow blocked tools (for emergency use) */
	allowBlocked?: boolean;
}

/**
 * External MCP Tool Proxy
 *
 * Responsibilities:
 * - Wrap external tool calls with safety measures
 * - Enforce execution timeouts
 * - Log all operations for auditing
 * - Assess and report risk levels
 */
export class ExternalMCPToolProxy {
	constructor(
		private clientManager: MCPClientManagerService,
		private auditLogger: MCPAuditLoggerService
	) {}

	/**
	 * Execute a tool on an external MCP server with safety measures
	 */
	async executeWithProxy(
		serverId: string,
		toolName: string,
		args: Record<string, unknown>,
		options: ToolProxyOptions = {}
	): Promise<ExternalMCPToolCallResult> {
		const logger = getLogger();
		const requestId = this.generateRequestId();
		const startTime = Date.now();

		// Get server configuration
		const server = this.clientManager.getConnectedServer(serverId);
		if (!server) {
			const error = `Server not connected: ${serverId}`;
			logger.error(error);
			return {
				content: null,
				duration_ms: Date.now() - startTime,
				error,
				requestId,
				success: false
			};
		}

		// Check if tool exists
		const tool = server.availableTools.find((t) => t.name === toolName);
		if (!tool) {
			const error = `Tool not found: ${toolName}`;
			logger.error(error, undefined, { serverId });
			return {
				content: null,
				duration_ms: Date.now() - startTime,
				error,
				requestId,
				success: false
			};
		}

		// Validate tool access
		const validation = this.validateToolAccess(server.config, toolName, options);
		if (!validation.allowed) {
			logger.warn('Tool access denied', {
				reason: validation.reason,
				serverId,
				toolName
			});
			return {
				content: null,
				duration_ms: Date.now() - startTime,
				error: validation.reason,
				requestId,
				success: false
			};
		}

		// Assess risk
		const risk = this.assessToolRisk(server.config, tool);
		logger.debug('Tool risk assessment', {
			factors: risk.factors,
			overallRisk: risk.overallRisk,
			riskScore: risk.score,
			serverId,
			toolName
		});

		// Determine timeout
		const timeoutMs = options.timeout_ms ?? server.config.security.max_execution_ms ?? DEFAULT_TIMEOUT_MS;

		logger.info('Executing external MCP tool', {
			requestId,
			riskLevel: risk.overallRisk,
			serverId,
			timeoutMs,
			toolName
		});

		try {
			// Create the request
			const request: ExternalMCPToolCallRequest = {
				args,
				requestId,
				serverId,
				timeout_ms: timeoutMs,
				toolName
			};

			// Execute with timeout
			const result = await this.executeWithTimeout(request, timeoutMs);

			// Log success
			if (!options.skipAudit) {
				await this.auditLogger.logToolCall(serverId, toolName, result.success, result.duration_ms, result.error);
			}

			return result;
		} catch (error) {
			const durationMs = Date.now() - startTime;
			const errorMessage = (error as Error).message;

			// Log error
			if (!options.skipAudit) {
				await this.auditLogger.logToolCall(serverId, toolName, false, durationMs, errorMessage);
			}

			return {
				content: null,
				duration_ms: durationMs,
				error: errorMessage,
				requestId,
				success: false
			};
		}
	}

	/**
	 * Execute multiple tools in sequence
	 */
	async executeSequence(
		calls: Array<{
			args: Record<string, unknown>;
			serverId: string;
			toolName: string;
		}>,
		options: ToolProxyOptions = {}
	): Promise<ExternalMCPToolCallResult[]> {
		const results: ExternalMCPToolCallResult[] = [];

		for (const call of calls) {
			const result = await this.executeWithProxy(call.serverId, call.toolName, call.args, options);
			results.push(result);

			// Stop on first failure if not explicitly continuing
			if (!result.success) {
				break;
			}
		}

		return results;
	}

	/**
	 * Get risk assessment for a tool
	 */
	assessToolRisk(config: ExternalMCPServerConfig, tool: ExternalMCPTool): RiskAssessment {
		const factors: string[] = [];
		let score = RISK_SCORES[config.security.risk_level];

		// Base risk from server configuration
		factors.push(`Server risk level: ${config.security.risk_level}`);

		// Add capability-based risk factors
		const capabilityResult = this.assessCapabilityRisk(config.security.capabilities);
		score += capabilityResult.score;
		factors.push(...capabilityResult.factors);

		// Add tool-specific risk factors
		const toolResult = this.assessToolPatternRisk(tool);
		score += toolResult.score;
		factors.push(...toolResult.factors);

		// Determine overall risk level
		const overallRisk = this.scoreToRiskLevel(score);

		return { factors, overallRisk, score };
	}

	/**
	 * Assess risk based on server capabilities
	 */
	private assessCapabilityRisk(capabilities: ExternalMCPServerConfig['security']['capabilities']): {
		factors: string[];
		score: number;
	} {
		const capabilityRisks: Array<{ capability: string; factor: string; weight: number }> = [
			{ capability: 'code_execution', factor: 'Can execute arbitrary code', weight: 2 },
			{ capability: 'file_system', factor: 'Has file system access', weight: 1 },
			{ capability: 'network_requests', factor: 'Can make network requests', weight: 1 },
			{ capability: 'process_spawn', factor: 'Can spawn processes', weight: 2 },
			{ capability: 'system_access', factor: 'Has system-level access', weight: 2 }
		];

		let score = 0;
		const factors: string[] = [];

		for (const { capability, factor, weight } of capabilityRisks) {
			if (capabilities.includes(capability as ExternalMCPServerConfig['security']['capabilities'][number])) {
				score += weight;
				factors.push(factor);
			}
		}

		return { factors, score };
	}

	/**
	 * Assess risk based on tool name/description patterns
	 */
	private assessToolPatternRisk(tool: ExternalMCPTool): { factors: string[]; score: number } {
		const riskyPatterns = [
			{ factor: 'Destructive operation', pattern: /delete|remove|drop|truncate/i, weight: 2 },
			{ factor: 'Command execution', pattern: /exec|run|spawn|shell/i, weight: 2 },
			{ factor: 'Modification operation', pattern: /write|create|modify/i, weight: 1 },
			{ factor: 'Data transfer', pattern: /download|upload|transfer/i, weight: 1 }
		];

		let score = 0;
		const factors: string[] = [];

		for (const { factor, pattern, weight } of riskyPatterns) {
			if (pattern.test(tool.name) || pattern.test(tool.description)) {
				score += weight;
				factors.push(factor);
			}
		}

		return { factors, score };
	}

	/**
	 * Convert a numeric score to a risk level
	 */
	private scoreToRiskLevel(score: number): MCPRiskLevel {
		if (score >= 8) return 'critical';
		if (score >= 5) return 'high';
		if (score >= 3) return 'medium';
		return 'low';
	}

	/**
	 * Get all available tools from connected servers
	 */
	getAvailableTools(): ExternalMCPTool[] {
		return this.clientManager.getAllTools();
	}

	/**
	 * Get tools from a specific server
	 */
	getServerTools(serverId: string): ExternalMCPTool[] {
		return this.clientManager.getServerTools(serverId);
	}

	/**
	 * Validate that a tool can be accessed
	 */
	private validateToolAccess(
		config: ExternalMCPServerConfig,
		toolName: string,
		options: ToolProxyOptions
	): { allowed: boolean; reason?: string } {
		// Check blocklist
		const blocklist = config.security.tool_blocklist ?? [];
		if (blocklist.includes(toolName) && !options.allowBlocked) {
			return { allowed: false, reason: `Tool is blocked by security policy: ${toolName}` };
		}

		// Check allowlist if defined
		const allowlist = config.security.tool_allowlist ?? [];
		if (allowlist.length > 0 && !allowlist.includes(toolName)) {
			return { allowed: false, reason: `Tool not in security allowlist: ${toolName}` };
		}

		return { allowed: true };
	}

	/**
	 * Execute a tool call with timeout
	 */
	private async executeWithTimeout(
		request: ExternalMCPToolCallRequest,
		timeoutMs: number
	): Promise<ExternalMCPToolCallResult> {
		return this.clientManager.callTool({
			...request,
			timeout_ms: timeoutMs
		});
	}

	/**
	 * Generate a unique request ID
	 */
	private generateRequestId(): string {
		const timestamp = Date.now().toString(36);
		const random = Math.random().toString(36).substring(2, 8);
		return `mcp-${timestamp}-${random}`;
	}
}

/**
 * Singleton instance
 */
let instance: ExternalMCPToolProxy | null = null;

/**
 * Get the External MCP Tool Proxy instance
 */
export function getExternalMCPToolProxy(
	clientManager: MCPClientManagerService,
	auditLogger: MCPAuditLoggerService
): ExternalMCPToolProxy {
	instance ??= new ExternalMCPToolProxy(clientManager, auditLogger);
	return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetExternalMCPToolProxy(): void {
	instance = null;
}
