import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockShutdownAll } = vi.hoisted(() => ({ mockShutdownAll: vi.fn() }));

vi.mock('./lsp-client-manager.service', () => ({
	getLSPClientManager: vi.fn(() => ({ shutdownAll: mockShutdownAll }))
}));

import { getLSPClientManager } from './lsp-client-manager.service';
import { getLSPLifecycle, LSPLifecycleService, resetLSPLifecycle } from './lsp-lifecycle.service';

describe('LSPLifecycleService', () => {
	beforeEach(() => {
		mockShutdownAll.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('starts with no session active', () => {
		const service = new LSPLifecycleService('/repo');

		expect(service.isSessionActive()).toBe(false);
	});

	it('marks the session active after startSession()', () => {
		const service = new LSPLifecycleService('/repo');

		service.startSession();

		expect(service.isSessionActive()).toBe(true);
	});

	it('marks the session inactive and shuts down all managed servers on endSession()', async () => {
		const service = new LSPLifecycleService('/repo');
		service.startSession();

		await service.endSession();

		expect(service.isSessionActive()).toBe(false);
		expect(mockShutdownAll).toHaveBeenCalledTimes(1);
	});

	it('acquires its manager from getLSPClientManager, scoped to the given project root', () => {
		new LSPLifecycleService('/repo/root');

		expect(getLSPClientManager).toHaveBeenCalledWith('/repo/root');
	});

	it('getManager() returns the manager instance used internally', () => {
		const service = new LSPLifecycleService('/repo');

		expect(service.getManager()).toBe(vi.mocked(getLSPClientManager).mock.results[0]?.value);
	});

	describe('getLSPLifecycle / resetLSPLifecycle (singleton)', () => {
		afterEach(() => {
			resetLSPLifecycle();
		});

		it('returns the same instance across calls', () => {
			const first = getLSPLifecycle('/repo');
			const second = getLSPLifecycle('/repo');

			expect(first).toBe(second);
		});

		it('returns a fresh instance after resetLSPLifecycle()', () => {
			const first = getLSPLifecycle('/repo');
			resetLSPLifecycle();
			const second = getLSPLifecycle('/repo');

			expect(first).not.toBe(second);
		});
	});
});
