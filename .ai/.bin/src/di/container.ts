/**
 * Dependency Injection Container
 *
 * Provides a service locator pattern for better dependency management
 * and testability. Eliminates global state usage and promotes proper DI.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { CommandExecutor } from 'cli/command-executor';
import { DocumentApprovalWorkflow } from 'cli/document-approval';
import { DocumentOutputProcessor } from 'cli/document-output-processor';
import { CLIProviderResolver } from 'cli/provider-resolver';
import { CLISessionManager } from 'cli/session-manager';
import { getConfigLoader } from 'config/loader';
import { AgentLoader } from 'executor/agent-loader';
import { CommandIsolationExecutor } from 'executor/command-isolation.executor';
import { CommandLoader } from 'executor/command-loader';
import { PipelineExecutor } from 'executor/pipeline';
import { PromptLoader } from 'executor/prompt-loader';
import { StageExecutor } from 'executor/stage-executor';
// Initialize providers before importing registry (triggers self-registration)
import 'llm/providers';
import type { ToolCallArgs } from 'types/mcp.types';

import { getProviderRegistry } from 'llm/registry';
import { MCPRequestHandler } from 'mcp/request-handler';
import { MCPSamplingServiceImpl } from 'mcp/sampling-service';
import { MCPToolRegistry } from 'mcp/tool-registry';
import { type ConsoleOutput, getConsoleOutput } from 'output/console-output';
import { getHeaderFormatter } from 'output/header-formatter';
import { getLogger } from 'output/logger';
import { getRenderer, type MarkdownRenderer } from 'output/markdown';
import { getProgress } from 'output/progress';
import {
	AgentCapabilityMatcherService,
	AgentCapabilityRegistryService,
	ContextAnalyzerService,
	DocumentDetectorService,
	DocumentPathResolverService,
	DocumentTemplateService,
	DocumentWriterService,
	DynamicAgentResolverService,
	TaskClassifierService
} from 'services/index';
import { SessionLifecycle } from 'session/lifecycle';
import { SessionStore } from 'session/store';
import { getRateLimiter } from 'utils/rate-limiter';

/**
 * Service identifiers for type-safe dependency resolution
 */
export const SERVICE_IDENTIFIERS = {
	AGENT_CAPABILITY_MATCHER: Symbol('AgentCapabilityMatcherService'),
	AGENT_CAPABILITY_REGISTRY: Symbol('AgentCapabilityRegistryService'),
	AGENT_LOADER: Symbol('AgentLoader'),
	// Orchestrators
	COMMAND_EXECUTOR: Symbol('CommandExecutor'),
	// Core services
	COMMAND_LOADER: Symbol('CommandLoader'),

	CONFIG_LOADER: Symbol('ConfigLoader'),
	CONSOLE_OUTPUT: Symbol('ConsoleOutput'),
	CONTEXT_ANALYZER: Symbol('ContextAnalyzerService'),

	// Document services
	DOCUMENT_APPROVAL: Symbol('DocumentApprovalWorkflow'),
	DOCUMENT_DETECTOR: Symbol('DocumentDetectorService'),
	DOCUMENT_OUTPUT_PROCESSOR: Symbol('DocumentOutputProcessor'),
	DOCUMENT_PATH_RESOLVER: Symbol('DocumentPathResolverService'),
	DOCUMENT_TEMPLATE: Symbol('DocumentTemplateService'),
	DOCUMENT_WRITER: Symbol('DocumentWriterService'),
	DYNAMIC_AGENT_RESOLVER: Symbol('DynamicAgentResolverService'),

	HEADER_FORMATTER: Symbol('HeaderFormatter'),
	ISOLATION_EXECUTOR: Symbol('CommandIsolationExecutor'),
	// Infrastructure
	LOGGER: Symbol('Logger'),

	MCP_SERVER: Symbol('MCPServer'),
	PIPELINE_EXECUTOR: Symbol('PipelineExecutor'),
	PROGRESS: Symbol('Progress'),
	PROMPT_LOADER: Symbol('PromptLoader'),
	// Providers and resolvers
	PROVIDER_REGISTRY: Symbol('ProviderRegistry'),

	PROVIDER_RESOLVER: Symbol('CLIProviderResolver'),
	RATE_LIMITER: Symbol('RateLimiter'),
	RENDERER: Symbol('Renderer'),
	REQUEST_HANDLER: Symbol('MCPRequestHandler'),

	SAMPLING_SERVICE: Symbol('MCPSamplingServiceImpl'),

	// Session management
	SESSION_LIFECYCLE: Symbol('SessionLifecycle'),
	SESSION_MANAGER: Symbol('CLISessionManager'),
	SESSION_STORE: Symbol('SessionStore'),
	// Dynamic Agent Selection Services
	TASK_CLASSIFIER: Symbol('TaskClassifierService'),
	// MCP services
	TOOL_REGISTRY: Symbol('MCPToolRegistry')
} as const;

