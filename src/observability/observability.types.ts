import { z } from 'zod';

export const LogLevelSchema = z.enum(['debug', 'error', 'info', 'warn']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const LogEntrySchema = z.object({
	context: z.record(z.string(), z.unknown()).optional(),
	level: LogLevelSchema,
	message: z.string(),
	service: z.string().optional(),
	timestampMs: z.number()
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const LogQuerySchema = z.object({
	level: LogLevelSchema.optional(),
	limit: z.number().int().min(1).max(1000).default(100),
	pattern: z.string().optional(),
	service: z.string().optional(),
	sinceMs: z.number().optional(),
	untilMs: z.number().optional()
});
export type LogQuery = z.infer<typeof LogQuerySchema>;

export const MetricValueSchema = z.object({
	labels: z.record(z.string(), z.string()).optional(),
	name: z.string(),
	type: z.enum(['counter', 'gauge']),
	value: z.number()
});
export type MetricValue = z.infer<typeof MetricValueSchema>;

export const MetricsQuerySchema = z.object({
	labelFilters: z.record(z.string(), z.string()).optional(),
	name: z.string().optional(),
	type: z.enum(['counter', 'gauge']).optional()
});
export type MetricsQuery = z.infer<typeof MetricsQuerySchema>;

export const TraceEventKindSchema = z.enum([
	'llm_request',
	'llm_response',
	'tool_call',
	'tool_result',
	'stage_complete'
]);
export type TraceEventKind = z.infer<typeof TraceEventKindSchema>;

export const TraceEventSchema = z.object({
	chainHash: z.string(),
	kind: TraceEventKindSchema,
	payload: z.record(z.string(), z.unknown()),
	sequenceNumber: z.number().int().min(0),
	sessionId: z.string(),
	stageId: z.string(),
	timestamp: z.string()
});
export type TraceEvent = z.infer<typeof TraceEventSchema>;

export interface TraceVerifyResult {
	eventCount: number;
	firstInvalidLine?: number;
	valid: boolean;
}
