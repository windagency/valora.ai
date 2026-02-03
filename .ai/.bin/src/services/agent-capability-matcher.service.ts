/**
 * Agent Capability Matcher Service
 *
 * Maps task requirements to agent specializations by scoring
 * agents based on their capabilities, expertise, and selection criteria.
 */

import type {
	AgentCapability,
	AgentScore,
	CodebaseContext,
	SelectionCriterion,
	TaskClassification,
	TaskDomain
} from 'types/agent.types';

import { getLogger } from 'output/logger';

import type { AgentCapabilityRegistryService } from './agent-capability-registry.service';

export class AgentCapabilityMatcherService {
	private readonly logger = getLogger();
	private registryService: AgentCapabilityRegistryService;

	constructor(registryService: AgentCapabilityRegistryService) {
		this.registryService = registryService;
	}

	/**
	 * Score all available agents based on task classification and context
	 */
	scoreAgents(taskClassification: TaskClassification, context: CodebaseContext): AgentScore[] {
		this.logger.debug('Scoring agents for task', {
			complexity: taskClassification.complexity,
			confidence: taskClassification.confidence,
			primaryDomain: taskClassification.primaryDomain
		});

		const allCapabilities = this.registryService.getAllCapabilities();

		// Score all agents using map and sort
		const agentScores = Array.from(allCapabilities.entries())
			.map(([role, capability]) => ({
				capability,
				reasons: this.generateScoringReasons(capability, taskClassification, context),
				role,
				score: this.calculateAgentScore(capability, taskClassification, context)
			}))
			.sort((a, b) => b.score - a.score);

		this.logger.debug('Agent scoring complete', {
			topAgent: agentScores[0]?.role,
			topScore: agentScores[0]?.score,
			totalAgents: agentScores.length
		});

		return agentScores;
	}

	/**
	 * Calculate comprehensive score for an agent
	 */
	private calculateAgentScore(
		capability: AgentCapability,
		taskClassification: TaskClassification,
		context: CodebaseContext
	): number {
		let totalScore = 0;
		const weights = {
			// Selection criteria matching
			contextMatch: 0.1, // Expertise relevance
			criteriaMatch: 0.2,
			domainMatch: 0.4, // Primary domain alignment
			expertiseMatch: 0.25, // Codebase context alignment
			priorityBonus: 0.05 // Agent priority bonus
		};

		// Domain match score (40%)
		const domainScore = this.calculateDomainMatchScore(capability, taskClassification);
		totalScore += domainScore * weights.domainMatch;

		// Expertise match score (25%)
		const expertiseScore = this.calculateExpertiseMatchScore(capability, taskClassification, context);
		totalScore += expertiseScore * weights.expertiseMatch;

		// Selection criteria match score (20%)
		const criteriaScore = this.calculateCriteriaMatchScore(capability, context);
		totalScore += criteriaScore * weights.criteriaMatch;

		// Context match score (10%)
		const contextScore = this.calculateContextMatchScore(capability, context);
		totalScore += contextScore * weights.contextMatch;

		// Priority bonus (5%)
		const priorityScore = capability.priority / 100; // Normalize priority (assuming max 100)
		totalScore += priorityScore * weights.priorityBonus;

		// Apply confidence multiplier from task classification
		totalScore *= taskClassification.confidence;

		// Ensure score is between 0 and 1
		return Math.max(0, Math.min(1, totalScore));
	}

	/**
	 * Calculate domain match score
	 */
	private calculateDomainMatchScore(capability: AgentCapability, taskClassification: TaskClassification): number {
		const primaryDomain = taskClassification.primaryDomain;

		// Handle malformed capability data
		if (!capability.domains || !Array.isArray(capability.domains)) {
			return 0.0;
		}

		// Perfect match for primary domain
		if (capability.domains.includes(primaryDomain)) {
			return 1.0;
		}

		// Partial match for related domains (simplified - could be enhanced with domain relationships)
		const relatedDomains = this.getRelatedDomains(primaryDomain);
		const relatedMatch = relatedDomains.some((domain) => capability.domains.includes(domain));

		return relatedMatch ? 0.3 : 0.0;
	}

