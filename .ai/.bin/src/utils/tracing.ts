/**
 * Distributed Tracing Service
 *
 * Provides OpenTelemetry-compatible distributed tracing for the application.
 *
 * Features:
 * - W3C Trace Context propagation
 * - Span lifecycle management
 * - Context-aware span creation
 * - Async context propagation
 * - Console and OTLP export options
 */

import { randomBytes } from 'crypto';
import { getLogger } from 'output/logger';
import {
	SemanticAttributes,
	type SpanAttributes,
	type SpanData,
	SpanKind,
	type SpanOptions,
	SpanStatusCode,
	type TraceContext,
	type TracerConfig
} from 'types/tracing.types';

import { formatErrorMessage } from './error-utils';

const logger = getLogger();

/**
 * Default tracer configuration
 */
const DEFAULT_CONFIG: TracerConfig = {
	batchExportInterval: 5000,
	consoleExport: process.env['OTEL_CONSOLE_EXPORT'] === 'true',
	enabled: process.env['OTEL_TRACING_ENABLED'] !== 'false',
	environment: process.env['NODE_ENV'] ?? 'development',
	exporterUrl: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'],
	maxBatchSize: 512,
	maxQueueSize: 2048,
	samplingRate: parseFloat(process.env['OTEL_SAMPLING_RATE'] ?? '1.0'),
	serviceName: 'valora',
	serviceVersion: '1.0.0'
};

/**
 * Active span storage using AsyncLocalStorage for context propagation
 */
const activeSpans = new Map<string, Span>();
let currentSpanId: string | undefined;

/**
 * Completed spans queue for batch export
 */
const completedSpans: SpanData[] = [];
let exportTimer: NodeJS.Timeout | null = null;

/**
 * Generate a random trace ID (32 hex characters)
 */
export function generateTraceId(): string {
	return randomBytes(16).toString('hex');
}

/**
 * Generate a random span ID (16 hex characters)
 */
export function generateSpanId(): string {
	return randomBytes(8).toString('hex');
}

/**
 * Span class for managing individual spans
 */
export class Span {
	private readonly data: SpanData;
	private ended = false;

	constructor(
		name: string,
		context: TraceContext,
		options: SpanOptions = {},
		private readonly config: TracerConfig
	) {
		this.data = {
			attributes: { ...options.attributes },
			context,
			events: [],
			kind: options.kind ?? SpanKind.INTERNAL,
			links: options.links ?? [],
			name,
			resource: {
				'deployment.environment': config.environment,
				[SemanticAttributes.SERVICE_NAME]: config.serviceName,
				[SemanticAttributes.SERVICE_VERSION]: config.serviceVersion
			},
			startTime: options.startTime ?? Date.now(),
			status: { code: SpanStatusCode.UNSET }
		};
	}

	/**
	 * Get the span's trace context
	 */
	getContext(): TraceContext {
		return { ...this.data.context };
	}

	/**
	 * Get the span ID
	 */
	getSpanId(): string {
		return this.data.context.spanId;
	}

	/**
	 * Get the trace ID
	 */
	getTraceId(): string {
		return this.data.context.traceId;
	}

	/**
	 * Set a single attribute
	 */
	setAttribute(key: string, value: boolean | boolean[] | number | number[] | string | string[]): this {
		if (!this.ended) {
			this.data.attributes[key] = value;
		}
		return this;
	}

	/**
	 * Set multiple attributes
	 */
	setAttributes(attributes: SpanAttributes): this {
		if (!this.ended) {
			Object.assign(this.data.attributes, attributes);
		}
		return this;
	}

	/**
	 * Add an event to the span
	 */
	addEvent(name: string, attributes?: SpanAttributes): this {
		if (!this.ended) {
			this.data.events.push({
				attributes,
				name,
				timestamp: Date.now()
			});
		}
		return this;
	}

	/**
	 * Set the span status to OK
	 */
	setOk(): this {
		if (!this.ended) {
			this.data.status = { code: SpanStatusCode.OK };
		}
		return this;
	}

	/**
	 * Set the span status to ERROR
	 */
	setError(message?: string): this {
		if (!this.ended) {
			this.data.status = { code: SpanStatusCode.ERROR, message };
		}
		return this;
	}

