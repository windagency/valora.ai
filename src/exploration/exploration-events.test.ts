import { describe, expect, it } from 'vitest';

import type { ContainerStats, Decision, Exploration, WorktreeExploration } from 'types/exploration.types';

import { getExplorationEvents } from './exploration-events';

function captureOnce<T = unknown>(eventName: string): { promise: Promise<T> } {
	const emitter = getExplorationEvents();
	const promise = new Promise<T>((resolve) => emitter.once(eventName, resolve));
	return { promise };
}

function makeExploration(overrides: Partial<Exploration> = {}): Exploration {
	return {
		id: 'exp-1',
		status: 'running',
		task: 'do the thing',
		worktrees: [],
		...overrides
	} as Exploration;
}

function makeWorktree(overrides: Partial<WorktreeExploration> = {}): WorktreeExploration {
	return {
		branch_name: 'exploration/exp-1-0',
		index: 0,
		progress: {
			current_stage: 'plan',
			errors: [],
			insights_published: 0,
			last_update: 't',
			percentage: 0,
			stages_completed: []
		},
		status: 'running',
		worktree_path: '/wt-0',
		...overrides
	};
}

function makeDecision(overrides: Partial<Decision> = {}): Decision {
	return { id: 'decision-1', options: [], timestamp: 't', topic: 'Which approach?', votes: {}, ...overrides };
}

describe('getExplorationEvents (singleton)', () => {
	it('returns the same emitter instance across calls', () => {
		expect(getExplorationEvents()).toBe(getExplorationEvents());
	});
});

