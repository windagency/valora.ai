#!/usr/bin/env node

/**
 * MCP Server for VALORA
 * Exposes orchestration commands as MCP tools for Cursor integration
 */

import type { CommandExecutor } from 'cli/command-executor';
import type { CommandLoader } from 'executor/command-loader';
import type { MCPSamplingOptions, MCPSamplingResult, MCPSamplingService } from 'types/mcp.types';

import { getConfigLoader, setGlobalCliOverrides } from 'config/loader';
import { createContainer, type DIContainer, SERVICE_IDENTIFIERS, setupMCPServices } from 'di/container';
import { getLogger, type Logger } from 'output/logger';
import path from 'path';
import { getAIRoot, readJSON } from 'utils/file-utils';

import type { MCPRequestHandler } from './request-handler';
import type { MCPSamplingServiceImpl } from './sampling-service';
import type { MCPToolRegistry } from './tool-registry';
import type { MCPServerOverrides } from './types';

import { MCPServerManager } from './server-manager';
import { ShutdownManager } from './shutdown-manager';
import { SystemMonitorService } from './system-monitor';

// Disable progress indicators and interactive prompts for MCP
process.env['AI_INTERACTIVE'] = 'false';
// Mark that we're running in MCP/Cursor context
process.env['AI_MCP_ENABLED'] = 'true';

/**
 * Get the version from package.json
 */
export class MCPOrchestratorServer implements MCPSamplingService {
	private serverManager: MCPServerManager;
	// @ts-expect-error - Kept for service lifecycle
	private commandLoader: CommandLoader;
	// @ts-expect-error - Kept for service lifecycle
	private commandExecutor: CommandExecutor;
	private container: DIContainer;
	private logger: Logger;
	private samplingService: MCPSamplingServiceImpl;
	private toolRegistry: MCPToolRegistry;
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore - Kept for service lifecycle
	private requestHandler: MCPRequestHandler;
	private systemMonitor: SystemMonitorService;
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore - Planned for future use
	private shutdownManager: ShutdownManager;

	constructor(logger?: Logger, version?: string) {
		this.logger = logger ?? getLogger(); // Fallback to default logger if none provided
		const serverVersion = version ?? '1.0.0';

		// Initialize specialized services
		this.serverManager = new MCPServerManager(this.logger, serverVersion);
		this.systemMonitor = new SystemMonitorService(this.logger);
		this.shutdownManager = new ShutdownManager(this.logger);

		// Initialize container and services
		this.container = createContainer();
		setupMCPServices(this.container, this.serverManager.getServer());

		// Resolve services
		this.commandLoader = this.container.resolve(SERVICE_IDENTIFIERS.COMMAND_LOADER) as CommandLoader;
		this.samplingService = this.container.resolve(SERVICE_IDENTIFIERS.SAMPLING_SERVICE) as MCPSamplingServiceImpl;
		this.commandExecutor = this.container.resolve(SERVICE_IDENTIFIERS.COMMAND_EXECUTOR) as CommandExecutor;
		this.requestHandler = this.container.resolve(SERVICE_IDENTIFIERS.REQUEST_HANDLER) as MCPRequestHandler;
		this.toolRegistry = this.container.resolve(SERVICE_IDENTIFIERS.TOOL_REGISTRY) as MCPToolRegistry;
	}

	/**
	 * Get the sampling service for dependency injection
	 * This allows CursorProvider to be created with proper DI instead of global state
	 */
	getSamplingService(): MCPSamplingService {
		return this.samplingService;
	}

	/**
	 * Get the server manager for advanced server operations
	 */
	getServerManager(): MCPServerManager {
		return this.serverManager;
	}

	/**
	 * Request sampling from Cursor (for CursorProvider)
	 *
	 * Delegates to the specialized sampling service for proper separation of concerns
	 */
	async requestSampling(options: MCPSamplingOptions): Promise<MCPSamplingResult> {
		return this.samplingService.requestSampling(options);
	}

	/**
	 * Setup all tools - MUST be called before connect()
	 */
	async setupTools(): Promise<void> {
		return this.toolRegistry.setupTools();
	}

	async start(mode: 'sse' | 'stdio' = 'sse', port: number = 3000): Promise<void> {
		// Use logger exclusively - it already uses stderr with proper formatting
		this.logger.info('MCP Orchestrator Server starting', { mode, port });

		// Start system monitoring
		this.systemMonitor.startMonitoring();

		// Register MCP tools
		this.logger.debug('Registering MCP tools');
		await this.setupTools();
		this.logger.debug('MCP tools registered successfully');

		// Connect to transport
		await this.serverManager.connect(mode, port);

		// MCP servers run indefinitely until explicitly terminated

		this.logger.info('MCP Orchestrator Server ready');

		// Check client capabilities (may be undefined until first request)
		const clientCaps = this.serverManager.getClientCapabilities();

		if (clientCaps && typeof clientCaps === 'object') {
			const caps = clientCaps as Record<string, unknown>;
			this.logger.debug('Client capabilities detected', {
				capabilities: clientCaps,
				samplingSupported: !!caps['sampling']
			});

			if (caps['sampling']) {
				this.logger.info('Cursor MCP sampling enabled - zero-config mode active');
			} else {
				this.logger.warn('Cursor MCP sampling not available - API keys required', {
					tip: 'Configure providers with: valora config setup --quick'
				});
			}
		} else {
			this.logger.debug('Client capabilities pending (will be available after first request)');
		}
	}
}

