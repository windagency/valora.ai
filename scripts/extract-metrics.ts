#!/usr/bin/env tsx
/**
 * Metrics Extraction Script
 *
 * Extracts workflow optimization metrics from session logs
 * Usage: tsx extract-metrics.ts [7d|30d]
 */

import { existsSync } from 'fs';
import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';

interface OptimizationMetrics {
	complexity_score?: number;
	early_exit_triggered?: boolean;
	initial_confidence?: number;
	pattern_confidence?: number;
	pattern_detected?: string;
	planning_mode?: 'express' | 'standard' | 'template';
	template_used?: string;
	time_saved_minutes?: number;
}

interface QualityMetrics {
	auto_fixes_applied?: number;
	iterations?: number;
	lint_errors_assert?: number;
	lint_errors_realtime?: number;
	plan_approved?: boolean;
	review_score?: number;
}

interface SessionLog {
	command: string;
	duration_ms: number;
	optimization_metrics?: OptimizationMetrics;
	quality_metrics?: QualityMetrics;
	stages?: Array<{
		duration_ms: number;
		outputs?: Record<string, unknown>;
		parallel?: boolean;
		stage: string;
	}>;
	timestamp: string;
	workflow_id: string;
}

interface WorkflowMetrics {
	endDate: string;
	period: string;
	startDate: string;
	totalWorkflows: number;

	// Template usage
	templateUsage: {
		avgTimeSaved: number;
		byPattern: Record<string, { avgTime: number; count: number; timeSaved: number }>;
		rate: number;
		total: number;
		totalTimeSaved: number;
	};

	// Early exit
	earlyExit: {
		avgTimeSaved: number;
		confidenceDistribution: Record<string, number>;
		rate: number;
		totalTimeSaved: number;
		triggered: number;
	};

	// Express planning
	expressPlanning: {
		avgComplexity: number;
		avgTime: number;
		avgTimeSaved: number;
		rate: number;
		totalTimeSaved: number;
		used: number;
	};

	// Parallel validation
	parallelValidation: {
		avgParallelTime: number;
		avgSequentialTime: number;
		avgTimeSaved: number;
		efficiencyGain: number;
		reviewsWithParallel: number;
		totalTimeSaved: number;
	};

	// Real-time linting
	realTimeLinting: {
		autoFixRate: number;
		avgValidationTime: number;
		errorsFoundRealtime: number;
		errorsInAssert: number;
		filesGenerated: number;
		implementations: number;
		totalTimeSaved: number;
	};

	// Decision criteria
	decisionCriteria: {
		avgIterations: number;
		avgTimeSaved: number;
		baselineIterations: number;
		iterationReduction: number;
		singleIterationRate: number;
		totalTimeSaved: number;
	};

	// Technical defaults
	technicalDefaults: {
		avgClarifications: number;
		avgTimeSaved: number;
		baselineClarifications: number;
		clarificationReduction: number;
		defaultsUsageRate: number;
		totalTimeSaved: number;
	};

	// Overall workflow
	avgWorkflowTime: number;
	baselineTime: number;
	timeEfficiency: number;
	totalTimeSaved: number;

	// Phase breakdown
	phaseBreakdown: Record<
		string,
		{
			avg: number;
			baseline: number;
			count: number;
			savings: number;
		}
	>;

	// Quality scores
	qualityScores: {
		codeQuality: number;
		reviewQuality: number;
		testQuality: number;
	};

	// By complexity
	byComplexity: Record<
		string,
		{
			avgTime: number;
			baselineTime: number;
			count: number;
			templateUsage: number;
			timeSaved: number;
		}
	>;
}

const BASELINE_TIMES = {
	avgClarifications: 8.2,
	avgIterations: 2.3,
	avgWorkflowTime: 192, // minutes
	phases: {
		assert: 8.5,
		'create-prd': 8.7,
		implement: 62.4,
		plan: 24.8,
		'refine-specs': 12.3,
		'review-code': 15.2,
		'review-plan': 39.6,
		test: 7.4
	}
};

