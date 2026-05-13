/**
 * ID generation utilities. Wraps nanoid so consumers do not depend on the
 * library directly — keeps Valora's adapter-pattern arch rule satisfied.
 */

import { nanoid } from 'nanoid';

const DEFAULT_ID_LENGTH = 21;

export function generateDecisionId(): string {
	return `decision-${nanoid(12)}`;
}

export function generateExplorationId(): string {
	return `exp-${nanoid(10)}`;
}

export function generateId(length?: number): string {
	return nanoid(length ?? DEFAULT_ID_LENGTH);
}

export function generateInsightId(): string {
	return `insight-${nanoid(12)}`;
}

export function generateMemoryId(): string {
	return `mem-${nanoid(12)}`;
}

export function generateSessionId(): string {
	return nanoid(12);
}

export function generateShortId(): string {
	return nanoid(6);
}
