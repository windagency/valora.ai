/**
 * Worktree Diagram Panel
 */

import React from 'react';

import type { WorktreeDiagramEntry } from 'ui/dashboard/types';

import { getExplorationStatusColor, getWorktreeStatusIcon } from 'ui/dashboard/utils/format-helpers';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function WorktreeDiagramPanel({ worktrees }: { worktrees: WorktreeDiagramEntry[] }): React.JSX.Element {
	const mainWorktree = worktrees.find((wt) => wt.isMainWorktree);
	const childWorktrees = worktrees.filter((wt) => !wt.isMainWorktree);
	const maxDisplay = 4;
	const displayChildren = childWorktrees.slice(0, maxDisplay);
	const overflowCount = childWorktrees.length - maxDisplay;

	return (
		<Box borderColor="green" borderStyle="round" flexDirection="column" paddingX={1}>
			<Text bold color="green">
				Git Worktrees ({worktrees.length})
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{mainWorktree ? (
					<>
						<Box>
							<Text color="cyan">
								{'\u25cf'} {mainWorktree.branch || 'main'}
							</Text>
							<Text dimColor> {mainWorktree.commit}</Text>
						</Box>
						{displayChildren.length === 0 ? (
							<Text dimColor>No additional worktrees</Text>
						) : (
							displayChildren.map((wt, index) => (
								<WorktreeChildRow
									isLast={index === displayChildren.length - 1 && overflowCount <= 0}
									key={wt.path}
									worktree={wt}
								/>
							))
						)}
						{overflowCount > 0 && <Text dimColor>...and {overflowCount} more</Text>}
					</>
				) : (
					<Text dimColor>No git repository detected</Text>
				)}
			</Box>
		</Box>
	);
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function WorktreeChildRow({
	isLast,
	worktree
}: {
	isLast: boolean;
	worktree: WorktreeDiagramEntry;
}): React.JSX.Element {
	const connector = isLast ? '\u2514\u2500\u2500' : '\u251c\u2500\u2500';
	const branchColor = worktree.prunable ? 'red' : worktree.isExploration ? 'yellow' : 'white';
	const truncatedTask =
		worktree.explorationTask && worktree.explorationTask.length > 20
			? worktree.explorationTask.substring(0, 17) + '...'
			: worktree.explorationTask;

	return (
		<Box flexDirection="column">
			<Box>
				<Text dimColor>{connector} </Text>
				<Text color={branchColor}>{worktree.branch}</Text>
			</Box>
			<Box>
				<Text dimColor>{isLast ? '    ' : '\u2502   '}</Text>
				<Text dimColor>{worktree.commit}</Text>
				{worktree.explorationStatus && (
					<Text color={getExplorationStatusColor(worktree.explorationStatus)}>
						{' '}
						{getWorktreeStatusIcon(worktree.explorationStatus)} {worktree.explorationStatus.toUpperCase()}
					</Text>
				)}
				{truncatedTask && <Text dimColor> {truncatedTask}</Text>}
			</Box>
		</Box>
	);
}
