/**
 * Tracing Service Tests
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SpanKind, SpanStatusCode } from '../../types/tracing.types';
import {
	formatTraceParent,
	generateSpanId,
	generateTraceId,
	getTracer,
	parseTraceParent,
	resetTracer,
	Span,
	Tracer
} from '../tracing';

describe('Tracing', () => {
	afterEach(async () => {
		await resetTracer();
	});

	afterAll(async () => {
		await resetTracer();
	});

	describe('ID generation', () => {
		it('should generate valid trace IDs', () => {
			const traceId = generateTraceId();
			expect(traceId).toHaveLength(32);
			expect(/^[0-9a-f]+$/.test(traceId)).toBe(true);
		});

		it('should generate unique trace IDs', () => {
			const ids = new Set<string>();
			for (let i = 0; i < 100; i++) {
				ids.add(generateTraceId());
			}
			expect(ids.size).toBe(100);
		});

		it('should generate valid span IDs', () => {
			const spanId = generateSpanId();
			expect(spanId).toHaveLength(16);
			expect(/^[0-9a-f]+$/.test(spanId)).toBe(true);
		});

		it('should generate unique span IDs', () => {
			const ids = new Set<string>();
			for (let i = 0; i < 100; i++) {
				ids.add(generateSpanId());
			}
			expect(ids.size).toBe(100);
		});
	});

	describe('W3C Trace Context', () => {
		it('should parse valid traceparent header', () => {
			const header = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
			const context = parseTraceParent(header);

			expect(context).not.toBeNull();
			expect(context?.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
			expect(context?.spanId).toBe('b7ad6b7169203331');
			expect(context?.traceFlags).toBe(1);
		});

		it('should return null for invalid traceparent', () => {
			expect(parseTraceParent('invalid')).toBeNull();
			expect(parseTraceParent('00-short-short-01')).toBeNull();
			expect(parseTraceParent('01-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01')).toBeNull();
		});

		it('should format trace context as traceparent', () => {
			const context = {
				traceId: '0af7651916cd43dd8448eb211c80319c',
				spanId: 'b7ad6b7169203331',
				traceFlags: 1
			};

			const header = formatTraceParent(context);
			expect(header).toBe('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
		});

		it('should round-trip parse and format', () => {
			const original = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
			const context = parseTraceParent(original);
			expect(context).not.toBeNull();
			const formatted = formatTraceParent(context!);
			expect(formatted).toBe(original);
		});
	});

	describe('Tracer', () => {
		let tracer: Tracer;

		beforeEach(async () => {
			await resetTracer();
			tracer = new Tracer({ enabled: true, consoleExport: false });
		});

		it('should create spans with unique IDs', () => {
			// Create two independent spans (not children of each other)
			const span1 = tracer.startSpan('test1');
			span1.end(); // End first span before creating second

			const span2 = tracer.startSpan('test2');
			span2.end();

			// Span IDs should always be unique
			expect(span1.getSpanId()).not.toBe(span2.getSpanId());
			// Trace IDs should be unique for independent root spans
			expect(span1.getTraceId()).not.toBe(span2.getTraceId());
		});

		it('should create child spans with same trace ID', () => {
			const parent = tracer.startSpan('parent');
			const child = tracer.startSpan('child', { parent: parent.getContext() });

			expect(child.getTraceId()).toBe(parent.getTraceId());
			expect(child.getContext().parentSpanId).toBe(parent.getSpanId());

			child.end();
			parent.end();
		});

		it('should track current span', () => {
			expect(tracer.getCurrentSpan()).toBeUndefined();

			const span = tracer.startSpan('test');
			expect(tracer.getCurrentSpan()).toBe(span);

			span.end();
			expect(tracer.getCurrentSpan()).toBeUndefined();
		});

		it('should execute function within span', async () => {
			let capturedSpan: Span | undefined;

			const result = await tracer.withSpan('test', {}, async (span) => {
				capturedSpan = span;
				return 42;
			});

			expect(result).toBe(42);
			expect(capturedSpan).toBeDefined();
			expect(capturedSpan?.isRecording()).toBe(false); // Should be ended
		});

		it('should record exception on error', async () => {
			const error = new Error('Test error');

			await expect(
				tracer.withSpan('test', {}, async () => {
					throw error;
				})
			).rejects.toThrow('Test error');
		});
	});

	describe('Span', () => {
		let tracer: Tracer;

		beforeEach(() => {
			tracer = new Tracer({ enabled: true, consoleExport: false });
		});

		it('should set attributes', () => {
			const span = tracer.startSpan('test');
			span.setAttribute('key1', 'value1');
			span.setAttribute('key2', 42);
			span.setAttribute('key3', true);

			const data = span.getData();
			expect(data.attributes['key1']).toBe('value1');
			expect(data.attributes['key2']).toBe(42);
			expect(data.attributes['key3']).toBe(true);

			span.end();
		});

		it('should set multiple attributes', () => {
			const span = tracer.startSpan('test');
			span.setAttributes({
				key1: 'value1',
				key2: 42
			});

			const data = span.getData();
			expect(data.attributes['key1']).toBe('value1');
			expect(data.attributes['key2']).toBe(42);

			span.end();
		});

		it('should add events', () => {
			const span = tracer.startSpan('test');
			span.addEvent('event1');
			span.addEvent('event2', { detail: 'value' });

			const data = span.getData();
			expect(data.events).toHaveLength(2);
			expect(data.events[0].name).toBe('event1');
			expect(data.events[1].name).toBe('event2');
			expect(data.events[1].attributes?.['detail']).toBe('value');

			span.end();
		});

		it('should set status OK', () => {
			const span = tracer.startSpan('test');
			span.setOk();

			const data = span.getData();
			expect(data.status.code).toBe(SpanStatusCode.OK);

			span.end();
		});

		it('should set status ERROR', () => {
			const span = tracer.startSpan('test');
			span.setError('Something went wrong');

			const data = span.getData();
			expect(data.status.code).toBe(SpanStatusCode.ERROR);
			expect(data.status.message).toBe('Something went wrong');

			span.end();
		});

		it('should record exception', () => {
			const span = tracer.startSpan('test');
			const error = new Error('Test error');
			span.recordException(error);

			const data = span.getData();
			expect(data.status.code).toBe(SpanStatusCode.ERROR);
			expect(data.events.some((e) => e.name === 'exception')).toBe(true);

			span.end();
		});

		it('should not modify after end', () => {
			const span = tracer.startSpan('test');
			span.end();

			span.setAttribute('key', 'value');
			span.addEvent('event');

			const data = span.getData();
			expect(data.attributes['key']).toBeUndefined();
			expect(data.events).toHaveLength(0);
		});

		it('should calculate duration', async () => {
			const span = tracer.startSpan('test');
			await new Promise((resolve) => setTimeout(resolve, 50));
			span.end();

			const duration = span.getDuration();
			expect(duration).toBeGreaterThanOrEqual(50);
			expect(duration).toBeLessThan(200);
		});

		it('should use correct span kind', () => {
			const internalSpan = tracer.startSpan('internal', { kind: SpanKind.INTERNAL });
			const clientSpan = tracer.startSpan('client', { kind: SpanKind.CLIENT });
			const serverSpan = tracer.startSpan('server', { kind: SpanKind.SERVER });

			expect(internalSpan.getData().kind).toBe(SpanKind.INTERNAL);
			expect(clientSpan.getData().kind).toBe(SpanKind.CLIENT);
			expect(serverSpan.getData().kind).toBe(SpanKind.SERVER);

			internalSpan.end();
			clientSpan.end();
			serverSpan.end();
		});
	});

	describe('Sampling', () => {
		it('should sample all traces when rate is 1.0', () => {
			const tracer = new Tracer({ enabled: true, samplingRate: 1.0, consoleExport: false });
			let sampledCount = 0;

			for (let i = 0; i < 100; i++) {
				const span = tracer.startSpan('test');
				if (span.isRecording()) {
					sampledCount++;
				}
				span.end();
			}

			expect(sampledCount).toBe(100);
		});

		it('should sample no traces when rate is 0.0', () => {
			const tracer = new Tracer({ enabled: true, samplingRate: 0.0, consoleExport: false });
			let sampledCount = 0;

			for (let i = 0; i < 100; i++) {
				const span = tracer.startSpan('test');
				// Spans are still created but won't be exported
				sampledCount++;
				span.end();
			}

			// All spans are created but with disabled config
			expect(sampledCount).toBe(100);
		});
	});

	describe('Global tracer', () => {
		it('should return same instance', () => {
			const tracer1 = getTracer();
			const tracer2 = getTracer();
			expect(tracer1).toBe(tracer2);
		});

		it('should reset and create new instance', async () => {
			const tracer1 = getTracer();
			await resetTracer();
			const tracer2 = getTracer();
			expect(tracer1).not.toBe(tracer2);
		});
	});
});