	/**
	 * Get related domains for a given domain (simplified relationship mapping)
	 */
	private getRelatedDomains(domain: TaskDomain): TaskDomain[] {
		const domainRelationships: Record<TaskDomain, TaskDomain[]> = {
			infrastructure: ['typescript-backend-general'],
			security: ['typescript-backend-general', 'typescript-core'],
			'typescript-backend-general': ['typescript-core', 'infrastructure'],
			'typescript-core': ['typescript-backend-general', 'typescript-frontend-general', 'typescript-frontend-react'],
			'typescript-frontend-general': ['typescript-core'],
			'typescript-frontend-react': ['typescript-frontend-general', 'typescript-core'],
			'ui-ux-designer': ['typescript-frontend-general']
		};

		return domainRelationships[domain] ?? [];
	}

	/**
	 * Calculate expertise match score
	 */
	private calculateExpertiseMatchScore(
		capability: AgentCapability,
		taskClassification: TaskClassification,
		context: CodebaseContext
	): number {
		const taskDescription = taskClassification.reasons.join(' ').toLowerCase();
		const contextTechnologies = [
			...context.technologyStack,
			...context.architecturalPatterns,
			...context.infrastructureComponents
		]
			.join(' ')
			.toLowerCase();

		const combinedText = `${taskDescription} ${contextTechnologies}`;

		// Handle malformed capability data
		if (!capability.expertise || !Array.isArray(capability.expertise)) {
			return 0;
		}

		const totalExpertise = capability.expertise.length;

		if (totalExpertise === 0) return 0;

		// Count expertise matches using functional pattern
		const expertiseMatches = capability.expertise.filter((expertise) => {
			const expertiseLower = expertise.toLowerCase();
			return (
				combinedText.includes(expertiseLower) || expertiseLower.split(' ').some((word) => combinedText.includes(word))
			);
		}).length;

		return expertiseMatches / totalExpertise;
	}

	/**
	 * Calculate selection criteria match score
	 */
	private calculateCriteriaMatchScore(capability: AgentCapability, context: CodebaseContext): number {
		const contextCriteria = this.extractSelectionCriteriaFromContext(context);

		// Handle malformed capability data
		if (!capability.selectionCriteria || !Array.isArray(capability.selectionCriteria)) {
			return 0;
		}

		if (contextCriteria.length === 0) return 0;

		// Count criteria matches using functional pattern
		const matches = contextCriteria.filter((criterion) => capability.selectionCriteria.includes(criterion)).length;

		return matches / contextCriteria.length;
	}

	/**
	 * Extract selection criteria from codebase context
	 */
	private extractSelectionCriteriaFromContext(context: CodebaseContext): SelectionCriterion[] {
		const criteria: SelectionCriterion[] = [];

		// File-based criteria
		if (context.affectedFileTypes.includes('.ts') || context.affectedFileTypes.includes('.tsx')) {
			criteria.push('typescript-files');
		}

		if (context.affectedFileTypes.includes('.tf')) {
			criteria.push('terraform-files');
		}

		if (context.affectedFileTypes.some((type) => type.includes('yaml') || type.includes('yml'))) {
			criteria.push('kubernetes-manifests');
		}

		// Import-based criteria
		if (context.importPatterns.some((imp) => imp.includes('react'))) {
			criteria.push('react-imports');
		}

		// Technology-based criteria
		if (context.technologyStack.includes('docker')) {
			criteria.push('docker-files');
		}

		if (context.technologyStack.includes('kubernetes')) {
			criteria.push('kubernetes-manifests');
		}

		// Infrastructure-based criteria
		if (context.infrastructureComponents.includes('aws')) {
			criteria.push('cloud-config');
		}

		if (context.infrastructureComponents.includes('monitoring')) {
			criteria.push('policy-files'); // Monitoring configs often in policy files
		}

		return criteria;
	}

	/**
	 * Calculate context match score
	 */
	private calculateContextMatchScore(capability: AgentCapability, context: CodebaseContext): number {
		// This is a simplified context matching. In practice, you could implement
		// more sophisticated pattern matching based on file structures, naming conventions, etc.

		let matches = 0;
		let totalChecks = 0;

		// Check if agent's expertise aligns with detected technologies
		totalChecks++;
		const techMatch = context.technologyStack.some((tech) =>
			capability.expertise.some((expertise) => expertise.toLowerCase().includes(tech.toLowerCase()))
		);
		if (techMatch) matches++;

		// Check if agent's expertise aligns with architectural patterns
		totalChecks++;
		const patternMatch = context.architecturalPatterns.some((pattern) =>
			capability.expertise.some((expertise) => expertise.toLowerCase().includes(pattern.toLowerCase()))
		);
		if (patternMatch) matches++;

		return totalChecks > 0 ? matches / totalChecks : 0;
	}

