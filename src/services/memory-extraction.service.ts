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

import { MemoryManager } from 'memory/manager';
import { MemoryStore } from 'memory/store';

import type { MemoryEntry } from 'types/memory.types';

interface FeedbackOutputs {
	// From context-analyze stage
	agents_used?: string[];
	errors_encountered?: unknown[];
	files_changed?: string[];
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
		this.manager = manager ?? new MemoryManager(new MemoryStore());
	}

	async extractFromFeedbackOutputs(
		stageOutputs: Array<{ outputs: Record<string, unknown>; success: boolean }>,
		sessionId: string,
		agentRole: string
	): Promise<MemoryEntry[]> {
		// Merge all successful stage outputs into a single FeedbackOutputs object
		const merged: FeedbackOutputs = {};
		for (const stage of stageOutputs) {
			if (stage.success) {
				Object.assign(merged, stage.outputs);
			}
		}

		// Extract relatedPaths from files_changed (normalise: trim, filter empty)
		const relatedPaths: string[] = (merged.files_changed ?? []).map((f) => f.trim()).filter((f) => f.length > 0);

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
				content: `Performance bottleneck: ${JSON.stringify(bottleneck)}`,
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
				content: `Error during ${agentRole}: ${JSON.stringify(error)}`,
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
				content: `Agent improvement opportunity: ${JSON.stringify(outputs.agent_improvements)}`,
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
				content: `Workflow optimisation: ${JSON.stringify(outputs.workflow_optimizations)}`,
				isError: false,
				relatedPaths,
				sessionId,
				source: { command: 'feedback', label: 'post-session-extraction' },
				tags: ['optimisation', 'workflow']
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
				content: `Session rated ${satisfactionScore}/10. ${outputs.feedback_comments ?? ''}`,
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
				content: `Pain points: ${JSON.stringify(painPoints)}`,
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

let extractionInstance: MemoryExtractionService | null = null;

export function getMemoryExtraction(): MemoryExtractionService {
	extractionInstance ??= new MemoryExtractionService();
	return extractionInstance;
}

export function resetMemoryExtraction(): void {
	extractionInstance = null;
}
