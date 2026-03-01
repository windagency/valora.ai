/**
 * Dynamic Agent Resolver Service
 *
 * Main orchestration service for intelligent agent selection.
 * Coordinates task classification, context analysis, and capability matching
 * to automatically select the most appropriate agent for a given task.
 */

import type { AgentScore, AgentSelection, CodebaseContext, TaskClassification, TaskContext } from 'types/agent.types';

import { getLogger } from 'output/logger';
import { formatErrorMessage } from 'utils/error-utils';

import type { AgentCapabilityMatcherService } from './agent-capability-matcher.service';
import type { AgentCapabilityRegistryService } from './agent-capability-registry.service';
import type { ContextAnalyzerService } from './context-analyzer.service';
import type { TaskClassifierService } from './task-classifier.service';

export class DynamicAgentResolverService {
	private readonly capabilityMatcher: AgentCapabilityMatcherService;
	private readonly contextAnalyzer: ContextAnalyzerService;
	private readonly HIGH_CONFIDENCE_THRESHOLD = 0.75;
	private readonly logger = getLogger();
	private readonly MIN_CONFIDENCE_THRESHOLD = 0.3;

	private readonly registryService: AgentCapabilityRegistryService;
	private readonly taskClassifier: TaskClassifierService;

	constructor(
		taskClassifier: TaskClassifierService,
		contextAnalyzer: ContextAnalyzerService,
		capabilityMatcher: AgentCapabilityMatcherService,
		registryService: AgentCapabilityRegistryService
	) {
		this.taskClassifier = taskClassifier;
		this.contextAnalyzer = contextAnalyzer;
		this.capabilityMatcher = capabilityMatcher;
		this.registryService = registryService;
	}

	/**
	 * Resolve the best agent for a given task context
	 */
	async resolveAgent(taskContext: TaskContext): Promise<AgentSelection> {
		this.logger.info('Starting dynamic agent resolution', {
			affectedFiles: taskContext.affectedFiles?.length ?? 0,
			complexity: taskContext.complexity,
			description: taskContext.description ? taskContext.description.substring(0, 50) + '...' : 'No description'
		});

		try {
			// Ensure registry is initialized
			await this.registryService.initialize();

			// Step 1: Classify the task
			const taskClassification = this.taskClassifier.classifyTask(taskContext);
			this.logger.debug('Task classification complete', {
				confidence: taskClassification.confidence,
				primaryDomain: taskClassification.primaryDomain,
				suggestedAgents: taskClassification.suggestedAgents.length
			});

			// Step 2: Analyze codebase context
			const codebaseContext = await this.contextAnalyzer.analyzeTaskContext(taskContext);
			this.logger.debug('Context analysis complete', {
				fileTypes: codebaseContext.affectedFileTypes.length,
				importPatterns: codebaseContext.importPatterns.length,
				technologyStack: codebaseContext.technologyStack.length
			});

			// Step 3: Score agents based on classification and context
			const agentScores = this.capabilityMatcher.scoreAgents(taskClassification, codebaseContext);

			// Step 4: Select optimal agent with fallback logic
			const selection = this.selectOptimalAgent(agentScores, taskContext);

			this.logger.info('Agent resolution complete', {
				alternatives: selection.alternatives.length,
				confidence: selection.confidence,
				fallbackAgent: selection.fallbackAgent,
				selectedAgent: selection.selectedAgent
			});

			return selection;
		} catch (error) {
			this.logger.error('Agent resolution failed', error as Error);
			this.logger.debug('Failed task context', {
				taskDescription: taskContext.description ? taskContext.description.substring(0, 100) : 'No description'
			});

			// Return safe fallback selection
			return this.createFallbackSelection(taskContext);
		}
	}

	/**
	 * Select the optimal agent based on scoring results and business logic
	 */
	private selectOptimalAgent(agentScores: AgentScore[], taskContext: TaskContext): AgentSelection {
		if (agentScores.length === 0) {
			this.logger.warn('No agent scores available, using fallback');
			const fallbackSelection = this.createFallbackSelection(taskContext);
			fallbackSelection.reasons.push('No agent scores available');
			return fallbackSelection;
		}

		const topAgent = agentScores[0];
		if (!topAgent) {
			throw new Error('No agents available for task');
		}

		// Check confidence thresholds
		if (topAgent.score >= this.HIGH_CONFIDENCE_THRESHOLD) {
			// High confidence - use top agent directly
			return this.createSelection(topAgent, agentScores.slice(1, 4), taskContext);
		}

		if (topAgent.score >= this.MIN_CONFIDENCE_THRESHOLD) {
			// Medium confidence - check if we have a clear winner
			const secondBest = agentScores[1];
			const confidenceGap = topAgent.score - (secondBest?.score ?? 0);

			if (confidenceGap >= 0.2) {
				// Clear winner
				return this.createSelection(topAgent, agentScores.slice(1, 4), taskContext);
			} else {
				// Close contest - consider escalation or fallback
				this.logger.warn('Close agent scoring contest, considering escalation', {
					gap: confidenceGap,
					secondScore: secondBest?.score,
					topScore: topAgent.score
				});
			}
		}

		// Low confidence - use fallback logic
		this.logger.warn('Low confidence in agent selection, using fallback', {
			threshold: this.MIN_CONFIDENCE_THRESHOLD,
			topScore: topAgent.score
		});

		const fallbackSelection = this.createFallbackSelection(taskContext, topAgent);
		fallbackSelection.reasons.push('Low confidence in agent selection');
		return fallbackSelection;
	}

