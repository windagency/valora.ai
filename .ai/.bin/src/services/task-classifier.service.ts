/**
 * Task Classifier Service
 *
 * Analyses task descriptions and classifies implementation requirements
 * to determine the appropriate agent specialisation.
 */

import type { TaskClassification, TaskContext, TaskDomain } from 'types/agent.types';

import { getLogger } from 'output/logger';
import { type DomainKeywordRegistry, getDomainKeywordRegistry } from 'utils/domain-keyword-registry';

export class TaskClassifierService {
	private readonly keywordRegistry: DomainKeywordRegistry;
	private readonly logger = getLogger();

	constructor(keywordRegistry?: DomainKeywordRegistry) {
		this.keywordRegistry = keywordRegistry ?? getDomainKeywordRegistry();
	}

	/**
	 * Classify a task based on its description and context
	 */
	classifyTask(taskContext: TaskContext): TaskClassification {
		// Normalise potentially null inputs
		const description = taskContext.description ?? '';
		const affectedFiles = taskContext.affectedFiles ?? [];
		const dependencies = taskContext.dependencies ?? [];
		const normalisedContext: TaskContext = {
			...taskContext,
			affectedFiles,
			dependencies,
			description
		};

		this.logger.debug('Classifying task', {
			affectedFiles: affectedFiles.length,
			complexity: taskContext.complexity,
			description: description.substring(0, 100) + '...'
		});

		// Extract keywords and patterns from task description
		const keywords = this.extractKeywords(description);
		const patterns = this.identifyPatterns(keywords);

		// Determine primary domain based on analysis
		const { confidence, primaryDomain, reasons } = this.determinePrimaryDomain(patterns, normalisedContext);

		// Calculate complexity if not provided
		const complexity = taskContext.complexity ?? this.calculateComplexity(normalisedContext, patterns);

		// Suggest appropriate agents based on domain
		const suggestedAgents = this.getSuggestedAgents(primaryDomain, normalisedContext);

		return {
			complexity,
			confidence,
			primaryDomain,
			reasons,
			suggestedAgents
		};
	}

	/**
	 * Extract keywords from task description
	 */
	private extractKeywords(description: string): string[] {
		const text = description.toLowerCase();
		const allKeywords = this.keywordRegistry.getAllKeywords();

		// Check each domain's keywords using functional pattern
		const extracted = Object.values(allKeywords).flatMap((domainKeywords) =>
			domainKeywords.filter((keyword) => text.includes(keyword))
		);

		return [...new Set(extracted)]; // Remove duplicates
	}

	/**
	 * Identify patterns from extracted keywords
	 */
	private identifyPatterns(keywords: string[]): Map<TaskDomain, number> {
		const patterns = new Map<TaskDomain, number>();
		const allKeywords = this.keywordRegistry.getAllKeywords();

		// Count matches for each domain using registry keywords
		Object.entries(allKeywords).forEach(([domain, domainKeywords]) => {
			const count = keywords.filter((keyword) => domainKeywords.includes(keyword)).length;
			if (count > 0) {
				patterns.set(domain as TaskDomain, count);
			}
		});

		return patterns;
	}

	/**
	 * Determine primary domain based on patterns and context
	 */
	private determinePrimaryDomain(
		patterns: Map<TaskDomain, number>,
		taskContext: TaskContext
	): { confidence: number; primaryDomain: TaskDomain; reasons: string[] } {
		// If primary domain is explicitly provided, use it with high confidence
		if (taskContext.primaryDomain) {
			return {
				confidence: 0.95,
				primaryDomain: taskContext.primaryDomain,
				reasons: [`Primary domain explicitly set to ${taskContext.primaryDomain}`]
			};
		}

		const fileBasedDomains = this.detectDomainFromFiles(taskContext.affectedFiles);

		// Combine pattern scores with file-based detection
		const combinedScores = new Map<TaskDomain, { reasons: string[]; score: number }>();

		// Add pattern-based scores using forEach
		Array.from(patterns.entries()).forEach(([domain, count]) => {
			const score = Math.min(count / 5, 1) * 0.6; // Max 60% from patterns
			combinedScores.set(domain, {
				reasons: [`Found ${count} domain-specific keywords`],
				score
			});
		});

		// Add file-based scores using forEach
		Array.from(fileBasedDomains.entries()).forEach(([domain, fileScore]) => {
			const existing = combinedScores.get(domain) ?? { reasons: [], score: 0 };
			const newScore = existing.score + fileScore.score * 0.4; // Max 40% from files
			combinedScores.set(domain, {
				reasons: [...existing.reasons, ...fileScore.reasons],
				score: Math.min(newScore, 1)
			});
		});

		// Find domain with highest score using functional pattern
		const best = Array.from(combinedScores.entries()).reduce(
			(acc, [domain, data]) => (data.score > acc.score ? { domain, reasons: data.reasons, score: data.score } : acc),
			{ domain: 'typescript-core' as TaskDomain, reasons: ['Default fallback'], score: 0 }
		);

		const { domain: bestDomain, reasons: bestReasons, score: bestScore } = best;

		// Apply minimum confidence threshold
		const confidence = Math.max(bestScore, 0.3);

		return {
			confidence,
			primaryDomain: bestDomain,
			reasons: bestReasons
		};
	}

