import type { SecurityEvent } from './security-event.types';

import { getAuditSink } from './audit-sink';
import { getCommandGuard } from './command-guard';
import { getCredentialGuard } from './credential-guard';
import { getPromptInjectionDetector } from './prompt-injection-detector';
import { getToolDefinitionValidator } from './tool-definition-validator';
import { getToolIntegrityMonitor } from './tool-integrity-monitor';

export interface SecurityAuditReport {
	events: SecurityEvent[];
	exportedAt: string;
	totalEvents: number;
}

/**
 * Aggregate the in-memory event buffers across every guard with the on-disk
 * JSONL audit sink. The sink is authoritative across process restarts; the
 * in-memory buffers reflect what happened in this process. The two are merged
 * and de-duplicated by event id so that the same event recorded both in
 * memory and on disk does not double-count.
 */
export function getSecurityAuditExporter(): () => SecurityAuditReport {
	return () => {
		const inMemory: SecurityEvent[] = [
			...getCommandGuard().getEvents(),
			...getCredentialGuard().getEvents(),
			...getPromptInjectionDetector().getEvents(),
			...getToolDefinitionValidator().getEvents(),
			...getToolIntegrityMonitor().getEvents()
		];

		const onDisk = getAuditSink().readAll();

		const seen = new Set<string>();
		const merged: SecurityEvent[] = [];
		for (const event of [...onDisk, ...inMemory]) {
			const key = event.id ?? `${event.timestamp.toString()}|${event.type}|${JSON.stringify(event.details)}`;
			if (seen.has(key)) continue;
			seen.add(key);
			merged.push(event);
		}

		merged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

		return {
			events: merged,
			exportedAt: new Date().toISOString(),
			totalEvents: merged.length
		};
	};
}
