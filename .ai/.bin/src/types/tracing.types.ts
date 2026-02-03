/**
 * Tracing Types
 *
 * Type definitions for OpenTelemetry distributed tracing.
 */

/**
 * Trace context that propagates through the execution pipeline
 */
export interface TraceContext {
	/** Unique trace ID (W3C trace context format: 32 hex chars) */
	traceId: string;
	/** Current span ID (W3C span format: 16 hex chars) */
	spanId: string;
	/** Parent span ID if this is a child span */
	parentSpanId?: string;
	/** Trace flags (e.g., sampled) */
	traceFlags?: number;
	/** Trace state for vendor-specific data */
	traceState?: string;
}

/**
 * Span status codes following OpenTelemetry conventions
 */
export enum SpanStatusCode {
	ERROR = 2,
	OK = 1,
	UNSET = 0
}

/**
 * Span kind following OpenTelemetry conventions
 */
export enum SpanKind {
	/** Internal operation within the application */
	INTERNAL = 0,
	/** Server-side handling of a remote request */
	SERVER = 1,
	/** Client-side of a remote request */
	CLIENT = 2,
	/** Producer of a message (async) */
	PRODUCER = 3,
	/** Consumer of a message (async) */
	CONSUMER = 4
}

/**
 * Span attributes following semantic conventions
 */
export interface SpanAttributes {
	[key: string]: boolean | boolean[] | number | number[] | string | string[] | undefined;
}

/**
 * Span event for recording discrete occurrences during a span
 */
export interface SpanEvent {
	/** Event name */
	name: string;
	/** Event timestamp */
	timestamp: number;
	/** Event attributes */
	attributes?: SpanAttributes;
}

/**
 * Span link for associating spans across traces
 */
export interface SpanLink {
	/** Trace context of the linked span */
	context: TraceContext;
	/** Link attributes */
	attributes?: SpanAttributes;
}

/**
 * Span data structure
 */
export interface SpanData {
	/** Span name/operation name */
	name: string;
	/** Trace context */
	context: TraceContext;
	/** Span kind */
	kind: SpanKind;
	/** Start time (Unix timestamp in milliseconds) */
	startTime: number;
	/** End time (Unix timestamp in milliseconds) */
	endTime?: number;
	/** Span status */
	status: {
		code: SpanStatusCode;
		message?: string;
	};
	/** Span attributes */
	attributes: SpanAttributes;
	/** Span events */
	events: SpanEvent[];
	/** Span links */
	links: SpanLink[];
	/** Resource attributes (service name, version, etc.) */
	resource: SpanAttributes;
}

/**
 * Options for creating a span
 */
export interface SpanOptions {
	/** Span kind */
	kind?: SpanKind;
	/** Initial attributes */
	attributes?: SpanAttributes;
	/** Links to other spans */
	links?: SpanLink[];
	/** Start time override */
	startTime?: number;
	/** Parent trace context */
	parent?: TraceContext;
}

/**
 * Tracer configuration
 */
export interface TracerConfig {
	/** Service name for resource identification */
	serviceName: string;
	/** Service version */
	serviceVersion: string;
	/** Environment (development, production, etc.) */
	environment: string;
	/** Whether tracing is enabled */
	enabled: boolean;
	/** Sampling rate (0.0 to 1.0) */
	samplingRate: number;
	/** Export endpoint URL (OTLP HTTP) */
	exporterUrl?: string;
	/** Export to console (for development) */
	consoleExport: boolean;
	/** Batch export interval in milliseconds */
	batchExportInterval: number;
	/** Maximum batch size */
	maxBatchSize: number;
	/** Maximum queue size */
	maxQueueSize: number;
}

/**
 * Semantic attribute keys following OpenTelemetry conventions
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const SemanticAttributes = {
	// Service
	SERVICE_NAME: 'service.name',
	SERVICE_NAMESPACE: 'service.namespace',
	SERVICE_VERSION: 'service.version',

	// LLM/AI
	LLM_COMPLETION_TOKENS: 'llm.completion_tokens',
	LLM_FINISH_REASON: 'llm.finish_reason',
	LLM_MODEL: 'llm.model',
	LLM_PROMPT_TOKENS: 'llm.prompt_tokens',
	LLM_PROVIDER: 'llm.provider',
	LLM_TEMPERATURE: 'llm.temperature',
	LLM_TOTAL_TOKENS: 'llm.total_tokens',

	// Tool execution
	TOOL_ARGUMENTS: 'tool.arguments',
	TOOL_CACHE_HIT: 'tool.cache_hit',
	TOOL_IDEMPOTENCY_KEY: 'tool.idempotency_key',
	TOOL_NAME: 'tool.name',
	TOOL_RESULT_SIZE: 'tool.result_size',
	TOOL_SUCCESS: 'tool.success',

	// Pipeline/Stage
	AGENT_ROLE: 'agent.role',
	COMMAND_NAME: 'command.name',
	PIPELINE_NAME: 'pipeline.name',
	STAGE_INDEX: 'stage.index',
	STAGE_NAME: 'stage.name',

	// Session
	REQUEST_ID: 'request.id',
	SESSION_ID: 'session.id',
	SESSION_RESUMED: 'session.resumed',

	// MCP
	MCP_TOOL_NAME: 'mcp.tool_name',
	MCP_TRANSPORT: 'mcp.transport',

	// Error
	ERROR_MESSAGE: 'error.message',
	ERROR_STACK: 'error.stack',
	ERROR_TYPE: 'error.type',

	// HTTP (for OTLP export)
	HTTP_METHOD: 'http.method',
	HTTP_STATUS_CODE: 'http.status_code',
	HTTP_URL: 'http.url'
} as const;

export type SemanticAttributeKey = (typeof SemanticAttributes)[keyof typeof SemanticAttributes];