	/**
	 * Generate human-readable reasons for the scoring
	 */
	private generateScoringReasons(
		capability: AgentCapability,
		taskClassification: TaskClassification,
		context: CodebaseContext
	): string[] {
		const reasons: string[] = [];

		this.addDomainReasons(capability, taskClassification, reasons);
		this.addExpertiseReasons(capability, taskClassification, reasons);
		this.addCriteriaReasons(capability, context, reasons);
		this.addTechnologyReasons(capability, context, reasons);
		this.addPriorityReason(capability, reasons);

		return reasons;
	}

	/**
	 * Add domain alignment reasons
	 */
	private addDomainReasons(
		capability: AgentCapability,
		taskClassification: TaskClassification,
		reasons: string[]
	): void {
		if (
			capability.domains &&
			Array.isArray(capability.domains) &&
			capability.domains.includes(taskClassification.primaryDomain)
		) {
			reasons.push(`Primary domain match: ${taskClassification.primaryDomain}`);
		} else {
			reasons.push(`No primary domain match for ${taskClassification.primaryDomain}`);
		}
	}

	/**
	 * Add expertise relevance reasons
	 */
	private addExpertiseReasons(
		capability: AgentCapability,
		taskClassification: TaskClassification,
		reasons: string[]
	): void {
		const relevantExpertise = this.findRelevantExpertise(capability, taskClassification);

		if (relevantExpertise.length > 0) {
			reasons.push(`Relevant expertise: ${relevantExpertise.slice(0, 2).join(', ')}`);
		}
	}

	/**
	 * Find relevant expertise based on task classification
	 */
	private findRelevantExpertise(capability: AgentCapability, taskClassification: TaskClassification): string[] {
		if (!capability.expertise || !Array.isArray(capability.expertise)) {
			return [];
		}

		return capability.expertise.filter((exp) => {
			const firstWord = exp.toLowerCase().split(' ')[0];
			return (
				firstWord !== undefined && taskClassification.reasons.some((reason) => reason.toLowerCase().includes(firstWord))
			);
		});
	}

	/**
	 * Add selection criteria reasons
	 */
	private addCriteriaReasons(capability: AgentCapability, context: CodebaseContext, reasons: string[]): void {
		const contextCriteria = this.extractSelectionCriteriaFromContext(context);
		const matchingCriteria =
			capability.selectionCriteria && Array.isArray(capability.selectionCriteria)
				? capability.selectionCriteria.filter((criterion) => contextCriteria.includes(criterion))
				: [];

		if (matchingCriteria.length > 0) {
			reasons.push(`Matching criteria: ${matchingCriteria.join(', ')}`);
		}
	}

	/**
	 * Add technology alignment reasons
	 */
	private addTechnologyReasons(capability: AgentCapability, context: CodebaseContext, reasons: string[]): void {
		const techMatches = this.findTechnologyMatches(capability, context);

		if (techMatches.length > 0) {
			reasons.push(`Technology alignment: ${techMatches.join(', ')}`);
		}
	}

	/**
	 * Find technology matches between capability and context
	 */
	private findTechnologyMatches(capability: AgentCapability, context: CodebaseContext): string[] {
		if (!capability.expertise || !Array.isArray(capability.expertise)) {
			return [];
		}

		return context.technologyStack.filter((tech) =>
			capability.expertise.some((exp) => exp.toLowerCase().includes(tech.toLowerCase()))
		);
	}

	/**
	 * Add priority information reason
	 */
	private addPriorityReason(capability: AgentCapability, reasons: string[]): void {
		reasons.push(`Priority level: ${capability.priority}`);
	}

	/**
	 * Find the best agent for a specific task and context
	 */
	findBestAgent(
		taskClassification: TaskClassification,
		context: CodebaseContext
	): null | { agent: string; score: AgentScore } {
		const scores = this.scoreAgents(taskClassification, context);

		if (scores.length === 0) {
			return null;
		}

		const bestScore = scores[0];
		if (!bestScore) {
			return null;
		}

		return {
			agent: bestScore.role,
			score: bestScore
		};
	}

	/**
	 * Get agents above a minimum confidence threshold
	 */
	getQualifiedAgents(
		taskClassification: TaskClassification,
		context: CodebaseContext,
		minScore: number = 0.3
	): AgentScore[] {
		const scores = this.scoreAgents(taskClassification, context);
		return scores.filter((agentScore) => agentScore.score >= minScore);
	}
}
