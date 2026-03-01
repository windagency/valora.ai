/**
 * Domain Keyword Registry Tests
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
	DomainKeywordRegistry,
	getDomainKeywordRegistry,
	resetDomainKeywordRegistry
} from '../domain-keyword-registry';

describe('DomainKeywordRegistry', () => {
	let registry: DomainKeywordRegistry;

	beforeEach(() => {
		registry = new DomainKeywordRegistry();
	});

	describe('initialization', () => {
		it('should initialize with default keywords for all domains', () => {
			const domains = registry.getDomains();

			expect(domains).toContain('infrastructure');
			expect(domains).toContain('security');
			expect(domains).toContain('typescript-core');
			expect(domains).toContain('typescript-backend-general');
			expect(domains).toContain('typescript-frontend-general');
			expect(domains).toContain('typescript-frontend-react');
			expect(domains).toContain('ui-ux-designer');
		});

		it('should have infrastructure keywords', () => {
			const keywords = registry.getKeywords('infrastructure');

			expect(keywords).toContain('terraform');
			expect(keywords).toContain('kubernetes');
			expect(keywords).toContain('docker');
			expect(keywords).toContain('aws');
		});

		it('should have security keywords', () => {
			const keywords = registry.getKeywords('security');

			expect(keywords).toContain('authentication');
			expect(keywords).toContain('jwt');
			expect(keywords).toContain('oauth');
			expect(keywords).toContain('encryption');
		});

		it('should have typescript-backend-general keywords', () => {
			const keywords = registry.getKeywords('typescript-backend-general');

			expect(keywords).toContain('api');
			expect(keywords).toContain('database');
			expect(keywords).toContain('express');
			expect(keywords).toContain('prisma');
		});

		it('should have typescript-frontend-react keywords', () => {
			const keywords = registry.getKeywords('typescript-frontend-react');

			expect(keywords).toContain('react');
			expect(keywords).toContain('hook');
			expect(keywords).toContain('jsx');
			expect(keywords).toContain('redux');
		});
	});

	describe('getKeywords', () => {
		it('should return array of keywords for valid domain', () => {
			const keywords = registry.getKeywords('security');

			expect(Array.isArray(keywords)).toBe(true);
			expect(keywords.length).toBeGreaterThan(0);
		});

		it('should return empty array for unknown domain', () => {
			const keywords = registry.getKeywords('unknown-domain' as never);

			expect(keywords).toEqual([]);
		});
	});

	describe('getAllKeywords', () => {
		it('should return all domains with their keywords', () => {
			const allKeywords = registry.getAllKeywords();

			expect(Object.keys(allKeywords)).toContain('infrastructure');
			expect(Object.keys(allKeywords)).toContain('security');
			expect(Array.isArray(allKeywords.infrastructure)).toBe(true);
			expect(Array.isArray(allKeywords.security)).toBe(true);
		});

		it('should return arrays, not Sets', () => {
			const allKeywords = registry.getAllKeywords();

			for (const keywords of Object.values(allKeywords)) {
				expect(Array.isArray(keywords)).toBe(true);
			}
		});
	});

	describe('getDomains', () => {
		it('should return all registered domains', () => {
			const domains = registry.getDomains();

			expect(domains.length).toBe(7);
		});
	});

	describe('registerKeywords', () => {
		it('should add new keywords to existing domain', () => {
			const originalCount = registry.getKeywords('security').length;

			registry.registerKeywords('security', ['new-keyword', 'another-keyword']);

			const updatedKeywords = registry.getKeywords('security');
			expect(updatedKeywords.length).toBe(originalCount + 2);
			expect(updatedKeywords).toContain('new-keyword');
			expect(updatedKeywords).toContain('another-keyword');
		});

		it('should convert keywords to lowercase', () => {
			registry.registerKeywords('security', ['UPPERCASE', 'MixedCase']);

			const keywords = registry.getKeywords('security');
			expect(keywords).toContain('uppercase');
			expect(keywords).toContain('mixedcase');
		});

		it('should not duplicate existing keywords', () => {
			const originalKeywords = registry.getKeywords('security');
			const originalCount = originalKeywords.length;

			// Register existing keyword
			registry.registerKeywords('security', ['jwt', 'oauth']);

			const updatedKeywords = registry.getKeywords('security');
			expect(updatedKeywords.length).toBe(originalCount);
		});

		it('should create new domain if it does not exist', () => {
			registry.registerKeywords('new-domain' as never, ['keyword1', 'keyword2']);

			const keywords = registry.getKeywords('new-domain' as never);
			expect(keywords).toContain('keyword1');
			expect(keywords).toContain('keyword2');
		});
	});

	describe('setKeywords', () => {
		it('should replace all keywords for a domain', () => {
			registry.setKeywords('security', ['only-keyword']);

			const keywords = registry.getKeywords('security');
			expect(keywords).toEqual(['only-keyword']);
		});

		it('should convert keywords to lowercase', () => {
			registry.setKeywords('security', ['UPPER', 'Lower']);

			const keywords = registry.getKeywords('security');
			expect(keywords).toContain('upper');
			expect(keywords).toContain('lower');
		});
	});

	describe('findDomainsForKeyword', () => {
		it('should find domain containing keyword', () => {
			const domains = registry.findDomainsForKeyword('terraform');

			expect(domains).toContain('infrastructure');
		});

		it('should find multiple domains for shared keywords', () => {
			// 'component' is shared between frontend domains
			const domains = registry.findDomainsForKeyword('component');

			expect(domains.length).toBeGreaterThanOrEqual(1);
		});

		it('should be case insensitive', () => {
			const domainsLower = registry.findDomainsForKeyword('terraform');
			const domainsUpper = registry.findDomainsForKeyword('TERRAFORM');

			expect(domainsLower).toEqual(domainsUpper);
		});

		it('should return empty array for unknown keyword', () => {
			const domains = registry.findDomainsForKeyword('nonexistent-keyword');

			expect(domains).toEqual([]);
		});
	});

	describe('reset', () => {
		it('should restore default keywords after modifications', () => {
			const originalSecurityKeywords = registry.getKeywords('security');

			// Modify registry
			registry.setKeywords('security', ['modified']);
			registry.registerKeywords('infrastructure', ['new-keyword']);

			// Reset
			registry.reset();

			const restoredSecurityKeywords = registry.getKeywords('security');
			expect(restoredSecurityKeywords).toEqual(originalSecurityKeywords);
		});

		it('should remove custom domains after reset', () => {
			registry.registerKeywords('custom-domain' as never, ['keyword']);

			registry.reset();

			const keywords = registry.getKeywords('custom-domain' as never);
			expect(keywords).toEqual([]);
		});
	});
});

describe('Singleton Pattern', () => {
	beforeEach(() => {
		resetDomainKeywordRegistry();
	});

	it('should return same instance on multiple calls', () => {
		const instance1 = getDomainKeywordRegistry();
		const instance2 = getDomainKeywordRegistry();

		expect(instance1).toBe(instance2);
	});

	it('should preserve modifications across calls', () => {
		const instance1 = getDomainKeywordRegistry();
		instance1.registerKeywords('security', ['singleton-test-keyword']);

		const instance2 = getDomainKeywordRegistry();
		const keywords = instance2.getKeywords('security');

		expect(keywords).toContain('singleton-test-keyword');
	});

	it('should create new instance after reset', () => {
		const instance1 = getDomainKeywordRegistry();
		instance1.registerKeywords('security', ['before-reset']);

		resetDomainKeywordRegistry();

		const instance2 = getDomainKeywordRegistry();
		const keywords = instance2.getKeywords('security');

		expect(keywords).not.toContain('before-reset');
	});
});
