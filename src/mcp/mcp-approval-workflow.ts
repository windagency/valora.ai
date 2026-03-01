/**
 * MCP Approval Workflow
 *
 * Handles interactive approval for external MCP server connections,
 * displaying server info, security assessment, and tool listings.
 */

import type {
	ExternalMCPServerConfig,
	ExternalMCPTool,
	MCPAccessRequest,
	MCPApprovalResult,
	MCPRiskLevel
} from 'types/mcp-client.types';

import { getColorAdapter } from 'output/color-adapter.interface';
import { getConsoleOutput } from 'output/console-output';
import { getLogger } from 'output/logger';
import { getRenderer } from 'output/markdown';
import { getPromptAdapter } from 'ui/prompt-adapter.interface';

/**
 * Risk level colors and labels
 */
const RISK_LEVEL_CONFIG: Record<MCPRiskLevel, { color: 'cyan' | 'green' | 'red' | 'yellow'; label: string }> = {
	critical: { color: 'red', label: 'CRITICAL' },
	high: { color: 'red', label: 'HIGH' },
	low: { color: 'green', label: 'LOW' },
	medium: { color: 'yellow', label: 'MEDIUM' }
};

/**
 * Maximum tools to display in preview
 */
const MAX_PREVIEW_TOOLS = 5;

/**
 * MCP Approval Workflow
 *
 * Responsibilities:
 * - Display server info (name, description, requester, reason)
 * - Show security assessment (risk level, capabilities)
 * - List available tools from the MCP
 * - Handle approval decisions (Approve, Session, Configure, Deny)
 */
export class MCPApprovalWorkflow {
	private readonly color = getColorAdapter();
	private readonly console = getConsoleOutput();
	private readonly logger = getLogger();
	private readonly promptAdapter = getPromptAdapter();
	private readonly renderer = getRenderer();

	/**
	 * Request user approval for an external MCP connection
	 */
	async requestApproval(
		serverConfig: ExternalMCPServerConfig,
		accessRequest: MCPAccessRequest,
		availableTools: ExternalMCPTool[]
	): Promise<MCPApprovalResult> {
		this.logger.debug('Requesting MCP approval', {
			requestedBy: accessRequest.requestedBy,
			serverId: serverConfig.id,
			toolCount: availableTools.length
		});

		// Display the approval UI
		this.displayApprovalHeader(serverConfig);
		this.displayRequestDetails(serverConfig, accessRequest);
		this.displaySecurityAssessment(serverConfig);
		this.displayAvailableTools(availableTools);

		// Prompt for decision
		const decision = await this.promptForDecision(serverConfig);

		if (decision === 'deny') {
			this.displayDenialMessage();
			return {
				approved: false,
				decision: 'deny',
				remember: false,
				timestamp: new Date()
			};
		}

		if (decision === 'configure') {
			return this.handleConfigureFlow(serverConfig, availableTools);
		}

		// Approve or session
		const remember = decision === 'approve';
		this.displayApprovalMessage(serverConfig, remember);

		return {
			approved: true,
			decision,
			remember,
			timestamp: new Date()
		};
	}

	/**
	 * Display the approval header
	 */
	private displayApprovalHeader(config: ExternalMCPServerConfig): void {
		this.console.blank();
		this.console.print(this.renderer.box(config.name, 'External MCP Server Request'));
		this.console.blank();
	}

	/**
	 * Display request details
	 */
	private displayRequestDetails(config: ExternalMCPServerConfig, request: MCPAccessRequest): void {
		this.console.bold('Request Details:');
		this.console.print(`  Server:       ${config.name}`);
		this.console.print(`  Description:  ${config.description}`);
		this.console.print(`  Requested By: ${request.requestedBy}`);
		this.console.print(`  Reason:       ${request.reason}`);
		this.console.blank();
	}

