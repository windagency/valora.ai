/**
 * Memory Extraction Service.
 *
 * Extracts episodic memory entries from feedback pipeline stage outputs.
 * Called automatically after the `feedback` command completes successfully.
 *
 * Confidence assignment rules:
 * - Error/failure → 'observed' (directly witnessed)
 * - User feedback (satisfaction, pain points) → 'verified' (human confirmed)
 * - Performance/bottleneck → 'observed'
 * - Auto-detected patterns (agent improvements, workflow optimisations) → 'inferred'
 */

import type { MemoryEntry } from '@windagency/valora-plugin-api';

import { redactCredentials } from '@windagency/valora-runtime';

import { MemoryManager } from './manager.js';
import { runAutoMigrationIfNeeded } from './migration/auto-migrate.js';
import { getDefaultVaultDir, getLegacyJsonDir } from './vault/default-vault-dir.js';
import { VaultStore } from './vault/vault-store.js';

interface FeedbackOutputs {
	// From context-analyze stage
	agents_used?: string[];
	errors_encountered?: unknown[];
	files_changed?: string[] | { created?: string[]; deleted?: string[]; modified?: string[]; renamed?: string[] };
	retries?: number;
	// From review-feedback stage
	feedback_comments?: string;
	pain_points?: unknown[];
	satisfaction_score?: number;
	success_highlights?: unknown[];
	// From review-performance stage
	bottlenecks_identified?: unknown[];
	error_rate?: number;
	time_efficiency_score?: number;
	// From review-improvements stage
	agent_improvements?: unknown[];
	workflow_optimizations?: unknown[];
	// From context-identify stage
	commands_chain?: string[];
	workflow_executed?: string;
}

export class MemoryExtractionService {
	private readonly manager: MemoryManager;

	constructor(manager?: MemoryManager) {
		this.manager = manager ?? new MemoryManager(buildDefaultVaultStore());
	}

	async extractFromFeedbackOutputs(
		stageOutputs: Array<{ outputs: Record<string, unknown>; success: boolean }>,
		sessionId: string,
		agentRole: string
	): Promise<MemoryEntry[]> {
		const merged: FeedbackOutputs = stageOutputs
			.filter((s) => s.success)
			.reduce<FeedbackOutputs>((acc, s) => ({ ...acc, ...s.outputs }), {});

		// Extract relatedPaths from files_changed — normalise both the flat string[]
		// and the object shape { created, modified, deleted, renamed } that the LLM produces.
		const relatedPaths: string[] = normalisedFilesChanged(merged.files_changed);

		// Call the four private extraction methods and collect all entries
		const [errorEntries, feedbackEntries, bottleneckEntries, patternEntries] = await Promise.all([
			this.extractErrorPatterns(merged, sessionId, agentRole, relatedPaths),
			this.extractUserFeedback(merged, sessionId, agentRole, relatedPaths),
			this.extractBottlenecks(merged, sessionId, agentRole, relatedPaths),
			this.extractPatterns(merged, sessionId, agentRole, relatedPaths)
		]);

		return [...errorEntries, ...feedbackEntries, ...bottleneckEntries, ...patternEntries];
	}

	private async extractBottlenecks(
		outputs: FeedbackOutputs,
		sessionId: string,
		agentRole: string,
		relatedPaths: string[]
	): Promise<MemoryEntry[]> {
		if (!Array.isArray(outputs.bottlenecks_identified) || outputs.bottlenecks_identified.length === 0) {
			return [];
		}

		const bottlenecks = outputs.bottlenecks_identified.slice(0, 3);
		const entries: MemoryEntry[] = [];

		for (const bottleneck of bottlenecks) {
			const entry = await this.manager.create('episodic', {
				agentRole,
				confidence: 'observed',
				content: `Performance bottleneck: ${redactCredentials(JSON.stringify(bottleneck)).result}`,
				isError: false,
				relatedPaths,
				sessionId,
				source: { command: 'feedback', label: 'post-session-extraction' },
				tags: ['performance', 'bottleneck', agentRole]
			});
			entries.push(entry);
		}

		return entries;
	}