	/**
	 * Detect domain from affected files
	 */
	private detectDomainFromFiles(affectedFiles: string[]): Map<TaskDomain, { reasons: string[]; score: number }> {
		const domainScores = new Map<TaskDomain, { reasons: string[]; score: number }>();

		const filePatterns: Record<TaskDomain, { patterns: string[]; weight: number }> = {
			infrastructure: {
				patterns: ['.tf', '.yaml', '.yml', 'dockerfile', 'Dockerfile', '.sh', '.bash'],
				weight: 1.0
			},
			security: {
				patterns: ['security', 'auth', 'jwt', 'oauth', 'encryption', 'ssl', 'tls'],
				weight: 0.8
			},
			'typescript-backend-general': {
				patterns: ['.ts', '.js', 'api', 'server', 'backend', 'database', 'sql'],
				weight: 0.7
			},
			'typescript-core': {
				patterns: ['.ts', '.js', 'config', 'build', 'package.json', 'tsconfig.json'],
				weight: 0.5
			},
			'typescript-frontend-general': {
				patterns: ['.tsx', '.jsx', '.html', '.css', 'frontend', 'ui'],
				weight: 0.6
			},
			'typescript-frontend-react': {
				patterns: ['.tsx', '.jsx', 'react', 'component', 'hook', 'state'],
				weight: 0.9
			},
			'ui-ux-designer': {
				patterns: ['.fig', '.sketch', '.xd', 'design', 'mockup', 'wireframe'],
				weight: 0.8
			}
		};

		// Process file patterns using functional approach
		affectedFiles.forEach((file) => {
			const fileName = file.toLowerCase();

			Object.entries(filePatterns).forEach(([domain, config]) => {
				const matchedPattern = config.patterns.find((pattern) => fileName.includes(pattern));
				if (matchedPattern) {
					const existing = domainScores.get(domain as TaskDomain) ?? { reasons: [], score: 0 };
					domainScores.set(domain as TaskDomain, {
						reasons: [...existing.reasons, `File ${file} matches ${domain} pattern`],
						score: Math.min(existing.score + config.weight, 1)
					});
				}
			});
		});

		return domainScores;
	}

	/**
	 * Calculate task complexity
	 */
	private calculateComplexity(taskContext: TaskContext, patterns: Map<TaskDomain, number>): 'high' | 'low' | 'medium' {
		let complexityScore = 0;

		// Factor in number of affected files
		complexityScore += Math.min(taskContext.affectedFiles.length / 10, 1) * 0.3;

		// Factor in number of domains involved
		complexityScore += Math.min(patterns.size / 3, 1) * 0.3;

		// Factor in description length (longer = more complex)
		complexityScore += Math.min(taskContext.description.length / 1000, 1) * 0.2;

		// Factor in dependencies count
		complexityScore += Math.min(taskContext.dependencies.length / 5, 1) * 0.2;

		if (complexityScore < 0.3) return 'low';
		if (complexityScore < 0.7) return 'medium';
		return 'high';
	}

	/**
	 * Get suggested agents for a domain
	 */
	private getSuggestedAgents(domain: TaskDomain, taskContext: TaskContext): string[] {
		const agentMappings: Record<TaskDomain, string[]> = {
			infrastructure: ['platform-engineer'],
			security: ['secops-engineer'],
			'typescript-backend-general': ['software-engineer-typescript-backend'],
			'typescript-core': ['software-engineer-typescript'],
			'typescript-frontend-general': ['software-engineer-typescript-frontend'],
			'typescript-frontend-react': ['software-engineer-typescript-frontend-react'],
			'ui-ux-designer': ['ui-ux-designer']
		};

		// Add lead for high complexity or multi-domain tasks
		const suggestedAgents = [...(agentMappings[domain] || ['software-engineer-typescript'])];

		if (
			taskContext.complexity === 'high' ||
			(taskContext.secondaryDomains && taskContext.secondaryDomains.length > 0)
		) {
			suggestedAgents.unshift('lead'); // Lead first for complex tasks
		}

		return suggestedAgents;
	}
}