	/**
	 * Record an exception
	 */
	recordException(error: Error): this {
		if (!this.ended) {
			this.setError(error.message);
			this.addEvent('exception', {
				[SemanticAttributes.ERROR_MESSAGE]: error.message,
				[SemanticAttributes.ERROR_STACK]: error.stack?.substring(0, 1000),
				[SemanticAttributes.ERROR_TYPE]: error.name
			});
		}
		return this;
	}

	/**
	 * End the span
	 */
	end(endTime?: number): void {
		if (this.ended) {
			return;
		}

		this.ended = true;
		this.data.endTime = endTime ?? Date.now();

		// Remove from active spans
		activeSpans.delete(this.data.context.spanId);

		// If this was the current span, clear it
		if (currentSpanId === this.data.context.spanId) {
			currentSpanId = this.data.context.parentSpanId;
		}

		// Queue for export
		queueSpanForExport(this.data, this.config);
	}

	/**
	 * Check if span is recording
	 */
	isRecording(): boolean {
		return !this.ended;
	}

	/**
	 * Get span data (for export)
	 */
	getData(): SpanData {
		return { ...this.data };
	}

	/**
	 * Get duration in milliseconds
	 */
	getDuration(): number | undefined {
		if (this.data.endTime) {
			return this.data.endTime - this.data.startTime;
		}
		return undefined;
	}
}

/**
 * Tracer class for creating and managing spans
 */
export class Tracer {
	private readonly config: TracerConfig;

	constructor(config?: Partial<TracerConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };

		if (this.config.enabled) {
			startExportTimer(this.config);
		}
	}

	/**
	 * Check if tracing is enabled
	 */
	isEnabled(): boolean {
		return this.config.enabled;
	}

	/**
	 * Create a new span
	 */
	startSpan(name: string, options?: SpanOptions): Span {
		if (!this.config.enabled) {
			// Return a no-op span when disabled
			return new Span(name, this.createContext(), options, this.config);
		}

		// Determine parent context
		let parentContext: TraceContext | undefined;

		if (options?.parent) {
			parentContext = options.parent;
		} else if (currentSpanId) {
			const currentSpan = activeSpans.get(currentSpanId);
			if (currentSpan) {
				parentContext = currentSpan.getContext();
			}
		}

		// Create context for this span
		const context = this.createContext(parentContext);

		// Check sampling
		if (!this.shouldSample(context.traceId)) {
			// Return a no-op span that won't be exported
			const noopConfig = { ...this.config, enabled: false };
			return new Span(name, context, options, noopConfig);
		}

		const span = new Span(name, context, options, this.config);

		// Track active span
		activeSpans.set(context.spanId, span);
		currentSpanId = context.spanId;

		return span;
	}

	/**
	 * Get the current active span
	 */
	getCurrentSpan(): Span | undefined {
		if (currentSpanId) {
			return activeSpans.get(currentSpanId);
		}
		return undefined;
	}

	/**
	 * Get current trace context
	 */
	getCurrentContext(): TraceContext | undefined {
		return this.getCurrentSpan()?.getContext();
	}

	/**
	 * Execute a function within a span
	 */
	async withSpan<T>(name: string, options: SpanOptions, fn: (span: Span) => Promise<T>): Promise<T> {
		const span = this.startSpan(name, options);

		try {
			const result = await fn(span);
			span.setOk();
			return result;
		} catch (error) {
			span.recordException(error as Error);
			throw error;
		} finally {
			span.end();
		}
	}

	/**
	 * Execute a synchronous function within a span
	 */
	withSpanSync<T>(name: string, options: SpanOptions, fn: (span: Span) => T): T {
		const span = this.startSpan(name, options);

		try {
			const result = fn(span);
			span.setOk();
			return result;
		} catch (error) {
			span.recordException(error as Error);
			throw error;
		} finally {
			span.end();
		}
	}

	/**
	 * Create a trace context
	 */
	private createContext(parent?: TraceContext): TraceContext {
		return {
			parentSpanId: parent?.spanId,
			spanId: generateSpanId(),
			traceFlags: parent?.traceFlags ?? 1, // sampled
			traceId: parent?.traceId ?? generateTraceId()
		};
	}

	/**
	 * Determine if a trace should be sampled
	 */
	private shouldSample(traceId: string): boolean {
		if (this.config.samplingRate >= 1.0) {
			return true;
		}
		if (this.config.samplingRate <= 0.0) {
			return false;
		}

		// Use trace ID for consistent sampling
		const hash = parseInt(traceId.substring(0, 8), 16);
		const threshold = Math.floor(this.config.samplingRate * 0xffffffff);
		return hash < threshold;
	}

	/**
	 * Shutdown the tracer and flush pending spans
	 */
	async shutdown(): Promise<void> {
		if (exportTimer) {
			clearInterval(exportTimer);
			exportTimer = null;
		}

		// End any active spans
		for (const span of activeSpans.values()) {
			span.end();
		}

		// Flush remaining spans
		await flushSpans(this.config);
	}

	/**
	 * Get tracer configuration
	 */
	getConfig(): TracerConfig {
		return { ...this.config };
	}
}