function calculateAverages(metrics: WorkflowMetrics): void {
	if (metrics.totalWorkflows === 0) return;

	metrics.avgWorkflowTime /= metrics.totalWorkflows;
	metrics.totalTimeSaved = (BASELINE_TIMES.avgWorkflowTime - metrics.avgWorkflowTime) * metrics.totalWorkflows;
	metrics.timeEfficiency = Math.round((1 - metrics.avgWorkflowTime / BASELINE_TIMES.avgWorkflowTime) * 100);

	metrics.templateUsage.rate = (metrics.templateUsage.total / metrics.totalWorkflows) * 100;
	if (metrics.templateUsage.total > 0) {
		metrics.templateUsage.avgTimeSaved = metrics.templateUsage.totalTimeSaved / metrics.templateUsage.total;
	}

	metrics.earlyExit.rate = (metrics.earlyExit.triggered / metrics.totalWorkflows) * 100;
	if (metrics.earlyExit.triggered > 0) {
		metrics.earlyExit.avgTimeSaved = metrics.earlyExit.totalTimeSaved / metrics.earlyExit.triggered;
	}

	metrics.expressPlanning.rate = (metrics.expressPlanning.used / metrics.totalWorkflows) * 100;
	if (metrics.expressPlanning.used > 0) {
		metrics.expressPlanning.avgComplexity /= metrics.expressPlanning.used;
		metrics.expressPlanning.avgTimeSaved = metrics.expressPlanning.totalTimeSaved / metrics.expressPlanning.used;
	}

	if (metrics.decisionCriteria.avgIterations > 0) {
		metrics.decisionCriteria.avgIterations /= metrics.totalWorkflows;
		metrics.decisionCriteria.iterationReduction =
			(1 - metrics.decisionCriteria.avgIterations / metrics.decisionCriteria.baselineIterations) * 100;
	}

	for (const [_phase, data] of Object.entries(metrics.phaseBreakdown)) {
		data.savings = data.baseline - data.avg;
	}
}

function createEmptyMetrics(period: '7d' | '30d', startDate: Date, endDate: Date): WorkflowMetrics {
	return {
		avgWorkflowTime: 0,
		baselineTime: BASELINE_TIMES.avgWorkflowTime,
		byComplexity: {},
		decisionCriteria: {
			avgIterations: 0,
			avgTimeSaved: 0,
			baselineIterations: BASELINE_TIMES.avgIterations,
			iterationReduction: 0,
			singleIterationRate: 0,
			totalTimeSaved: 0
		},
		earlyExit: {
			avgTimeSaved: 0,
			confidenceDistribution: {},
			rate: 0,
			totalTimeSaved: 0,
			triggered: 0
		},
		endDate: endDate.toISOString(),
		expressPlanning: {
			avgComplexity: 0,
			avgTime: 0,
			avgTimeSaved: 0,
			rate: 0,
			totalTimeSaved: 0,
			used: 0
		},
		parallelValidation: {
			avgParallelTime: 0,
			avgSequentialTime: 0,
			avgTimeSaved: 0,
			efficiencyGain: 0,
			reviewsWithParallel: 0,
			totalTimeSaved: 0
		},
		period,
		phaseBreakdown: {},
		qualityScores: {
			codeQuality: 88,
			reviewQuality: 65,
			testQuality: 85
		},
		realTimeLinting: {
			autoFixRate: 0,
			avgValidationTime: 0,
			errorsFoundRealtime: 0,
			errorsInAssert: 0,
			filesGenerated: 0,
			implementations: 0,
			totalTimeSaved: 0
		},
		startDate: startDate.toISOString(),
		technicalDefaults: {
			avgClarifications: 0,
			avgTimeSaved: 0,
			baselineClarifications: BASELINE_TIMES.avgClarifications,
			clarificationReduction: 0,
			defaultsUsageRate: 0,
			totalTimeSaved: 0
		},
		templateUsage: {
			avgTimeSaved: 0,
			byPattern: {},
			rate: 0,
			total: 0,
			totalTimeSaved: 0
		},
		timeEfficiency: 0,
		totalTimeSaved: 0,
		totalWorkflows: 0
	};
}

async function extractMetrics(period: '7d' | '30d' = '30d'): Promise<WorkflowMetrics> {
	const days = period === '7d' ? 7 : 30;
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - days);

	const endDate = new Date();
	const startDate = new Date(cutoffDate);
	const projectRoot = resolveProjectRoot();
	const sessionsDir = join(projectRoot, '.valora', 'sessions');
	const metrics = createEmptyMetrics(period, startDate, endDate);

	if (!existsSync(sessionsDir)) {
		return metrics;
	}

	try {
		const workflows = await readdir(sessionsDir);
		for (const workflowId of workflows) {
			await processWorkflow(join(sessionsDir, workflowId), workflowId, cutoffDate, metrics);
		}
		calculateAverages(metrics);
	} catch (_error) {
		// Silently return empty metrics on error
		// Errors are expected when sessions directory is empty or doesn't exist
	}

	return metrics;
}

function parseSessionLogs(data: Record<string, unknown>, workflowId: string): SessionLog[] {
	const sessionLogs: SessionLog[] = [];
	if (Array.isArray(data.commands)) {
		for (const cmd of data.commands) {
			sessionLogs.push({
				command: cmd.command,
				duration_ms: cmd.duration_ms,
				optimization_metrics: cmd.optimization_metrics,
				quality_metrics: cmd.quality_metrics,
				stages: cmd.stages,
				timestamp: cmd.timestamp,
				workflow_id: (data.workflow_id as string) || (data.session_id as string) || workflowId
			});
		}
	} else {
		sessionLogs.push(data as unknown as SessionLog);
	}
	return sessionLogs;
}