/**
 * Dependency Injection Container
 *
 * Manages service registration and resolution with proper lifecycle management.
 */
export class DIContainer {
	private factories = new Map<symbol, () => unknown>();
	private services = new Map<symbol, unknown>();
	private singletons = new Map<symbol, unknown>();

	/**
	 * Register a service instance (singleton)
	 */
	register<T>(identifier: symbol, instance: T): void {
		this.services.set(identifier, instance);
	}

	/**
	 * Register a factory function for creating service instances
	 */
	registerFactory<T>(identifier: symbol, factory: () => T, singleton = true): void {
		if (singleton) {
			this.factories.set(identifier, () => {
				if (!this.singletons.has(identifier)) {
					this.singletons.set(identifier, factory());
				}
				return this.singletons.get(identifier);
			});
		} else {
			this.factories.set(identifier, factory);
		}
	}

	/**
	 * Resolve a service by identifier
	 */
	resolve<T>(identifier: symbol): T {
		// Check if already registered instance
		if (this.services.has(identifier)) {
			return this.services.get(identifier) as T;
		}

		// Check if factory exists
		if (this.factories.has(identifier)) {
			return this.factories.get(identifier)!() as T;
		}

		throw new Error(`Service not registered: ${identifier.toString()}`);
	}

	/**
	 * Check if a service is registered
	 */
	has(identifier: symbol): boolean {
		return this.services.has(identifier) || this.factories.has(identifier);
	}

	/**
	 * Clear all services (useful for testing)
	 */
	clear(): void {
		this.services.clear();
		this.factories.clear();
		this.singletons.clear();
	}
}

/**
 * Create a new DI container with default services
 */
export function createContainer(): DIContainer {
	const container = new DIContainer();
	setupDefaultServices(container);
	return container;
}

/**
 * Setup default services in the container
 */
