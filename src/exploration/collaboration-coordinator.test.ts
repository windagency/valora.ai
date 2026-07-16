import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('output/logger', () => ({
	getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() })
}));

import { CollaborationCoordinator } from './collaboration-coordinator';

describe('CollaborationCoordinator', () => {
	let tmpDir: string;
	let coordinator: CollaborationCoordinator;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), 'valora-collab-coordinator-'));
		coordinator = new CollaborationCoordinator(join(tmpDir, 'insights.json'), join(tmpDir, 'decisions.json'), 'exp-1');
	});

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true });
	});

	describe('publishInsight / getAllInsights', () => {
		it('returns an empty list before any insight has been published', async () => {
			expect(await coordinator.getAllInsights()).toEqual([]);
		});

		it('persists a published insight, assigning an id and timestamp', async () => {
			const insight = await coordinator.publishInsight({
				content: 'Approach A is faster',
				title: 'Benchmark result',
				type: 'finding',
				worktree_id: 'wt-1'
			});

			expect(insight.id).toMatch(/insight-/);
			expect(insight.title).toBe('Benchmark result');
			const all = await coordinator.getAllInsights();
			expect(all).toHaveLength(1);
			expect(all[0]?.id).toBe(insight.id);
		});

		it('accumulates multiple insights across separate calls', async () => {
			await coordinator.publishInsight({ content: 'a', title: 'first', type: 'finding', worktree_id: 'wt-1' });
			await coordinator.publishInsight({ content: 'b', title: 'second', type: 'finding', worktree_id: 'wt-2' });

			expect(await coordinator.getAllInsights()).toHaveLength(2);
		});
	});

	describe('insight querying', () => {
		beforeEach(async () => {
			await coordinator.publishInsight({
				content: 'perf detail',
				tags: ['perf'],
				title: 'Perf finding',
				type: 'finding',
				worktree_id: 'wt-1'
			});
			await coordinator.publishInsight({
				content: 'blocked on X',
				tags: ['blocker'],
				title: 'Blocker note',
				type: 'blocker',
				worktree_id: 'wt-2'
			});
		});

		it('getInsightsByType filters to the requested type', async () => {
			const findings = await coordinator.getInsightsByType('finding');
			expect(findings).toHaveLength(1);
			expect(findings[0]?.title).toBe('Perf finding');
		});

		it('getInsightsByTags filters to insights matching any given tag', async () => {
			const results = await coordinator.getInsightsByTags(['blocker']);
			expect(results).toHaveLength(1);
			expect(results[0]?.title).toBe('Blocker note');
		});

		it('getInsightsFromOthers excludes insights from the given worktree', async () => {
			const results = await coordinator.getInsightsFromOthers('wt-1');
			expect(results).toHaveLength(1);
			expect(results[0]?.worktree_id).toBe('wt-2');
		});

		it('getRecentInsights returns at most the last N insights', async () => {
			const recent = await coordinator.getRecentInsights(1);
			expect(recent).toHaveLength(1);
			expect(recent[0]?.title).toBe('Blocker note');
		});

		it('searchInsights matches on title, content, or tags (case-insensitive)', async () => {
			expect(await coordinator.searchInsights('PERF')).toHaveLength(1);
			expect(await coordinator.searchInsights('nonexistent')).toHaveLength(0);
		});
	});

	describe('proposeDecision / voteOnDecision — majority resolution', () => {
		async function proposeTwoOptionDecision(): Promise<string> {
			const decision = await coordinator.proposeDecision({
				options: [
					{ description: 'Do A', label: 'Option A' },
					{ description: 'Do B', label: 'Option B' }
				],
				topic: 'Which approach?',
				worktree_id: 'wt-1'
			});
			return decision.id;
		}

		it('assigns sequential option indices when proposing a decision', async () => {
			const decision = await coordinator.proposeDecision({
				options: [
					{ description: 'Do A', label: 'Option A' },
					{ description: 'Do B', label: 'Option B' }
				],
				topic: 'Which approach?',
				worktree_id: 'wt-1'
			});

			expect(decision.options.map((o) => o.index)).toEqual([0, 1]);
			expect(decision.chosen_option).toBeUndefined();
		});

		it('resolves a decision once a single voter votes (majority of 1 out of 1)', async () => {
			const decisionId = await proposeTwoOptionDecision();

			const result = await coordinator.voteOnDecision({
				decision_id: decisionId,
				option_index: 0,
				worktree_id: 'wt-1'
			});

			expect(result?.chosen_option).toBe(0);
		});

		it('KNOWN GAP: resolves as soon as the very first vote is cast, and never re-evaluates afterward', async () => {
			// voteOnDecision()'s "majority" is computed against votes CAST SO
			// FAR, not against a known pool of eligible worktrees (the type
			// system has no concept of "total expected voters"). With exactly
			// one vote cast, majorityThreshold = Math.ceil(1/2) = 1, which that
			// single vote trivially satisfies — so chosen_option is set after
			// the FIRST vote, before any other worktree has had a chance to
			// weigh in. Worse, the resolution loop only ever SETS
			// chosen_option, never clears it, so a later vote that breaks the
			// "majority" (e.g. creates a 1-1 tie) does not un-resolve it either.
			// Whether decisions should require a quorum of a KNOWN worktree
			// count, and whether resolution should be revisited on every vote,
			// is a product-behaviour question outside this test's scope to
			// decide — documented here rather than silently "fixed" by
			// guessing at intended semantics.
			const decisionId = await proposeTwoOptionDecision();

			const afterFirstVote = await coordinator.voteOnDecision({
				decision_id: decisionId,
				option_index: 0,
				worktree_id: 'wt-1'
			});
			expect(afterFirstVote?.chosen_option).toBe(0);

			const afterTiebreakVote = await coordinator.voteOnDecision({
				decision_id: decisionId,
				option_index: 1,
				worktree_id: 'wt-2'
			});
			// Still 0, even though the vote tally is now a 1-1 tie.
			expect(afterTiebreakVote?.chosen_option).toBe(0);
		});

		it('a later voter changing an existing vote still counts as one vote per worktree', async () => {
			const decisionId = await proposeTwoOptionDecision();
			await coordinator.voteOnDecision({ decision_id: decisionId, option_index: 0, worktree_id: 'wt-1' });

			const result = await coordinator.voteOnDecision({
				decision_id: decisionId,
				option_index: 1,
				worktree_id: 'wt-1'
			});

			expect(Object.keys(result?.votes ?? {})).toHaveLength(1);
			expect(result?.chosen_option).toBe(1);
		});

		it('returns null when voting on an unknown decision id', async () => {
			await proposeTwoOptionDecision();

			const result = await coordinator.voteOnDecision({
				decision_id: 'decision-does-not-exist',
				option_index: 0,
				worktree_id: 'wt-1'
			});

			expect(result).toBeNull();
		});
	});

	describe('getAllDecisions / getPendingDecisions / getResolvedDecisions / getDecision', () => {
		it('separates pending and resolved decisions correctly', async () => {
			const pending = await coordinator.proposeDecision({
				options: [{ description: 'A', label: 'A' }],
				topic: 'Pending topic',
				worktree_id: 'wt-1'
			});
			const toResolve = await coordinator.proposeDecision({
				options: [{ description: 'A', label: 'A' }],
				topic: 'Resolved topic',
				worktree_id: 'wt-1'
			});
			await coordinator.voteOnDecision({ decision_id: toResolve.id, option_index: 0, worktree_id: 'wt-1' });

			const pendingDecisions = await coordinator.getPendingDecisions();
			const resolvedDecisions = await coordinator.getResolvedDecisions();

			expect(pendingDecisions.map((d) => d.id)).toEqual([pending.id]);
			expect(resolvedDecisions.map((d) => d.id)).toEqual([toResolve.id]);
		});

		it('getDecision finds by id, returning null for an unknown id', async () => {
			const decision = await coordinator.proposeDecision({
				options: [{ description: 'A', label: 'A' }],
				topic: 'Topic',
				worktree_id: 'wt-1'
			});

			expect((await coordinator.getDecision(decision.id))?.id).toBe(decision.id);
			expect(await coordinator.getDecision('unknown')).toBeNull();
		});
	});

	describe('getStats', () => {
		it('aggregates insight/decision counts and participation rate', async () => {
			await coordinator.publishInsight({ content: 'a', title: 'a', type: 'finding', worktree_id: 'wt-1' });
			await coordinator.publishInsight({ content: 'b', title: 'b', type: 'blocker', worktree_id: 'wt-2' });
			const decision = await coordinator.proposeDecision({
				options: [{ description: 'A', label: 'A' }],
				topic: 'T',
				worktree_id: 'wt-1'
			});
			await coordinator.voteOnDecision({ decision_id: decision.id, option_index: 0, worktree_id: 'wt-1' });
			await coordinator.proposeDecision({
				options: [{ description: 'A', label: 'A' }],
				topic: 'T2',
				worktree_id: 'wt-1'
			});

			const stats = await coordinator.getStats();

			expect(stats.total_insights).toBe(2);
			expect(stats.insights_by_type).toEqual({ blocker: 1, finding: 1 });
			expect(stats.insights_by_worktree).toEqual({ 'wt-1': 1, 'wt-2': 1 });
			expect(stats.participation_rate).toBe(2);
			expect(stats.total_decisions).toBe(2);
			expect(stats.pending_decisions).toBe(1);
			expect(stats.resolved_decisions).toBe(1);
		});
	});

	describe('clearInsights / clearDecisions', () => {
		it('clearInsights empties the insights pool', async () => {
			await coordinator.publishInsight({ content: 'a', title: 'a', type: 'finding', worktree_id: 'wt-1' });

			await coordinator.clearInsights();

			expect(await coordinator.getAllInsights()).toEqual([]);
		});

		it('clearDecisions empties the decisions pool', async () => {
			await coordinator.proposeDecision({
				options: [{ description: 'A', label: 'A' }],
				topic: 'T',
				worktree_id: 'wt-1'
			});

			await coordinator.clearDecisions();

			expect(await coordinator.getAllDecisions()).toEqual([]);
		});
	});

	describe('exportInsights / exportDecisions', () => {
		it('exports insights as JSON matching the pool contents', async () => {
			const insight = await coordinator.publishInsight({
				content: 'a',
				title: 'a',
				type: 'finding',
				worktree_id: 'wt-1'
			});

			const exported = JSON.parse(await coordinator.exportInsights()) as Array<{ id: string }>;

			expect(exported).toEqual([expect.objectContaining({ id: insight.id })]);
		});

		it('exports decisions as JSON matching the pool contents', async () => {
			const decision = await coordinator.proposeDecision({
				options: [{ description: 'A', label: 'A' }],
				topic: 'T',
				worktree_id: 'wt-1'
			});

			const exported = JSON.parse(await coordinator.exportDecisions()) as Array<{ id: string }>;

			expect(exported).toEqual([expect.objectContaining({ id: decision.id })]);
		});
	});

	describe('getInsightsSummary / getDecisionsSummary', () => {
		it('summarises insight counts by type and worktree', async () => {
			await coordinator.publishInsight({ content: 'a', title: 'My finding', type: 'finding', worktree_id: 'wt-1' });

			const summary = await coordinator.getInsightsSummary();

			expect(summary).toContain('Total Insights: 1');
			expect(summary).toContain('finding: 1');
			expect(summary).toContain('wt-1: 1');
			expect(summary).toContain('My finding');
		});

		it('summarises decisions, listing resolved ones with their chosen option label', async () => {
			const decision = await coordinator.proposeDecision({
				options: [{ description: 'Do A', label: 'Option A' }],
				topic: 'Which approach?',
				worktree_id: 'wt-1'
			});
			await coordinator.voteOnDecision({ decision_id: decision.id, option_index: 0, worktree_id: 'wt-1' });

			const summary = await coordinator.getDecisionsSummary();

			expect(summary).toContain('Total Decisions: 1');
			expect(summary).toContain('Resolved: 1');
			expect(summary).toContain('Which approach? → Option A');
		});
	});
});
