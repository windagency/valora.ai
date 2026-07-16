import { describe, expect, it, vi } from 'vitest';

import { handleKeyboardInput, type ControlState, type KeyHandlers } from './dashboard-controls';

function makeHandlers(): KeyHandlers {
	return {
		killExploration: vi.fn().mockResolvedValue(undefined),
		onExit: vi.fn(),
		pauseExploration: vi.fn().mockResolvedValue(undefined),
		resumeExploration: vi.fn().mockResolvedValue(undefined),
		stopExploration: vi.fn().mockResolvedValue(undefined)
	};
}

const notPaused: ControlState = { isPaused: false };
const paused: ControlState = { isPaused: true };

describe('handleKeyboardInput', () => {
	it('exits on "q"', () => {
		const handlers = makeHandlers();

		handleKeyboardInput('q', {}, notPaused, handlers);

		expect(handlers.onExit).toHaveBeenCalledOnce();
	});

	it('exits on Ctrl+C', () => {
		const handlers = makeHandlers();

		handleKeyboardInput('c', { ctrl: true }, notPaused, handlers);

		expect(handlers.onExit).toHaveBeenCalledOnce();
	});

	it('does not exit on a bare "c" without ctrl', () => {
		const handlers = makeHandlers();

		handleKeyboardInput('c', { ctrl: false }, notPaused, handlers);

		expect(handlers.onExit).not.toHaveBeenCalled();
	});

	it('kills the exploration on "k" regardless of pause state', () => {
		const handlers = makeHandlers();

		handleKeyboardInput('k', {}, paused, handlers);

		expect(handlers.killExploration).toHaveBeenCalledOnce();
	});

	it('stops the exploration on "s" regardless of pause state', () => {
		const handlers = makeHandlers();

		handleKeyboardInput('s', {}, notPaused, handlers);

		expect(handlers.stopExploration).toHaveBeenCalledOnce();
	});

	it('pauses on "p" when not already paused', () => {
		const handlers = makeHandlers();

		handleKeyboardInput('p', {}, notPaused, handlers);

		expect(handlers.pauseExploration).toHaveBeenCalledOnce();
	});

	it('does nothing on "p" when already paused (no double-pause)', () => {
		const handlers = makeHandlers();

		handleKeyboardInput('p', {}, paused, handlers);

		expect(handlers.pauseExploration).not.toHaveBeenCalled();
	});

	it('resumes on "r" when currently paused', () => {
		const handlers = makeHandlers();

		handleKeyboardInput('r', {}, paused, handlers);

		expect(handlers.resumeExploration).toHaveBeenCalledOnce();
	});

	it('does nothing on "r" when not currently paused (no spurious resume)', () => {
		const handlers = makeHandlers();

		handleKeyboardInput('r', {}, notPaused, handlers);

		expect(handlers.resumeExploration).not.toHaveBeenCalled();
	});

	it('does nothing for an unrecognised key', () => {
		const handlers = makeHandlers();

		handleKeyboardInput('z', {}, notPaused, handlers);

		expect(handlers.onExit).not.toHaveBeenCalled();
		expect(handlers.killExploration).not.toHaveBeenCalled();
		expect(handlers.pauseExploration).not.toHaveBeenCalled();
		expect(handlers.resumeExploration).not.toHaveBeenCalled();
		expect(handlers.stopExploration).not.toHaveBeenCalled();
	});
});
