import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPipelineEmitter } from './pipeline-emitter';
import { ProcessingFeedback } from './processing-feedback';

function captureStderr(): { restore: () => void; text: () => string } {
	const chunks: string[] = [];
	const original = process.stderr.write.bind(process.stderr);
	vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string) => {
		chunks.push(String(chunk));
		return true;
	}) as never);
	return { restore: () => vi.mocked(process.stderr.write).mockRestore(), text: () => chunks.join('') };
}

describe('ProcessingFeedback — confidence formatting (via showInfo public API)', () => {
	let feedback: ProcessingFeedback;
	let stderr: ReturnType<typeof captureStderr>;

	beforeEach(() => {
		delete process.env['AI_MCP_ENABLED'];
		feedback = new ProcessingFeedback();
		stderr = captureStderr();
	});

	afterEach(() => {
		stderr.restore();
	});

	it('formats a 0-1 scale confidence (e.g. agent-selection/task-classifier scores) as a percentage', () => {
		feedback.showInfo('Selected agent', { confidence: 0.74 });
		expect(stderr.text()).toContain('confidence: 74%');
	});

	it('formats an already-0-100 scale confidence (e.g. escalation signals) without double-scaling', () => {
		feedback.showInfo('Escalation signal', { confidence: 74 });
		expect(stderr.text()).toContain('confidence: 74%');
	});

	it('formats boundary value 1 as 100% (0-1 scale full confidence)', () => {
		feedback.showInfo('Selected agent', { confidence: 1 });
		expect(stderr.text()).toContain('confidence: 100%');
	});

	it('formats 100 (0-100 scale full confidence) as 100%, not 10000%', () => {
		feedback.showInfo('Escalation signal', { confidence: 100 });
		expect(stderr.text()).toContain('confidence: 100%');
	});

	it('formats zero confidence as 0% regardless of assumed scale', () => {
		feedback.showInfo('Selected agent', { confidence: 0 });
		expect(stderr.text()).toContain('confidence: 0%');
	});
});

describe('ProcessingFeedback — formatToolsList truncation (via showInfo public API)', () => {
	let feedback: ProcessingFeedback;
	let stderr: ReturnType<typeof captureStderr>;

	beforeEach(() => {
		delete process.env['AI_MCP_ENABLED'];
		feedback = new ProcessingFeedback();
		stderr = captureStderr();
	});

	afterEach(() => {
		stderr.restore();
	});

	it('lists every tool name when the joined list fits within the 60-char limit', () => {
		feedback.showInfo('Tools available', { toolNames: ['read_file', 'write', 'grep'] });
		expect(stderr.text()).toContain('read_file, write, grep');
	});

	it('truncates the tools list with "..." once adding the next tool would exceed 60 characters', () => {
		const manyTools = ['read_file', 'write', 'grep', 'search_replace', 'delete_file', 'list_dir', 'codebase_search'];
		feedback.showInfo('Tools available', { toolNames: manyTools });

		const text = stderr.text();
		expect(text).toContain('...');
		// Everything after the truncation point must be absent.
		expect(text).not.toContain('codebase_search');
	});

	it('returns nothing (no dangling parens) for an empty tools array', () => {
		feedback.showInfo('Tools available', { toolNames: [] });
		expect(stderr.text()).not.toContain('()');
	});
});

describe('ProcessingFeedback — handleStageComplete summary line (via real pipeline events)', () => {
	let feedback: ProcessingFeedback;
	let stderr: ReturnType<typeof captureStderr>;
	const emitter = getPipelineEmitter();

	beforeEach(() => {
		delete process.env['AI_MCP_ENABLED'];
		feedback = new ProcessingFeedback();
		feedback.start();
		stderr = captureStderr();
	});

	afterEach(() => {
		feedback.stop();
		stderr.restore();
	});

	it('prints a "Done" summary for a completed stage, naming the stage', () => {
		emitter.emitStageStart({ index: 0, stage: 'plan.assess-risks', totalStages: 1 });
		emitter.emitStageComplete({ duration: 100, stage: 'plan.assess-risks', success: true });

		expect(stderr.text()).toContain('Done (assess-risks');
	});

	it('includes accumulated token count in the summary when LLM responses reported tokens for the stage', () => {
		emitter.emitStageStart({ index: 0, stage: 'plan.assess-risks', totalStages: 1 });
		emitter.emitLLMResponse({
			content: 'ok',
			model: 'claude-sonnet-4.6',
			stage: 'plan.assess-risks',
			tokenCount: 1500
		});
		emitter.emitStageComplete({ duration: 100, stage: 'plan.assess-risks', success: true });

		expect(stderr.text()).toContain('1.5k tokens');
	});

	it('omits the tokens fragment entirely when no LLM response reported tokens for the stage', () => {
		emitter.emitStageStart({ index: 0, stage: 'plan.assess-risks', totalStages: 1 });
		emitter.emitStageComplete({ duration: 100, stage: 'plan.assess-risks', success: true });

		expect(stderr.text()).not.toContain('tokens');
	});

	it('removes the stage from active tracking after completion (a second, unrelated complete event for it is a no-op)', () => {
		emitter.emitStageStart({ index: 0, stage: 'plan.assess-risks', totalStages: 1 });
		emitter.emitStageComplete({ duration: 100, stage: 'plan.assess-risks', success: true });
		stderr.restore();
		stderr = captureStderr();

		emitter.emitStageComplete({ duration: 100, stage: 'plan.assess-risks', success: true });

		expect(stderr.text()).toBe('');
	});
});