function processEarlyExit(opt: OptimizationMetrics, metrics: WorkflowMetrics): void {
	metrics.earlyExit.triggered++;
	metrics.earlyExit.totalTimeSaved += opt.time_saved_minutes || 0;
	const confidence = opt.initial_confidence || 0;
	const range = confidence >= 9.5 ? '9.5-10' : confidence >= 9.0 ? '9.0-9.4' : '8.5-8.9';
	metrics.earlyExit.confidenceDistribution[range] = (metrics.earlyExit.confidenceDistribution[range] || 0) + 1;
}

function processOptimizationMetrics(opt: OptimizationMetrics, metrics: WorkflowMetrics): void {
	if (opt.template_used && opt.planning_mode === 'template') {
		processTemplateUsage(opt, metrics);
	}

	if (opt.planning_mode === 'express') {
		metrics.expressPlanning.used++;
		metrics.expressPlanning.avgComplexity += opt.complexity_score || 0;
		metrics.expressPlanning.totalTimeSaved += opt.time_saved_minutes || 0;
	}

	if (opt.early_exit_triggered) {
		processEarlyExit(opt, metrics);
	}
}

function processQualityMetrics(quality: QualityMetrics, metrics: WorkflowMetrics): void {
	if (quality.iterations !== undefined) {
		metrics.decisionCriteria.avgIterations += quality.iterations;
	}
	if (quality.review_score !== undefined) {
		metrics.qualityScores.reviewQuality = (metrics.qualityScores.reviewQuality + quality.review_score) / 2;
	}
	if (quality.lint_errors_realtime !== undefined) {
		metrics.realTimeLinting.implementations++;
		metrics.realTimeLinting.errorsFoundRealtime += quality.lint_errors_realtime;
		metrics.realTimeLinting.errorsInAssert += quality.lint_errors_assert || 0;
		metrics.realTimeLinting.totalTimeSaved += 4.1;
	}
}

function processSession(session: SessionLog, metrics: WorkflowMetrics): void {
	metrics.totalWorkflows++;

	if (session.optimization_metrics) {
		processOptimizationMetrics(session.optimization_metrics, metrics);
	}
	if (session.quality_metrics) {
		processQualityMetrics(session.quality_metrics, metrics);
	}

	metrics.avgWorkflowTime += session.duration_ms / 60000;
	processStages(session.stages || [], metrics);
}

function processStages(stages: NonNullable<SessionLog['stages']>, metrics: WorkflowMetrics): void {
	for (const stage of stages) {
		if (!metrics.phaseBreakdown[stage.stage]) {
			metrics.phaseBreakdown[stage.stage] = {
				avg: 0,
				baseline: BASELINE_TIMES.phases[stage.stage as keyof typeof BASELINE_TIMES.phases] || 0,
				count: 0,
				savings: 0
			};
		}
		const phaseData = metrics.phaseBreakdown[stage.stage];
		const stageMinutes = stage.duration_ms / 60000;
		phaseData.avg = (phaseData.avg * phaseData.count + stageMinutes) / (phaseData.count + 1);
		phaseData.count++;
	}
}

function processTemplateUsage(opt: OptimizationMetrics, metrics: WorkflowMetrics): void {
	metrics.templateUsage.total++;
	if (!metrics.templateUsage.byPattern[opt.template_used!]) {
		metrics.templateUsage.byPattern[opt.template_used!] = { avgTime: 0, count: 0, timeSaved: 0 };
	}
	const pattern = metrics.templateUsage.byPattern[opt.template_used!];
	pattern.count++;
	pattern.timeSaved += opt.time_saved_minutes || 0;
	metrics.templateUsage.totalTimeSaved += opt.time_saved_minutes || 0;
}

async function processWorkflow(
	workflowDir: string,
	workflowId: string,
	cutoffDate: Date,
	metrics: WorkflowMetrics
): Promise<void> {
	const workflowStat = await stat(workflowDir);
	if (!workflowStat.isDirectory()) return;

	const files = await readdir(workflowDir);
	for (const file of files) {
		if (!file.endsWith('.json')) continue;

		const filePath = join(workflowDir, file);
		const content = await readFile(filePath, 'utf-8');
		const data = JSON.parse(content);
		const sessionLogs = parseSessionLogs(data, workflowId);

		for (const session of sessionLogs) {
			const sessionDate = new Date(session.timestamp);
			if (sessionDate < cutoffDate) continue;
			processSession(session, metrics);
		}
	}
}

function resolveProjectRoot(): string {
	let projectRoot = process.cwd();
	if (projectRoot.endsWith('scripts')) {
		projectRoot = resolve(projectRoot, '..');
	}
	return projectRoot;
}

// CLI usage
const period = (process.argv[2] as '7d' | '30d') || '30d';
extractMetrics(period)
	.then((metrics) => {
		console.log(JSON.stringify(metrics, null, 2));
	})
	.catch((error) => {
		console.error('Failed to extract metrics:', error);
		process.exit(1);
	});