	/**
	 * Display security assessment
	 */
	private displaySecurityAssessment(config: ExternalMCPServerConfig): void {
		const riskConfig = RISK_LEVEL_CONFIG[config.security.risk_level];
		const riskLabel = this.applyRiskColor(riskConfig.label, config.security.risk_level);
		const capabilities = config.security.capabilities.join(', ');
		const auditStatus = config.security.audit_logging ? 'Enabled' : 'Disabled';

		this.console.bold('Security Assessment:');
		this.console.print(`  Risk Level:   ${riskLabel}`);
		this.console.print(`  Capabilities: ${capabilities}`);
		this.console.print(`  Audit Logging: ${auditStatus}`);

		if (config.security.max_execution_ms) {
			this.console.print(`  Max Execution: ${config.security.max_execution_ms}ms`);
		}

		if (config.security.tool_blocklist?.length) {
			this.console.print(`  Blocked Tools: ${config.security.tool_blocklist.join(', ')}`);
		}

		this.console.blank();

		// Display warnings for high/critical risk
		if (config.security.risk_level === 'high' || config.security.risk_level === 'critical') {
			this.displayRiskWarning(config);
		}
	}

	/**
	 * Display available tools
	 */
	private displayAvailableTools(tools: ExternalMCPTool[]): void {
		if (tools.length === 0) {
			this.console.dim('No tools discovered from this server.');
			this.console.blank();
			return;
		}

		this.console.bold(`Available Tools (${tools.length}):`);

		const displayTools = tools.slice(0, MAX_PREVIEW_TOOLS);
		displayTools.forEach((tool, index) => {
			const truncatedDesc = tool.description.length > 40 ? tool.description.substring(0, 37) + '...' : tool.description;
			this.console.print(`  ${index + 1}. ${this.color.cyan(tool.name.padEnd(20))} - ${truncatedDesc}`);
		});

		if (tools.length > MAX_PREVIEW_TOOLS) {
			this.console.dim(`  ... and ${tools.length - MAX_PREVIEW_TOOLS} more tools`);
		}

		this.console.blank();
	}

	/**
	 * Display risk warning for high/critical risk servers
	 */
	private displayRiskWarning(config: ExternalMCPServerConfig): void {
		const warningBox = this.renderer.box(
			`This server has ${config.security.risk_level.toUpperCase()} risk level.\n` +
				`Capabilities: ${config.security.capabilities.join(', ')}\n` +
				'Review carefully before approving.',
			'Security Warning'
		);
		this.console.print(this.color.yellow(warningBox));
		this.console.blank();
	}

	/**
	 * Apply risk level color to text
	 */
	private applyRiskColor(text: string, level: MCPRiskLevel): string {
		const riskConfig = RISK_LEVEL_CONFIG[level];
		switch (riskConfig.color) {
			case 'cyan':
				return this.color.cyan(text);
			case 'green':
				return this.color.green(text);
			case 'red':
				return this.color.red(text);
			case 'yellow':
				return this.color.yellow(text);
			default:
				return text;
		}
	}

	/**
	 * Prompt for approval decision
	 */
	private async promptForDecision(
		config: ExternalMCPServerConfig
	): Promise<'approve' | 'configure' | 'deny' | 'session'> {
		const answers = await this.promptAdapter.prompt([
			{
				choices: [
					{
						name: '[A]pprove - Connect and remember for future sessions',
						value: 'approve'
					},
					{
						name: '[S]ession - Approve for this session only',
						value: 'session'
					},
					{
						name: '[C]onfigure - Review and filter available tools',
						value: 'configure'
					},
					{
						name: '[D]eny - Block this connection',
						value: 'deny'
					}
				],
				default: config.security.risk_level === 'low' ? 'session' : 'configure',
				message: `Allow connection to ${config.name}?`,
				name: 'decision',
				type: 'list'
			}
		]);

		return answers['decision'] as 'approve' | 'configure' | 'deny' | 'session';
	}

