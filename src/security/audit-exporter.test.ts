import { describe, expect, it } from 'vitest';

import { getSecurityAuditExporter } from './audit-exporter';

describe('getSecurityAuditExporter', () => {
	it('returns a function that produces an audit report', () => {
		const exporter = getSecurityAuditExporter();
		const report = exporter();

		expect(report).toHaveProperty('events');
		expect(report).toHaveProperty('exportedAt');
		expect(report).toHaveProperty('totalEvents');
		expect(Array.isArray(report.events)).toBe(true);
		expect(report.totalEvents).toBe(report.events.length);
	});

	it('exportedAt is a valid ISO date string', () => {
		const exporter = getSecurityAuditExporter();
		const report = exporter();
		expect(() => new Date(report.exportedAt)).not.toThrow();
		expect(new Date(report.exportedAt).toISOString()).toBe(report.exportedAt);
	});
});
