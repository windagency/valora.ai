import { randomBytes } from 'crypto';

// URL-safe alphabet identical to nanoid's default: A–Z a–z 0–9 _ -  (64 chars)
// 256 / 64 = 4 exactly → no modulo bias.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const DEFAULT_ID_LENGTH = 21;

export function generateDecisionId(): string {
	return `decision-${randomId(12)}`;
}

export function generateExplorationId(): string {
	return `exp-${randomId(10)}`;
}

export function generateId(length?: number): string {
	return randomId(length ?? DEFAULT_ID_LENGTH);
}

export function generateInsightId(): string {
	return `insight-${randomId(12)}`;
}

export function generateMemoryId(): string {
	return `mem-${randomId(12)}`;
}

export function generateSessionId(): string {
	return randomId(12);
}

export function generateShortId(): string {
	return randomId(6);
}

function randomId(length: number): string {
	return Array.from(randomBytes(length), (b) => ALPHABET[b % 64]).join('');
}