	/**
	 * Create a standard agent selection result
	 */
	private createSelection(bestAgent: AgentScore, alternatives: AgentScore[], taskContext: TaskContext): AgentSelection {
		const alternativeResults = alternatives.map((alt) => ({
			agent: alt.role,
			reasons: alt.reasons,
			score: alt.score
		}));

		return {
			alternatives: alternativeResults,
			confidence: bestAgent.score,
			fallback: false,
			fallbackAgent: this.determineFallbackAgent(taskContext),
			reasons: bestAgent.reasons,
			selectedAgent: bestAgent.role
		};
	}

	/**
	 * Create a fallback selection when automatic resolution fails
	 */
	private createFallbackSelection(taskContext: TaskContext, preferredAgent?: AgentScore): AgentSelection {
		// Determine fallback based on task context
		const fallbackAgent = this.determineFallbackAgent(taskContext);

		// If we have a preferred agent, include it as the selection but mark low confidence
		if (preferredAgent) {
			return {
				alternatives: [],
				confidence: Math.min(preferredAgent.score, 0.4),
				fallback: true,
				fallbackAgent,
				// Cap at 0.4 for fallbacks
				reasons: [...preferredAgent.reasons, 'Low confidence - using as fallback selection'],
				selectedAgent: preferredAgent.role
			};
		}

		// Pure fallback selection
		return {
			alternatives: [],
			confidence: 0.1,
			fallback: true,
			fallbackAgent,
			// Very low confidence for pure fallbacks
			reasons: [
				'Automatic agent selection failed',
				`Using fallback agent: ${fallbackAgent}`,
				'Consider providing explicit agent parameter for better results'
			],
			selectedAgent: fallbackAgent
		};
	}

	/**
	 * Determine the most appropriate fallback agent based on task context
	 */
	private determineFallbackAgent(taskContext: TaskContext): string {
		// Simple heuristic-based fallback selection
		const affectedFiles = taskContext.affectedFiles ?? [];
		const hasFrontendFiles = affectedFiles.some(
			(file) =>
				file.includes('frontend') ||
				file.includes('ui') ||
				file.includes('component') ||
				file.endsWith('.tsx') ||
				file.endsWith('.jsx')
		);

		const hasBackendFiles = affectedFiles.some(
			(file) =>
				file.includes('backend') ||
				file.includes('api') ||
				file.includes('server') ||
				file.includes('database') ||
				(file.endsWith('.ts') && !file.endsWith('.tsx'))
		);

		const hasInfrastructureFiles = affectedFiles.some(
			(file) =>
				file.includes('infrastructure') ||
				file.includes('terraform') ||
				file.includes('docker') ||
				file.includes('kubernetes') ||
				file.endsWith('.tf') ||
				file.endsWith('.yaml') ||
				file.endsWith('.yml')
		);

		// Priority order for fallbacks
		if (hasInfrastructureFiles) {
			return 'platform-engineer';
		}

		if (hasFrontendFiles) {
			return 'software-engineer-typescript-frontend-react';
		}

		if (hasBackendFiles) {
			return 'software-engineer-typescript-backend';
		}

		// Default fallback
		return 'software-engineer-typescript';
	}

	/**
	 * Get detailed analysis for debugging or transparency
	 */
	async getDetailedAnalysis(taskContext: TaskContext): Promise<{
		agentScores: AgentScore[];
		codebaseContext: CodebaseContext;
		selection: AgentSelection;
		taskClassification: TaskClassification;
	}> {
		const taskClassification = this.taskClassifier.classifyTask(taskContext);
		const codebaseContext = await this.contextAnalyzer.analyzeTaskContext(taskContext);
		const agentScores = this.capabilityMatcher.scoreAgents(taskClassification, codebaseContext);
		const selection = await this.resolveAgent(taskContext);

		return {
			agentScores,
			codebaseContext,
			selection,
			taskClassification
		};
	}

	/**
	 * Validate that all required services are properly initialized
	 */
	async validateServices(): Promise<{
		issues: string[];
		stats: {
			analyzerCacheSize: number;
			classifierCacheSize: number;
			registryAgents: number;
			registryDomains: number;
		};
		valid: boolean;
	}> {
		const issues: string[] = [];

		try {
			await this.registryService.initialize();
		} catch (error) {
			issues.push(`Registry initialization failed: ${(error as Error).message}`);
		}

		const registryStats = this.registryService.getStats();

		return {
			issues,
			stats: {
				// Would need to expose from TaskClassifierService
				analyzerCacheSize: this.contextAnalyzer.getCacheSize(),
				classifierCacheSize: 0,
				registryAgents: registryStats.totalAgents,
				registryDomains: registryStats.totalDomains
			},
			valid: issues.length === 0
		};
	}

	/**
	 * Clear all caches (useful for development/testing)
	 */
	clearCaches(): void {
		this.contextAnalyzer.clearCache();
		this.registryService.reload().catch((error: unknown) => {
			this.logger.warn('Failed to reload registry during cache clear', { error: formatErrorMessage(error) });
		});
		this.logger.debug('All dynamic agent resolver caches cleared');
	}

	/**
	 * Get performance and usage statistics
	 */
	getStats(): {
		cacheSizes: {
			contextAnalyzer: number;
		};
		thresholds: {
			highConfidence: number;
			minConfidence: number;
		};
	} {
		return {
			cacheSizes: {
				contextAnalyzer: this.contextAnalyzer.getCacheSize()
			},
			thresholds: {
				highConfidence: this.HIGH_CONFIDENCE_THRESHOLD,
				minConfidence: this.MIN_CONFIDENCE_THRESHOLD
			}
		};
	}
}