async function getPackageVersion(): Promise<string> {
	try {
		// Use getAIRoot to find the .ai directory, then go to .ai/.bin/package.json
		const aiRoot = getAIRoot();
		const packageJsonPath = path.join(aiRoot, '.bin', 'package.json');

		const packageJson = await readJSON<{ version: string }>(packageJsonPath);
		return packageJson.version;
	} catch (error) {
		// Fallback to hardcoded version if package.json can't be read

		console.warn('Failed to read package.json version, using fallback:', error);
		return '1.0.0';
	}
}

/**
 * Parse MCP server command-line arguments
 */
function parseMCPArgs(): MCPServerOverrides {
	const args = process.argv.slice(2); // Skip 'node' and script path
	const overrides: MCPServerOverrides = {};

	args.reduce((skipNext, arg, i) => parseArgument(arg, i, args, overrides, skipNext), false);

	return overrides;
}

/**
 * Parse a single command-line argument
 */
function parseArgument(
	arg: string,
	i: number,
	args: string[],
	overrides: MCPServerOverrides,
	skipNext: boolean
): boolean {
	if (skipNext) return false;

	const nextArg = args[i + 1];
	const hasNext = i + 1 < args.length;

	if (shouldParseLogLevel(arg, hasNext, nextArg)) {
		parseLogLevel(nextArg!, overrides);
		return true;
	}

	if (arg === '--verbose') {
		overrides.verbose = true;
		return false;
	}

	if (arg === '--quiet') {
		overrides.quiet = true;
		return false;
	}

	if (shouldParseOutput(arg, hasNext, nextArg)) {
		overrides.output = nextArg!;
		return true;
	}

	if (shouldParseTransport(arg, hasNext, nextArg)) {
		overrides.transport = nextArg!;
		return true;
	}

	if (shouldParsePort(arg, hasNext, nextArg)) {
		overrides.port = parseInt(nextArg!, 10);
		return true;
	}

	return false;
}

/**
 * Check if should parse log level argument
 */
function shouldParseLogLevel(arg: string, hasNext: boolean, nextArg: string | undefined): boolean {
	return arg === '--log-level' && hasNext && nextArg !== undefined;
}

/**
 * Parse log level argument
 */
function parseLogLevel(value: string, overrides: MCPServerOverrides): void {
	overrides.logLevel = value;
	process.env['AI_LOG_LEVEL'] = value;
}

/**
 * Check if should parse output argument
 */
function shouldParseOutput(arg: string, hasNext: boolean, nextArg: string | undefined): boolean {
	return arg === '--output' && hasNext && nextArg !== undefined;
}

/**
 * Check if should parse transport argument
 */
function shouldParseTransport(arg: string, hasNext: boolean, nextArg: string | undefined): boolean {
	return arg === '--transport' && hasNext && nextArg !== undefined;
}

/**
 * Check if should parse port argument
 */
function shouldParsePort(arg: string, hasNext: boolean, nextArg: string | undefined): boolean {
	return arg === '--port' && hasNext && nextArg !== undefined;
}

// Start server (only in non-test environments)
async function startMCPServer(): Promise<void> {
	// Parse command-line arguments first
	const cliOverrides = parseMCPArgs();

	// Apply CLI overrides before loading config
	if (Object.keys(cliOverrides).length > 0) {
		// Filter out non-config overrides

		const { port, transport, ...configOverrides } = cliOverrides;
		setGlobalCliOverrides(configOverrides as Record<string, boolean | string>);
	}

	// Load config first to ensure it's available for logger initialization
	const configLoader = getConfigLoader();
	await configLoader.load();

	const logger = getLogger();
	const version = await getPackageVersion();
	const server = new MCPOrchestratorServer(logger, version);

	// Only auto-start server in production/development, not in tests
	if (process.env['NODE_ENV'] !== 'test') {
		// Default to 'stdio' for better compatibility with Cursor/Claude Desktop
		const transport = (cliOverrides.transport as 'sse' | 'stdio') ?? 'stdio';
		const port = (cliOverrides.port as number) ?? 0; // 0 allows OS to pick an available port if default is taken

		logger.info('Initializing VALORA MCP Server', {
			environment: process.env['AI_MCP_ENABLED'] ? 'MCP' : 'CLI',
			nodeVersion: process.version,
			port,
			transport,
			version
		});
		void handleServerStart(server, transport, port, logger);
	} else {
		logger.debug('Skipping MCP server auto-start in test environment');
	}
}

/**
 * Handle server start with error handling
 */
async function handleServerStart(
	server: MCPOrchestratorServer,
	transport: 'sse' | 'stdio',
	port: number,
	logger: Logger
): Promise<void> {
	try {
		await server.start(transport, port);
	} catch (error: unknown) {
		logger.error('Failed to start MCP server', error as Error, {
			phase: 'initialization'
		});
		// Let the process exit naturally with error code
		// process.exit(1) would be redundant and prevents natural error propagation
	}
}

/**
 * Handle MCP server initialization with error handling
 */
async function handleMCPServerInit(): Promise<void> {
	try {
		await startMCPServer();
	} catch (error: unknown) {
		console.error('Failed to initialize MCP server:', error);
		process.exit(1);
	}
}

// Start the server
void handleMCPServerInit();
