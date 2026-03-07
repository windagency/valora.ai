/**
 * Domain Keyword Registry
 *
 * Configurable registry for domain-specific keywords used in task classification.
 * Follows Open/Closed Principle - open for extension, closed for modification.
 */

import type { TaskDomain } from 'types/agent.types';

/**
 * Default domain keywords for task classification.
 * Domain names are aligned with registry.json taskDomains (single source of truth).
 * New language/framework domains can be added here or at runtime via registerKeywords().
 */
const DEFAULT_DOMAIN_KEYWORDS: Record<string, string[]> = {
	'backend-api': [
		'api',
		'backend',
		'server',
		'database',
		'sql',
		'nosql',
		'mongodb',
		'postgresql',
		'mysql',
		'redis',
		'rest',
		'graphql',
		'trpc',
		'express',
		'nestjs',
		'fastify',
		'middleware',
		'routes',
		'controllers',
		'services',
		'orm',
		'prisma',
		'typeorm',
		'migration',
		'dto',
		'validation',
		'zod'
	],
	design: [
		'design',
		'ui',
		'ux',
		'mockup',
		'wireframe',
		'prototype',
		'figma',
		'sketch',
		'adobe',
		'user experience',
		'usability',
		'interaction',
		'visual design',
		'branding',
		'color',
		'typography'
	],
	'frontend-ui': [
		'frontend',
		'ui',
		'component',
		'html',
		'css',
		'dom',
		'responsive',
		'accessibility',
		'aria',
		'wcag',
		'svelte',
		'vue',
		'angular',
		'lit',
		'web components',
		'react',
		'next.js',
		'hook',
		'state',
		'props',
		'jsx',
		'tsx',
		'redux',
		'zustand',
		'router',
		'navigation',
		'form',
		'react-hook-form',
		'tanstack query',
		'container',
		'grid',
		'flexbox',
		'layout'
	],
	infrastructure: [
		'terraform',
		'kubernetes',
		'docker',
		'aws',
		'gcp',
		'azure',
		'infrastructure',
		'deployment',
		'ci/cd',
		'pipeline',
		'container',
		'k8s',
		'helm',
		'argo',
		'monitoring',
		'logging',
		'metrics',
		'prometheus',
		'grafana'
	],
	security: [
		'security',
		'auth',
		'authentication',
		'authorization',
		'oauth',
		'jwt',
		'encryption',
		'ssl',
		'tls',
		'vulnerability',
		'threat',
		'compliance',
		'owasp',
		'cis',
		'gdpr',
		'hipaa',
		'penetration',
		'audit'
	],
	testing: [
		'test',
		'testing',
		'jest',
		'vitest',
		'playwright',
		'cypress',
		'e2e',
		'unit test',
		'integration test',
		'coverage',
		'assertion',
		'mock',
		'stub',
		'fixture'
	],
	'typescript-core': [
		'typescript',
		'type',
		'interface',
		'generic',
		'utility',
		'decorator',
		'module',
		'import',
		'export',
		'compiler',
		'strict',
		'config',
		'build',
		'bundle',
		'transpile',
		'lint',
		'eslint',
		'prettier'
	],
	'typescript-general': [
		'node',
		'npm',
		'pnpm',
		'package',
		'dependency',
		'refactor',
		'pattern',
		'architecture',
		'clean code',
		'solid',
		'dry'
	]
};

/**
 * Registry for domain keywords
 * Allows runtime extension of keyword definitions
 */
export class DomainKeywordRegistry {
	private keywords: Map<TaskDomain, Set<string>>;

	constructor() {
		this.keywords = new Map();
		this.initializeDefaults();
	}

	/**
	 * Initialize with default keywords
	 */
	private initializeDefaults(): void {
		for (const [domain, words] of Object.entries(DEFAULT_DOMAIN_KEYWORDS)) {
			this.keywords.set(domain as TaskDomain, new Set(words));
		}
	}

	/**
	 * Get all keywords for a specific domain
	 */
	getKeywords(domain: TaskDomain): string[] {
		return Array.from(this.keywords.get(domain) ?? []);
	}

	/**
	 * Get all domains and their keywords
	 */
	getAllKeywords(): Record<TaskDomain, string[]> {
		const result = {} as Record<TaskDomain, string[]>;
		for (const [domain, words] of this.keywords.entries()) {
			result[domain] = Array.from(words);
		}
		return result;
	}

	/**
	 * Get all registered domains
	 */
	getDomains(): TaskDomain[] {
		return Array.from(this.keywords.keys());
	}

	/**
	 * Register additional keywords for a domain
	 * Adds to existing keywords without removing any
	 */
	registerKeywords(domain: TaskDomain, newKeywords: string[]): void {
		const existing = this.keywords.get(domain) ?? new Set<string>();
		for (const keyword of newKeywords) {
			existing.add(keyword.toLowerCase());
		}
		this.keywords.set(domain, existing);
	}

	/**
	 * Replace all keywords for a domain
	 */
	setKeywords(domain: TaskDomain, keywords: string[]): void {
		this.keywords.set(domain, new Set(keywords.map((k) => k.toLowerCase())));
	}

	/**
	 * Check if a keyword belongs to any domain
	 */
	findDomainsForKeyword(keyword: string): TaskDomain[] {
		const lowerKeyword = keyword.toLowerCase();
		const domains: TaskDomain[] = [];

		for (const [domain, words] of this.keywords.entries()) {
			if (words.has(lowerKeyword)) {
				domains.push(domain);
			}
		}

		return domains;
	}

	/**
	 * Reset to default keywords
	 */
	reset(): void {
		this.keywords.clear();
		this.initializeDefaults();
	}
}

/**
 * Singleton instance
 */
let registryInstance: DomainKeywordRegistry | null = null;

/**
 * Get the singleton domain keyword registry
 */
export function getDomainKeywordRegistry(): DomainKeywordRegistry {
	registryInstance ??= new DomainKeywordRegistry();
	return registryInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetDomainKeywordRegistry(): void {
	registryInstance = null;
}
