/**
 * MCP (Model Context Protocol) Type Definitions
 */

import type { ContentType } from './common.types';
import type { ProviderName } from './provider-names.types';

/**
 * Base content interface for MCP tool results
 */
export interface BaseContent {
	_meta?: Record<string, unknown>;
	type: ContentType;
}

/**
 * Text content for MCP tool results
 */
export interface TextContent extends BaseContent {
	text: string;
	type: 'text';
}

/**
 * Image content for MCP tool results
 */
export interface ImageContent extends BaseContent {
	data: string;
	mimeType: string;
	type: 'image';
}

/**
 * Audio content for MCP tool results
 */
export interface AudioContent extends BaseContent {
	data: string;
	mimeType: string;
	type: 'audio';
}

/**
 * Resource content for MCP tool results
 */
export interface ResourceContent extends BaseContent {
	blob?: string;
	mimeType?: string;
	text?: string;
	type: 'resource';
	uri: string;
}

/**
 * Union type for all MCP tool result content types
 */
export type ToolResultContent = AudioContent | ImageContent | ResourceContent | TextContent;

/**
 * Options for MCP sampling request
 */
export interface MCPSamplingOptions {
	maxTokens?: number;
	messages: Array<{ content: string; role: string }>;
	modelPreferences?: {
		hints?: Array<{ name: string }>;
		intelligencePriority?: number;
	};
	stopSequences?: string[];
	systemPrompt?: string;
	temperature?: number;
}

/**
 * Result from MCP sampling request
 */
export interface MCPSamplingResult {
	content: string;
	model?: string;
	stopReason?: string;
}

/**
 * Service interface for MCP sampling capabilities
 *
 * This abstraction allows CursorProvider to request AI completions
 * from the host (Cursor) via MCP without directly coupling to the
 * MCP server implementation.
 */
export interface MCPSamplingService {
	/**
	 * Request a completion from the host AI via MCP sampling
	 *
	 * @param options - Sampling options including messages and model preferences
	 * @returns Promise resolving to the completion result
	 * @throws Error if sampling is not supported or fails
	 */
	requestSampling(options: MCPSamplingOptions): Promise<MCPSamplingResult>;
}

/**
 * Tool call arguments from MCP clients (Cursor)
 */
export interface ToolCallArgs {
	args?: string[];
	model?: string;
	provider?: ProviderName;
	requestId?: string;
	sessionId?: string;
}

/**
 * MCP Server instance capabilities
 *
 * Defines the public interface of the MCP server that can be
 * stored in context and used by providers.
 */
export interface MCPServerInstance {
	/**
	 * Request sampling from the MCP client (Cursor)
	 */
	requestSampling(options: MCPSamplingOptions): Promise<MCPSamplingResult>;
}

/**
 * Result returned by MCP tool handlers
 *
 * Matches the MCP SDK's CallToolResult interface but simplified for our use case.
 */
export interface ToolResult {
	[key: string]: unknown;
	content: ToolResultContent[];
	isError?: boolean;
	metadata?: Record<string, unknown>;
}