	private async extractErrorPatterns(
		outputs: FeedbackOutputs,
		sessionId: string,
		agentRole: string,
		relatedPaths: string[]
	): Promise<MemoryEntry[]> {
		if (!Array.isArray(outputs.errors_encountered) || outputs.errors_encountered.length === 0) {
			return [];
		}

		const errors = outputs.errors_encountered.slice(0, 5);
		const entries: MemoryEntry[] = [];

		for (const error of errors) {
			const entry = await this.manager.create('episodic', {
				agentRole,
				confidence: 'observed',
				content: `Error during ${agentRole}: ${redactCredentials(JSON.stringify(error)).result}`,
				isError: true,
				relatedPaths,
				sessionId,
				source: { command: 'feedback', label: 'post-session-extraction' },
				tags: ['error', agentRole, 'feedback']
			});
			entries.push(entry);
		}

		return entries;
	}

	private async extractPatterns(
		outputs: FeedbackOutputs,
		sessionId: string,
		agentRole: string,
		relatedPaths: string[]
	): Promise<MemoryEntry[]> {
		const entries: MemoryEntry[] = [];

		if (Array.isArray(outputs.agent_improvements) && outputs.agent_improvements.length > 0) {
			const entry = await this.manager.create('episodic', {
				agentRole,
				confidence: 'inferred',
				content: `Agent improvement opportunity: ${redactCredentials(JSON.stringify(outputs.agent_improvements)).result}`,
				isError: false,
				relatedPaths,
				sessionId,
				source: { command: 'feedback', label: 'post-session-extraction' },
				tags: ['improvement', 'agent', agentRole]
			});
			entries.push(entry);
		}

		if (Array.isArray(outputs.workflow_optimizations) && outputs.workflow_optimizations.length > 0) {
			const entry = await this.manager.create('episodic', {
				agentRole,
				confidence: 'inferred',
				content: `Workflow optimization: ${redactCredentials(JSON.stringify(outputs.workflow_optimizations)).result}`,
				isError: false,
				relatedPaths,
				sessionId,
				source: { command: 'feedback', label: 'post-session-extraction' },
				tags: ['optimization', 'workflow']
			});
			entries.push(entry);
		}

		return entries;
	}

	private async extractUserFeedback(
		outputs: FeedbackOutputs,
		sessionId: string,
		agentRole: string,
		relatedPaths: string[]
	): Promise<MemoryEntry[]> {
		const entries: MemoryEntry[] = [];

		const satisfactionScore = outputs.satisfaction_score;
		const successHighlights = outputs.success_highlights;
		const painPoints = outputs.pain_points;

		if (
			(satisfactionScore !== undefined && satisfactionScore >= 8) ||
			(Array.isArray(successHighlights) && successHighlights.length > 0)
		) {
			const entry = await this.manager.create('episodic', {
				agentRole,
				confidence: 'verified',
				content: `Session rated ${satisfactionScore}/10. ${redactCredentials(outputs.feedback_comments ?? '').result}`,
				isError: false,
				relatedPaths,
				sessionId,
				source: { command: 'feedback', label: 'post-session-extraction' },
				tags: ['user-feedback', 'satisfaction', agentRole]
			});
			entries.push(entry);
		}

		if (Array.isArray(painPoints) && painPoints.length > 0) {
			const entry = await this.manager.create('episodic', {
				agentRole,
				confidence: 'observed',
				content: `Pain points: ${redactCredentials(JSON.stringify(painPoints)).result}`,
				isError: false,
				relatedPaths,
				sessionId,
				source: { command: 'feedback', label: 'post-session-extraction' },
				tags: ['pain-point', agentRole, 'feedback']
			});
			entries.push(entry);
		}

		return entries;
	}
}

function buildDefaultVaultStore(): VaultStore {
	const vaultDir = getDefaultVaultDir();
	runAutoMigrationIfNeeded(getLegacyJsonDir(), vaultDir);
	return new VaultStore(vaultDir);
}

function normalisedFilesChanged(raw: FeedbackOutputs['files_changed']): string[] {
	if (!raw) return [];
	if (Array.isArray(raw)) return raw.map((f) => f.trim()).filter((f) => f.length > 0);
	if (typeof raw === 'object') {
		return [...(raw.created ?? []), ...(raw.modified ?? []), ...(raw.deleted ?? []), ...(raw.renamed ?? [])]
			.map((f) => f.trim())
			.filter((f) => f.length > 0);
	}
	return [];
}

let extractionInstance: MemoryExtractionService | null = null;

export function getMemoryExtraction(): MemoryExtractionService {
	extractionInstance ??= new MemoryExtractionService();
	return extractionInstance;
}

export function resetMemoryExtraction(): void {
	extractionInstance = null;
}
