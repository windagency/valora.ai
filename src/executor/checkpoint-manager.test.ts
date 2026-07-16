import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { StageOutput } from 'types/command.types';
import { CheckpointManager } from './checkpoint-manager';

function makeStageOutput(overrides: Partial<StageOutput> = {}): StageOutput {
	return {
		duration_ms: 100,
		outputs: { result: 'ok' },
		prompt: 'analyse',
		stage: 'context',
		success: true,
		...overrides
	};
}

describe('CheckpointManager', () => {
	let tmpDir: string;
	let manager: CheckpointManager;

	beforeEach(() => {
		tmpDir = mkdtempSync('/tmp/valora-checkpoint-test-');
		manager = new CheckpointManager(tmpDir);
	});

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true });
	});

	it('returns an empty array when no checkpoint file exists', () => {
		const result = manager.read('session-1', 'feedback');
		expect(result).toEqual([]);
	});

	it('persists a checkpoint and reads it back', () => {
		const output = makeStageOutput();
		manager.write('session-1', 'feedback', {
			completedAt: new Date().toISOString(),
			output,
			stageIndex: 0,
			stageName: 'context.analyse'
		});
		const result = manager.read('session-1', 'feedback');
		expect(result).toHaveLength(1);
		expect(result[0]?.stageIndex).toBe(0);
		expect(result[0]?.output.stage).toBe('context');
	});

	it('accumulates multiple checkpoints across writes', () => {
		const output = makeStageOutput();
		manager.write('session-1', 'feedback', {
			completedAt: new Date().toISOString(),
			output,
			stageIndex: 0,
			stageName: 'context.analyse'
		});
		manager.write('session-1', 'feedback', {
			completedAt: new Date().toISOString(),
			output: makeStageOutput({ stage: 'code' }),
			stageIndex: 1,
			stageName: 'code.implement'
		});
		const result = manager.read('session-1', 'feedback');
		expect(result).toHaveLength(2);
		expect(result[1]?.stageIndex).toBe(1);
	});

	it('isolates checkpoints by session and command name', () => {
		const output = makeStageOutput();
		manager.write('session-1', 'feedback', {
			completedAt: new Date().toISOString(),
			output,
			stageIndex: 0,
			stageName: 'context.analyse'
		});
		expect(manager.read('session-2', 'feedback')).toEqual([]);
		expect(manager.read('session-1', 'consolidate')).toEqual([]);
	});

	it('clears checkpoints so subsequent reads return empty', () => {
		const output = makeStageOutput();
		manager.write('session-1', 'feedback', {
			completedAt: new Date().toISOString(),
			output,
			stageIndex: 0,
			stageName: 'context.analyse'
		});
		manager.clear('session-1', 'feedback');
		expect(manager.read('session-1', 'feedback')).toEqual([]);
	});

	it('does not throw when clearing a non-existent checkpoint file', () => {
		expect(() => manager.clear('session-1', 'feedback')).not.toThrow();
	});

	it('rejects a traversal-shaped sessionId before building any path', () => {
		// Defense-in-depth: sessionId/commandName are internally-controlled
		// today (sessionId from SessionStore's own generator, commandName
		// constrained to the resolved command registry), not raw externally-
		// influenced input reaching this file-path-building function
		// directly — but validating cheaply here at the choke point costs
		// nothing and closes the risk if a future caller ever changes that.
		expect(() => manager.read('../../../../etc/passwd', 'feedback')).toThrow();
	});

	it('rejects a traversal-shaped commandName before building any path', () => {
		expect(() => manager.read('session-1', '../../../../etc/passwd')).toThrow();
	});

	it('returns empty array when the checkpoint file is older than the TTL', () => {
		const expiredDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
		const output = makeStageOutput();
		// Write directly with an expired createdAt by writing and then manipulating
		manager.write('session-1', 'feedback', {
			completedAt: expiredDate,
			output,
			stageIndex: 0,
			stageName: 'context.analyse'
		});
		// Manually expire the file by using a manager with 0ms TTL
		const strictManager = new CheckpointManager(tmpDir, 0);
		expect(strictManager.read('session-1', 'feedback')).toEqual([]);
	});
});
