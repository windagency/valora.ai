/**
 * Stage Scheduler - Responsible for grouping stages for parallel/sequential execution
 *
 * MAINT-002: Large Files Need Splitting - Extracted from pipeline.ts
 */

import type { PipelineStage } from 'types/command.types';

export class StageScheduler {
	/**
	 * Group stages by parallel execution requirements
	 */
	groupStages(stages: PipelineStage[]): Array<{ parallel: boolean; stages: PipelineStage[] }> {
		const result = stages.reduce(
			(acc, stage) => {
				const { currentGroup, groups, isParallel } = acc;

				if (stage.parallel && currentGroup.length === 0) {
					// Start new parallel group
					return {
						currentGroup: [stage],
						groups,
						isParallel: true
					};
				}

				if (stage.parallel && isParallel) {
					// Continue parallel group
					return {
						...acc,
						currentGroup: [...currentGroup, stage]
					};
				}

				// End current group and start new one
				const updatedGroups =
					currentGroup.length > 0 ? [...groups, { parallel: isParallel, stages: currentGroup }] : groups;

				return {
					currentGroup: [stage],
					groups: updatedGroups,
					isParallel: stage.parallel ?? false
				};
			},
			{
				currentGroup: [] as PipelineStage[],
				groups: [] as Array<{ parallel: boolean; stages: PipelineStage[] }>,
				isParallel: false
			}
		);

		// Add last group if exists
		return result.currentGroup.length > 0
			? [...result.groups, { parallel: result.isParallel, stages: result.currentGroup }]
			: result.groups;
	}

	/**
	 * Validate that stages can be grouped (no circular dependencies in parallel groups)
	 */
	validateGrouping(stages: PipelineStage[]): string[] {
		// Basic validation - ensure no stage appears multiple times using reduce
		const stageNameCounts = stages.reduce((acc, stage) => {
			acc.set(stage.stage, (acc.get(stage.stage) ?? 0) + 1);
			return acc;
		}, new Map<string, number>());

		return Array.from(stageNameCounts.entries())
			.filter(([, count]) => count > 1)
			.map(([stageName]) => `Duplicate stage name: ${stageName}`);
	}
}
