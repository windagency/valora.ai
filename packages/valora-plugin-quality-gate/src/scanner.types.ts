import { z } from 'zod';

export const CONCERN_CATEGORIES = [
	'error-boundary',
	'retry',
	'circuit-breaker',
	'timeout',
	'logging',
	'metrics'
] as const;

export type ConcernCategory = (typeof CONCERN_CATEGORIES)[number];
// eslint-disable-next-line perfectionist/sort-union-types -- severity is ordered high→medium→low, not alphabetically
export type Severity = 'high' | 'medium' | 'low';
export type ViolationConcern = 'import' | ConcernCategory;

export const AUDIT_CONFIG_SCHEMA = z.object({
	concerns: z.array(z.enum(CONCERN_CATEGORIES)).default([...CONCERN_CATEGORIES]),
	densityFloor: z.number().min(0).default(1.0),
	depth: z.number().int().min(1).default(2),
	exclude: z.array(z.string()).default([]),
	threshold: z.number().int().min(2).default(3)
});

export type AuditConfig = z.infer<typeof AUDIT_CONFIG_SCHEMA>;

export interface AuditReport {
	depth: number;
	rootPath: string;
	scannedAt: string;
	siblingGroups: SiblingGroup[];
	summary: {
		highSeverity: number;
		lowSeverity: number;
		mediumSeverity: number;
		note?: string;
		totalViolations: number;
	};
	threshold: number;
	warnings: string[];
}

export interface SiblingGroup {
	parentPath: string;
	siblings: string[];
	violations: Violation[];
}

export interface Violation {
	affectedSiblings: string[];
	concern: ViolationConcern;
	severity: Severity;
	suggestedExtractionPath: string;
	topKeywords: string[];
}