/**
 * Queue a span for batch export
 */
function queueSpanForExport(span: SpanData, config: TracerConfig): void {
	if (!config.enabled) {
		return;
	}

	completedSpans.push(span);

	// Export immediately if queue is full
	if (completedSpans.length >= config.maxBatchSize) {
		flushSpans(config).catch((error) => {
			logger.warn('Failed to flush spans', { error: String(error) });
		});
	}
}

/**
 * Start the export timer
 */
function startExportTimer(config: TracerConfig): void {
	if (exportTimer) {
		return;
	}

	exportTimer = setInterval(() => {
		if (completedSpans.length > 0) {
			flushSpans(config).catch((error) => {
				logger.warn('Failed to flush spans', { error: String(error) });
			});
		}
	}, config.batchExportInterval);

	exportTimer.unref();
}

/**
 * Flush completed spans to exporters
 */
async function flushSpans(config: TracerConfig): Promise<void> {
	if (completedSpans.length === 0) {
		return;
	}

	const spans = completedSpans.splice(0, config.maxBatchSize);

	// Console export
	if (config.consoleExport) {
		exportToConsole(spans);
	}

	// OTLP export
	if (config.exporterUrl) {
		await exportToOTLP(spans, config.exporterUrl);
	}
}

/**
 * Export spans to console (for development)
 */
function exportToConsole(spans: SpanData[]): void {
	for (const span of spans) {
		const duration = span.endTime ? span.endTime - span.startTime : 0;
		const status = span.status.code === SpanStatusCode.ERROR ? 'ERROR' : 'OK';

		logger.debug(`[TRACE] ${span.name}`, {
			attributes: span.attributes,
			duration_ms: duration,
			parentSpanId: span.context.parentSpanId,
			spanId: span.context.spanId,
			status,
			traceId: span.context.traceId
		});
	}
}

/**
 * Export spans to OTLP endpoint
 */
async function exportToOTLP(spans: SpanData[], endpoint: string): Promise<void> {
	try {
		const payload = {
			resourceSpans: [
				{
					resource: {
						attributes: spans[0]
							? Object.entries(spans[0].resource).map(([key, value]) => ({
									key,
									value: formatAttributeValue(value)
								}))
							: []
					},
					scopeSpans: [
						{
							scope: {
								name: 'valora',
								version: DEFAULT_CONFIG.serviceVersion
							},
							spans: spans.map(formatSpanForOTLP)
						}
					]
				}
			]
		};

		const response = await globalThis.fetch(`${endpoint}/v1/traces`, {
			body: JSON.stringify(payload),
			headers: {
				'Content-Type': 'application/json'
			},
			method: 'POST'
		});

		if (!response.ok) {
			logger.warn('OTLP export failed', {
				status: response.status,
				statusText: response.statusText
			});
		}
	} catch (error) {
		logger.warn('OTLP export error', {
			error: formatErrorMessage(error)
		});
	}
}

/**
 * Format a span for OTLP protocol
 */
function formatSpanForOTLP(span: SpanData): Record<string, unknown> {
	return {
		attributes: Object.entries(span.attributes).map(([key, value]) => ({
			key,
			value: formatAttributeValue(value)
		})),
		endTimeUnixNano: (span.endTime ?? span.startTime) * 1_000_000,
		events: span.events.map((event) => ({
			attributes: event.attributes
				? Object.entries(event.attributes).map(([key, value]) => ({
						key,
						value: formatAttributeValue(value)
					}))
				: [],
			name: event.name,
			timeUnixNano: event.timestamp * 1_000_000
		})),
		kind: span.kind + 1, // OTLP uses 1-based indexing
		links: span.links.map((link) => ({
			attributes: link.attributes
				? Object.entries(link.attributes).map(([key, value]) => ({
						key,
						value: formatAttributeValue(value)
					}))
				: [],
			spanId: link.context.spanId,
			traceId: link.context.traceId
		})),
		name: span.name,
		parentSpanId: span.context.parentSpanId,
		spanId: span.context.spanId,
		startTimeUnixNano: span.startTime * 1_000_000,
		status: {
			code: span.status.code,
			message: span.status.message
		},
		traceId: span.context.traceId
	};
}