	/**
	 * Handle the configure flow for filtering tools
	 */
	private async handleConfigureFlow(
		_config: ExternalMCPServerConfig,
		tools: ExternalMCPTool[]
	): Promise<MCPApprovalResult> {
		if (tools.length === 0) {
			this.console.warn('No tools available to configure.');
			return {
				approved: false,
				decision: 'deny',
				remember: false,
				timestamp: new Date()
			};
		}

		this.console.blank();
		this.console.bold('Configure Tool Access');
		this.console.dim('Select which tools to allow:');
		this.console.blank();

		const toolChoices = tools.map((tool) => ({
			checked: true,
			name: `${tool.name} - ${tool.description}`,
			value: tool.name
		}));

		const answers = await this.promptAdapter.prompt([
			{
				choices: toolChoices,
				message: 'Select tools to allow:',
				name: 'allowedTools',
				pageSize: 15,
				type: 'checkbox'
			}
		]);

		const allowedTools = answers['allowedTools'] as string[];

		if (allowedTools.length === 0) {
			this.console.warn('No tools selected. Connection denied.');
			return {
				approved: false,
				decision: 'deny',
				remember: false,
				timestamp: new Date()
			};
		}

		// Ask about remembering the decision
		const rememberAnswer = await this.promptAdapter.prompt([
			{
				default: false,
				message: 'Remember this configuration for future sessions?',
				name: 'remember',
				type: 'confirm'
			}
		]);

		const remember = rememberAnswer['remember'] as boolean;

		this.console.blank();
		this.console.success(`Approved ${allowedTools.length} of ${tools.length} tools.`);
		this.console.blank();

		return {
			allowedTools,
			approved: true,
			decision: 'configure',
			remember,
			timestamp: new Date()
		};
	}

	/**
	 * Display denial message
	 */
	private displayDenialMessage(): void {
		this.console.blank();
		this.console.warn('Connection to external MCP server denied.');
		this.console.blank();
	}

	/**
	 * Display approval message
	 */
	private displayApprovalMessage(config: ExternalMCPServerConfig, remember: boolean): void {
		this.console.blank();
		this.console.success(`Connection to ${config.name} approved.`);
		if (remember) {
			this.console.dim('This approval will be remembered for future sessions.');
		} else {
			this.console.dim('This approval is valid for this session only.');
		}
		this.console.blank();
	}

	/**
	 * Display quick approval info (for auto-approved servers)
	 */
	displayAutoApproveInfo(config: ExternalMCPServerConfig): void {
		this.console.blank();
		this.console.dim(`Auto-connecting to ${config.name}...`);
		this.console.print(`  Description: ${config.description}`);
		this.console.print(`  Risk Level:  ${config.security.risk_level}`);
		this.console.blank();
	}

	/**
	 * Display connection summary
	 */
	displayConnectionSummary(_serverId: string, serverName: string, toolCount: number, success: boolean): void {
		this.console.blank();
		if (success) {
			this.console.success(`Connected to ${serverName}`);
			this.console.print(`  Available tools: ${toolCount}`);
		} else {
			this.console.error(`Failed to connect to ${serverName}`);
		}
		this.console.blank();
	}

	/**
	 * Display disconnection summary
	 */
	displayDisconnectionSummary(serverName: string): void {
		this.console.blank();
		this.console.info(`Disconnected from ${serverName}`);
		this.console.blank();
	}

	/**
	 * Display error message
	 */
	displayError(message: string, details?: string): void {
		this.console.blank();
		this.console.error(message);
		if (details) {
			this.console.dim(details);
		}
		this.console.blank();
	}
}

/**
 * Singleton instance
 */
let instance: MCPApprovalWorkflow | null = null;

/**
 * Get the MCP Approval Workflow instance
 */
export function getMCPApprovalWorkflow(): MCPApprovalWorkflow {
	instance ??= new MCPApprovalWorkflow();
	return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetMCPApprovalWorkflow(): void {
	instance = null;
}
