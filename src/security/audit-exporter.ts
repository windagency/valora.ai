import type { SecurityEvent } from './security-event.types';

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

export function getSecurityAuditExporter(): () => SecurityAuditReport {
	return () => {
		const events: SecurityEvent[] = [
			...getCommandGuard().getEvents(),
			...getCredentialGuard().getEvents(),
			...getPromptInjectionDetector().getEvents(),
			...getToolDefinitionValidator().getEvents(),
			...getToolIntegrityMonitor().getEvents()
		].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

		return {
			events,
			exportedAt: new Date().toISOString(),
			totalEvents: events.length
		};
	};
}