/**
 * Format an attribute value for OTLP
 */
function formatAttributeValue(value: unknown): Record<string, unknown> {
	if (typeof value === 'string') {
		return { stringValue: value };
	}
	if (typeof value === 'number') {
		return Number.isInteger(value) ? { intValue: value } : { doubleValue: value };
	}
	if (typeof value === 'boolean') {
		return { boolValue: value };
	}
	if (Array.isArray(value)) {
		return {
			arrayValue: {
				values: value.map((v) => formatAttributeValue(v))
			}
		};
	}
	return { stringValue: String(value) };
}

/**
 * Parse W3C Trace Context header (traceparent)
 */
export function parseTraceParent(header: string): null | TraceContext {
	// Format: version-traceId-spanId-flags
	// Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
	const parts = header.split('-');
	if (parts.length !== 4) {
		return null;
	}

	const [version, traceId, spanId, flags] = parts as [string, string, string, string];

	if (version !== '00' || traceId.length !== 32 || spanId.length !== 16) {
		return null;
	}

	return {
		spanId,
		traceFlags: parseInt(flags, 16),
		traceId
	};
}

/**
 * Format trace context as W3C Trace Context header (traceparent)
 */
export function formatTraceParent(context: TraceContext): string {
	const flags = (context.traceFlags ?? 1).toString(16).padStart(2, '0');
	return `00-${context.traceId}-${context.spanId}-${flags}`;
}

/**
 * Singleton tracer instance
 */
let globalTracer: null | Tracer = null;

/**
 * Get the global tracer instance
 */
export function getTracer(config?: Partial<TracerConfig>): Tracer {
	if (!globalTracer || config) {
		globalTracer = new Tracer(config);
	}
	return globalTracer;
}

/**
 * Reset the global tracer and all tracing state (for testing)
 */
export async function resetTracer(): Promise<void> {
	if (globalTracer) {
		await globalTracer.shutdown();
		globalTracer = null;
	}

	// Clear module-level state
	activeSpans.clear();
	currentSpanId = undefined;
	completedSpans.length = 0;

	if (exportTimer) {
		clearInterval(exportTimer);
		exportTimer = null;
	}
}

/**
 * Convenience function to start a span using the global tracer
 */
export function startSpan(name: string, options?: SpanOptions): Span {
	return getTracer().startSpan(name, options);
}

/**
 * Convenience function to get the current span
 */
export function getCurrentSpan(): Span | undefined {
	return getTracer().getCurrentSpan();
}

/**
 * Convenience function to get current trace context
 */
export function getCurrentTraceContext(): TraceContext | undefined {
	return getTracer().getCurrentContext();
}

/**
 * Decorator for tracing async methods
 */
export function traced(
	spanName?: string,
	options?: Omit<SpanOptions, 'parent'>
): (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor {
	return function (_target: unknown, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
		const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;

		descriptor.value = async function (...args: unknown[]): Promise<unknown> {
			const name = spanName ?? `${(this as object).constructor.name}.${propertyKey}`;
			const tracer = getTracer();

			return tracer.withSpan(name, options ?? {}, async (span) => {
				// Add method arguments as attributes if they're primitives
				args.forEach((arg, index) => {
					if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
						span.setAttribute(`arg.${index}`, arg);
					}
				});

				return originalMethod.apply(this, args);
			});
		};

		return descriptor;
	};
}

/**
 * Decorator for tracing sync methods
 */
export function tracedSync(
	spanName?: string,
	options?: Omit<SpanOptions, 'parent'>
): (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor {
	return function (_target: unknown, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
		const originalMethod = descriptor.value as (...args: unknown[]) => unknown;

		descriptor.value = function (...args: unknown[]): unknown {
			const name = spanName ?? `${(this as object).constructor.name}.${propertyKey}`;
			const tracer = getTracer();

			return tracer.withSpanSync(name, options ?? {}, (span) => {
				args.forEach((arg, index) => {
					if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
						span.setAttribute(`arg.${index}`, arg);
					}
				});

				return originalMethod.apply(this, args);
			});
		};

		return descriptor;
	};
}