function setupDefaultServices(container: DIContainer): void {
	// Core services
	container.registerFactory(SERVICE_IDENTIFIERS.COMMAND_LOADER, () => new CommandLoader());
	container.registerFactory(SERVICE_IDENTIFIERS.PROMPT_LOADER, () => new PromptLoader());
	container.registerFactory(SERVICE_IDENTIFIERS.AGENT_LOADER, () => new AgentLoader());

	// Executors depend on loaders
	container.registerFactory(SERVICE_IDENTIFIERS.PIPELINE_EXECUTOR, () => {
		const promptLoader = container.resolve(SERVICE_IDENTIFIERS.PROMPT_LOADER) as PromptLoader;
		const agentLoader = container.resolve(SERVICE_IDENTIFIERS.AGENT_LOADER) as AgentLoader;
		return new PipelineExecutor(promptLoader, agentLoader);
	});

	container.registerFactory(SERVICE_IDENTIFIERS.ISOLATION_EXECUTOR, () => {
		const promptLoader = container.resolve(SERVICE_IDENTIFIERS.PROMPT_LOADER) as PromptLoader;
		const agentLoader = container.resolve(SERVICE_IDENTIFIERS.AGENT_LOADER) as AgentLoader;
		const stageExecutor = new StageExecutor(promptLoader, agentLoader);
		return new CommandIsolationExecutor(stageExecutor);
	});

	// Session management
	container.registerFactory(SERVICE_IDENTIFIERS.SESSION_LIFECYCLE, () => {
		const sessionStore = container.resolve(SERVICE_IDENTIFIERS.SESSION_STORE) as SessionStore;
		return new SessionLifecycle(sessionStore);
	});
	container.registerFactory(SERVICE_IDENTIFIERS.SESSION_STORE, () => new SessionStore());

	// Session manager depends on session lifecycle
	container.registerFactory(SERVICE_IDENTIFIERS.SESSION_MANAGER, () => {
		const sessionLifecycle = container.resolve(SERVICE_IDENTIFIERS.SESSION_LIFECYCLE) as SessionLifecycle;
		return new CLISessionManager(sessionLifecycle);
	});

	// Providers and resolvers
	container.register(SERVICE_IDENTIFIERS.PROVIDER_REGISTRY, getProviderRegistry());
	container.registerFactory(SERVICE_IDENTIFIERS.PROVIDER_RESOLVER, () => new CLIProviderResolver());

	// Infrastructure services
	container.register(SERVICE_IDENTIFIERS.LOGGER, getLogger());
	container.register(SERVICE_IDENTIFIERS.PROGRESS, getProgress());
	container.register(SERVICE_IDENTIFIERS.RENDERER, getRenderer());
	container.register(SERVICE_IDENTIFIERS.RATE_LIMITER, getRateLimiter());
	container.register(SERVICE_IDENTIFIERS.CONFIG_LOADER, getConfigLoader());
	container.register(SERVICE_IDENTIFIERS.HEADER_FORMATTER, getHeaderFormatter());
	container.register(SERVICE_IDENTIFIERS.CONSOLE_OUTPUT, getConsoleOutput());

	// Document services (registered with proper dependency injection)
	container.registerFactory(SERVICE_IDENTIFIERS.DOCUMENT_PATH_RESOLVER, () => new DocumentPathResolverService());
	container.registerFactory(SERVICE_IDENTIFIERS.DOCUMENT_DETECTOR, () => new DocumentDetectorService());
	container.registerFactory(SERVICE_IDENTIFIERS.DOCUMENT_TEMPLATE, () => new DocumentTemplateService());

	container.registerFactory(SERVICE_IDENTIFIERS.DOCUMENT_WRITER, () => {
		const pathResolver = container.resolve(SERVICE_IDENTIFIERS.DOCUMENT_PATH_RESOLVER) as DocumentPathResolverService;
		return new DocumentWriterService(pathResolver);
	});

	container.registerFactory(SERVICE_IDENTIFIERS.DOCUMENT_APPROVAL, () => new DocumentApprovalWorkflow());

	container.registerFactory(SERVICE_IDENTIFIERS.DOCUMENT_OUTPUT_PROCESSOR, () => {
		const detector = container.resolve(SERVICE_IDENTIFIERS.DOCUMENT_DETECTOR) as DocumentDetectorService;
		const template = container.resolve(SERVICE_IDENTIFIERS.DOCUMENT_TEMPLATE) as DocumentTemplateService;
		const writer = container.resolve(SERVICE_IDENTIFIERS.DOCUMENT_WRITER) as DocumentWriterService;
		const approval = container.resolve(SERVICE_IDENTIFIERS.DOCUMENT_APPROVAL) as DocumentApprovalWorkflow;
		const consoleOutput = container.resolve(SERVICE_IDENTIFIERS.CONSOLE_OUTPUT) as ConsoleOutput;
		const renderer = container.resolve(SERVICE_IDENTIFIERS.RENDERER) as MarkdownRenderer;

		return new DocumentOutputProcessor({
			approval,
			consoleOutput,
			detector,
			renderer,
			template,
			writer
		});
	});

	// Command executor depends on multiple services
	container.registerFactory(SERVICE_IDENTIFIERS.COMMAND_EXECUTOR, () => {
		const commandLoader = container.resolve(SERVICE_IDENTIFIERS.COMMAND_LOADER) as CommandLoader;
		const promptLoader = container.resolve(SERVICE_IDENTIFIERS.PROMPT_LOADER) as PromptLoader;
		const agentLoader = container.resolve(SERVICE_IDENTIFIERS.AGENT_LOADER) as AgentLoader;
		const pipelineExecutor = container.resolve(SERVICE_IDENTIFIERS.PIPELINE_EXECUTOR) as PipelineExecutor;
		const isolationExecutor = container.resolve(SERVICE_IDENTIFIERS.ISOLATION_EXECUTOR) as CommandIsolationExecutor;
		const sessionLifecycle = container.resolve(SERVICE_IDENTIFIERS.SESSION_LIFECYCLE) as SessionLifecycle;
		const sessionManager = container.resolve(SERVICE_IDENTIFIERS.SESSION_MANAGER) as CLISessionManager;
		const providerResolver = container.resolve(SERVICE_IDENTIFIERS.PROVIDER_RESOLVER) as CLIProviderResolver;

		let dynamicAgentResolver: DynamicAgentResolverService | undefined;
		if (container.has(SERVICE_IDENTIFIERS.DYNAMIC_AGENT_RESOLVER)) {
			try {
				dynamicAgentResolver = container.resolve(
					SERVICE_IDENTIFIERS.DYNAMIC_AGENT_RESOLVER
				) as DynamicAgentResolverService;
			} catch {
				/*
				 * The resolution error is ignored because the application is designed to function without dynamic agent selection.
				 * It's an optional enhancement, not a core dependency.
				 *
				 * Graceful Degradation: App continues to work without dynamic agent selection if dependencies aren't available
				 * Feature Flag Compatible: Dynamic agent selection can be enabled/disabled via configuration
				 * Robust Initialisation: Prevents container initialisation failures due to optional feature issues
				 * Backwards Compatibility: Older configurations without all required services still work
				 */
			}
		}

		let mcpSampling: MCPSamplingServiceImpl | undefined;
		if (container.has(SERVICE_IDENTIFIERS.SAMPLING_SERVICE)) {
			try {
				mcpSampling = container.resolve(SERVICE_IDENTIFIERS.SAMPLING_SERVICE) as MCPSamplingServiceImpl;
			} catch {
				/*
				 * The resolution error is ignored because the application is designed to function without MCP sampling.
				 * It's an optional enhancement, not a core dependency.
				 *
				 * Dual Mode Support: App works in both CLI and MCP modes
				 * Progressive Enhancement: Cursor provider features activate when MCP sampling is available
				 * Robust Initialisation: Container setup doesn't fail if MCP services aren't initialised
				 * Feature Detection: Code can check hasMCPSampling() to adapt behaviour
				 * Backwards Compatibility: CLI usage doesn't require MCP server setup
				 */
			}
		}

		const documentOutputProcessor = container.resolve(
			SERVICE_IDENTIFIERS.DOCUMENT_OUTPUT_PROCESSOR
		) as DocumentOutputProcessor;

		return new CommandExecutor({
			agentLoader,
			commandLoader,
			documentOutputProcessor,
			dynamicAgentResolver,
			isolationExecutor,
			logger: container.resolve(SERVICE_IDENTIFIERS.LOGGER),
			mcpSampling,
			pipelineExecutor,
			promptLoader,
			providerResolver,
			sessionLifecycle,
			sessionManager
		});
	});

	// Dynamic Agent Selection Services
	container.registerFactory(SERVICE_IDENTIFIERS.TASK_CLASSIFIER, () => new TaskClassifierService());
	container.registerFactory(SERVICE_IDENTIFIERS.CONTEXT_ANALYZER, () => new ContextAnalyzerService());
	container.registerFactory(SERVICE_IDENTIFIERS.AGENT_CAPABILITY_REGISTRY, () => new AgentCapabilityRegistryService());

	// Agent capability matcher depends on registry
	container.registerFactory(SERVICE_IDENTIFIERS.AGENT_CAPABILITY_MATCHER, () => {
		const registry = container.resolve(SERVICE_IDENTIFIERS.AGENT_CAPABILITY_REGISTRY) as AgentCapabilityRegistryService;
		return new AgentCapabilityMatcherService(registry);
	});

	// Dynamic agent resolver depends on all other services
	container.registerFactory(SERVICE_IDENTIFIERS.DYNAMIC_AGENT_RESOLVER, () => {
		const taskClassifier = container.resolve(SERVICE_IDENTIFIERS.TASK_CLASSIFIER) as TaskClassifierService;
		const contextAnalyzer = container.resolve(SERVICE_IDENTIFIERS.CONTEXT_ANALYZER) as ContextAnalyzerService;
		const capabilityMatcher = container.resolve(
			SERVICE_IDENTIFIERS.AGENT_CAPABILITY_MATCHER
		) as AgentCapabilityMatcherService;
		const registry = container.resolve(SERVICE_IDENTIFIERS.AGENT_CAPABILITY_REGISTRY) as AgentCapabilityRegistryService;

		return new DynamicAgentResolverService(taskClassifier, contextAnalyzer, capabilityMatcher, registry);
	});

	// MCP services - these will be registered when MCP server is created
	// They depend on the MCP server instance itself
}

