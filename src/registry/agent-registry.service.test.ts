import { describe, expect, it } from 'vitest';

import type { AgentDefinition } from 'types/agent.types';
import { AgentRegistryService } from './agent-registry.service';

const makeAgent = (overrides: Partial<AgentDefinition> = {}): AgentDefinition => ({
	capabilities: { can_review_code: true, can_run_tests: true, can_write_code: true, can_write_knowledge: true },
	content: '',
	description: 'Test agent',
	owner: 'alice@example.com',
	role: 'test-agent',
	specialization: 'testing',
	tone: 'concise-technical',
	version: '1.0.0',
	...overrides
});

const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const pastDate = '2020-01-01';
const soonDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('AgentRegistryService', () => {
	describe('audit', () => {
		it('returns empty report for healthy agents', () => {
			const registry = new AgentRegistryService([
				makeAgent({ role: 'a1', owner: 'alice@example.com', expires: futureDate }),
				makeAgent({ role: 'a2', owner: 'bob@example.com', expires: futureDate })
			]);
			const report = registry.audit();
			expect(report.unowned).toHaveLength(0);
			expect(report.expired).toHaveLength(0);
			expect(report.expiring_soon).toHaveLength(0);
		});

		it('flags agents without owner', () => {
			const registry = new AgentRegistryService([makeAgent({ role: 'orphan', owner: undefined })]);
			const { unowned } = registry.audit();
			expect(unowned).toContain('orphan');
		});

		it('flags agents with past expires date as expired', () => {
			const registry = new AgentRegistryService([
				makeAgent({ role: 'stale', owner: 'alice@example.com', expires: pastDate })
			]);
			const { expired } = registry.audit();
			expect(expired).toContain('stale');
		});

		it('flags agents expiring within the warning window', () => {
			const registry = new AgentRegistryService([
				makeAgent({ role: 'soon', owner: 'alice@example.com', expires: soonDate })
			]);
			const { expiring_soon } = registry.audit({ warningDays: 30 });
			expect(expiring_soon).toContain('soon');
		});

		it('does not flag unexpired agents as expiring_soon', () => {
			const registry = new AgentRegistryService([
				makeAgent({ role: 'fine', owner: 'alice@example.com', expires: futureDate })
			]);
			const { expiring_soon } = registry.audit({ warningDays: 30 });
			expect(expiring_soon).not.toContain('fine');
		});

		it('does not flag expired agents in expiring_soon', () => {
			const registry = new AgentRegistryService([
				makeAgent({ role: 'dead', owner: 'alice@example.com', expires: pastDate })
			]);
			const { expiring_soon } = registry.audit({ warningDays: 30 });
			expect(expiring_soon).not.toContain('dead');
		});

		it('agents without expires are not considered expired', () => {
			const registry = new AgentRegistryService([
				makeAgent({ role: 'noexp', owner: 'alice@example.com', expires: undefined })
			]);
			const { expired } = registry.audit();
			expect(expired).not.toContain('noexp');
		});
	});

	describe('hasFailures', () => {
		it('returns false for a clean report', () => {
			const registry = new AgentRegistryService([
				makeAgent({ role: 'a1', owner: 'alice@example.com', expires: futureDate })
			]);
			expect(registry.hasFailures(registry.audit())).toBe(false);
		});

		it('returns true when there are expired agents', () => {
			const registry = new AgentRegistryService([
				makeAgent({ role: 'stale', owner: 'alice@example.com', expires: pastDate })
			]);
			expect(registry.hasFailures(registry.audit())).toBe(true);
		});

		it('returns true when there are unowned agents', () => {
			const registry = new AgentRegistryService([makeAgent({ role: 'orphan', owner: undefined })]);
			expect(registry.hasFailures(registry.audit())).toBe(true);
		});
	});
});