describe('ExplorationEventEmitter', () => {
	it('emitExplorationCreated emits exploration:created with the exploration payload', async () => {
		const { promise } = captureOnce('exploration:created');
		const exploration = makeExploration();

		getExplorationEvents().emitExplorationCreated(exploration);

		expect(await promise).toMatchObject({
			data: { exploration },
			exploration_id: 'exp-1',
			type: 'exploration:created'
		});
	});

	it('emitExplorationStarted emits exploration:started', async () => {
		const { promise } = captureOnce('exploration:started');

		getExplorationEvents().emitExplorationStarted(makeExploration());

		expect(await promise).toMatchObject({ exploration_id: 'exp-1', type: 'exploration:started' });
	});

	it('emitExplorationCompleted emits exploration:completed', async () => {
		const { promise } = captureOnce('exploration:completed');

		getExplorationEvents().emitExplorationCompleted(makeExploration());

		expect(await promise).toMatchObject({ exploration_id: 'exp-1', type: 'exploration:completed' });
	});

	it('emitExplorationFailed emits exploration:failed with the error message', async () => {
		const { promise } = captureOnce<{ data: { error: string } }>('exploration:failed');

		getExplorationEvents().emitExplorationFailed(makeExploration(), new Error('boom'));

		const event = await promise;
		expect(event).toMatchObject({ exploration_id: 'exp-1', type: 'exploration:failed' });
		expect(event.data.error).toBe('boom');
	});

	it('emitExplorationStopped emits exploration:stopped', async () => {
		const { promise } = captureOnce('exploration:stopped');

		getExplorationEvents().emitExplorationStopped(makeExploration());

		expect(await promise).toMatchObject({ exploration_id: 'exp-1', type: 'exploration:stopped' });
	});

	it('emitWorktreeCreated emits worktree:created with the worktree index', async () => {
		const { promise } = captureOnce('worktree:created');

		getExplorationEvents().emitWorktreeCreated('exp-1', makeWorktree({ index: 2 }));

		expect(await promise).toMatchObject({ exploration_id: 'exp-1', type: 'worktree:created', worktree_index: 2 });
	});

	it('emitWorktreeStarted emits worktree:started with the worktree index', async () => {
		const { promise } = captureOnce('worktree:started');

		getExplorationEvents().emitWorktreeStarted('exp-1', makeWorktree({ index: 1 }));

		expect(await promise).toMatchObject({ exploration_id: 'exp-1', type: 'worktree:started', worktree_index: 1 });
	});

	it('emitWorktreeProgress emits worktree:progress with stage/percentage details', async () => {
		const { promise } = captureOnce('worktree:progress');

		getExplorationEvents().emitWorktreeProgress('exp-1', 0, 42, 'plan', ['setup']);

		expect(await promise).toMatchObject({
			data: { current_stage: 'plan', percentage: 42, stages_completed: ['setup'] },
			exploration_id: 'exp-1',
			type: 'worktree:progress',
			worktree_index: 0
		});
	});

	it('emitWorktreeCompleted emits worktree:completed with the worktree index', async () => {
		const { promise } = captureOnce('worktree:completed');

		getExplorationEvents().emitWorktreeCompleted('exp-1', makeWorktree({ index: 3 }));

		expect(await promise).toMatchObject({ exploration_id: 'exp-1', type: 'worktree:completed', worktree_index: 3 });
	});

	it('emitWorktreeFailed emits worktree:failed with the error string', async () => {
		const { promise } = captureOnce<{ data: { error: string } }>('worktree:failed');

		getExplorationEvents().emitWorktreeFailed('exp-1', makeWorktree({ index: 0 }), 'container crashed');

		const event = await promise;
		expect(event).toMatchObject({ exploration_id: 'exp-1', type: 'worktree:failed', worktree_index: 0 });
		expect(event.data.error).toBe('container crashed');
	});

	it('emitContainerCreated emits container:created with the container id', async () => {
		const { promise } = captureOnce('container:created');

		getExplorationEvents().emitContainerCreated('exp-1', 0, 'abc123');

		expect(await promise).toMatchObject({
			data: { container_id: 'abc123' },
			exploration_id: 'exp-1',
			type: 'container:created',
			worktree_index: 0
		});
	});

	it('emitContainerStats emits container:stats with the stats payload', async () => {
		const { promise } = captureOnce('container:stats');
		const stats = { cpu_percent: 10, memory_mb: 256 } as unknown as ContainerStats;

		getExplorationEvents().emitContainerStats('exp-1', 0, stats);

		expect(await promise).toMatchObject({ data: { stats }, exploration_id: 'exp-1', type: 'container:stats' });
	});

	it('emitContainerStopped emits container:stopped', async () => {
		const { promise } = captureOnce('container:stopped');

		getExplorationEvents().emitContainerStopped('exp-1', 0);

		expect(await promise).toMatchObject({ exploration_id: 'exp-1', type: 'container:stopped', worktree_index: 0 });
	});

	it('emitInsightPublished emits insight:published with the insight payload', async () => {
		const { promise } = captureOnce('insight:published');
		const insight = {
			content: 'c',
			id: 'insight-1',
			metadata: {},
			tags: [],
			timestamp: 't',
			title: 't',
			type: 'finding',
			worktree_id: 'wt-1'
		} as const;

		getExplorationEvents().emitInsightPublished('exp-1', insight);

		expect(await promise).toMatchObject({ data: { insight }, exploration_id: 'exp-1', type: 'insight:published' });
	});

	it('emitDecisionProposed emits decision:proposed with the decision payload', async () => {
		const { promise } = captureOnce('decision:proposed');
		const decision = makeDecision();

		getExplorationEvents().emitDecisionProposed('exp-1', decision);

		expect(await promise).toMatchObject({ data: { decision }, exploration_id: 'exp-1', type: 'decision:proposed' });
	});

	it('emitDecisionVoted emits decision:voted with the decision and voter worktree id', async () => {
		const { promise } = captureOnce<{ data: { worktree_id: string } }>('decision:voted');
		const decision = makeDecision();

		getExplorationEvents().emitDecisionVoted('exp-1', decision, 'wt-1');

		const event = await promise;
		expect(event).toMatchObject({ exploration_id: 'exp-1', type: 'decision:voted' });
		expect(event.data.worktree_id).toBe('wt-1');
	});

	it('emitDecisionResolved emits decision:resolved with the decision payload', async () => {
		const { promise } = captureOnce('decision:resolved');
		const decision = makeDecision({ chosen_option: 0 });

		getExplorationEvents().emitDecisionResolved('exp-1', decision);

		expect(await promise).toMatchObject({ data: { decision }, exploration_id: 'exp-1', type: 'decision:resolved' });
	});

	it('emitMergeStarted emits merge:started with the strategy and worktree index', async () => {
		const { promise } = captureOnce('merge:started');

		getExplorationEvents().emitMergeStarted('exp-1', 0, 'squash');

		expect(await promise).toMatchObject({
			data: { strategy: 'squash', worktree_index: 0 },
			exploration_id: 'exp-1',
			type: 'merge:started'
		});
	});

	it('emitMergeCompleted emits merge:completed with the merge commit sha', async () => {
		const { promise } = captureOnce('merge:completed');

		getExplorationEvents().emitMergeCompleted('exp-1', 0, 'abcd1234');

		expect(await promise).toMatchObject({
			data: { merge_commit: 'abcd1234', worktree_index: 0 },
			exploration_id: 'exp-1',
			type: 'merge:completed'
		});
	});

	it('emitMergeFailed emits merge:failed with the error string', async () => {
		const { promise } = captureOnce('merge:failed');

		getExplorationEvents().emitMergeFailed('exp-1', 0, 'conflict');

		expect(await promise).toMatchObject({
			data: { error: 'conflict', worktree_index: 0 },
			exploration_id: 'exp-1',
			type: 'merge:failed'
		});
	});

	it('every emitted event includes a valid ISO timestamp', async () => {
		const { promise } = captureOnce<{ timestamp: string }>('exploration:created');

		getExplorationEvents().emitExplorationCreated(makeExploration());

		const event = await promise;
		expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
	});
});