/**
 * Setup MCP-specific services in the container
 * Must be called after the MCP server is created
 */
export function setupMCPServices(container: DIContainer, mcpServer: McpServer): void {
	container.register(SERVICE_IDENTIFIERS.MCP_SERVER, mcpServer);

	// Register MCP services that depend on the server
	container.registerFactory(SERVICE_IDENTIFIERS.SAMPLING_SERVICE, () => {
		return new MCPSamplingServiceImpl(mcpServer);
	});

	container.registerFactory(SERVICE_IDENTIFIERS.REQUEST_HANDLER, () => {
		const commandExecutor = container.resolve(SERVICE_IDENTIFIERS.COMMAND_EXECUTOR) as CommandExecutor;
		return new MCPRequestHandler(commandExecutor);
	});

	container.registerFactory(SERVICE_IDENTIFIERS.TOOL_REGISTRY, () => {
		const commandLoader = container.resolve(SERVICE_IDENTIFIERS.COMMAND_LOADER) as CommandLoader;
		const requestHandler = container.resolve(SERVICE_IDENTIFIERS.REQUEST_HANDLER) as MCPRequestHandler;
		return new MCPToolRegistry(mcpServer, commandLoader, (commandName: string, args: ToolCallArgs) =>
			requestHandler.handleToolCall(commandName, args)
		);
	});
}
