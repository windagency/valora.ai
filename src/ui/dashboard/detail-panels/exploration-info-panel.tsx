/**
 * Exploration Info Panel
 */

import type { Exploration } from 'types/exploration.types';

import { ExplorationStateManager } from 'exploration/exploration-state';
import React, { useEffect, useState } from 'react';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

import { formatDurationMs, getExplorationStatusColor } from '../utils/format-helpers';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function ExplorationInfoPanel({
	explorationId,
	sessionId
}: {
	explorationId?: string;
	sessionId: string;
}): React.JSX.Element {
	const [exploration, setExploration] = useState<Exploration | null>(null);
	const [stateManager] = useState(() => new ExplorationStateManager());

	useEffect(() => {
		if (explorationId) {
			stateManager
				.loadExploration(explorationId)
				.then(setExploration)
				.catch(() => setExploration(null));
		} else {
			stateManager
				.findBySessionId(sessionId)
				.then(setExploration)
				.catch(() => setExploration(null));
		}
	}, [explorationId, sessionId, stateManager]);

	if (!exploration && !explorationId) {
		return <></>;
	}

	return (
		<Box borderColor="magenta" borderStyle="round" flexDirection="column" marginBottom={1} paddingX={1}>
			<Text bold color="magenta">
				Exploration
			</Text>
			<Box flexDirection="column" marginTop={1}>
				<Box>
					<Text dimColor>Exploration ID: </Text>
					<Text bold color="cyan">
						{exploration?.id ?? explorationId}
					</Text>
				</Box>
				{exploration && (
					<>
						<Box>
							<Text dimColor>Task: </Text>
							<Text>{exploration.task}</Text>
						</Box>
						<Box>
							<Text dimColor>Status: </Text>
							<Text bold color={getExplorationStatusColor(exploration.status)}>
								{exploration.status.toUpperCase()}
							</Text>
						</Box>
						<Box>
							<Text dimColor>Branches: </Text>
							<Text>
								{exploration.completed_branches}/{exploration.branches}
							</Text>
						</Box>
						{exploration.duration_ms != null && (
							<Box>
								<Text dimColor>Duration: </Text>
								<Text>{formatDurationMs(exploration.duration_ms)}</Text>
							</Box>
						)}
						{exploration.worktrees.length > 0 && (
							<Box flexDirection="column" marginTop={1}>
								<Text dimColor>Worktrees:</Text>
								{exploration.worktrees.map((wt) => (
									<ExplorationWorktreeRow key={wt.index} worktree={wt} />
								))}
							</Box>
						)}
					</>
				)}
			</Box>
		</Box>
	);
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
function ExplorationWorktreeRow({ worktree }: { worktree: Exploration['worktrees'][number] }): React.JSX.Element {
	return (
		<Box key={worktree.index}>
			<Text dimColor> {worktree.index}. </Text>
			<Text color={getExplorationStatusColor(worktree.status)}>[{worktree.status}]</Text>
			<Text> {worktree.strategy ?? `branch-${worktree.index}`}</Text>
			<Text dimColor> ({worktree.branch_name.replace(/^refs\/heads\//, '')})</Text>
		</Box>
	);
}
