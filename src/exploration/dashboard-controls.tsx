/**
 * Dashboard Controls - Interactive controls for exploration management
 *
 * Provides keyboard shortcuts and controls for pause/resume/stop operations
 */

import type { Exploration } from 'types/exploration.types';

import { getLogger } from 'output/logger';
import React, { useEffect, useRef, useState } from 'react';
import { getTUIAdapter } from 'ui/tui-adapter.interface';
import { formatErrorMessage } from 'utils/error-utils';

import { ContainerManager } from './container-manager';
import { ExplorationStateManager } from './exploration-state';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must be PascalCase
const { Box, Text } = tui;

const logger = getLogger();

interface ControlsProps {
	exploration: Exploration;
	onExit: () => void;
	onExplorationUpdate: (exploration: Exploration) => void;
}

interface ControlState {
	isPaused: boolean;
	message?: string;
	messageType?: 'error' | 'info' | 'success';
}

interface KeyHandlers {
	killExploration: () => Promise<void>;
	onExit: () => void;
	pauseExploration: () => Promise<void>;
	resumeExploration: () => Promise<void>;
	stopExploration: () => Promise<void>;
}

/**
 * Custom hook to manage exploration operations
 */
function useExplorationControls(
	exploration: Exploration,
	onExplorationUpdate: (exploration: Exploration) => void,
	setState: React.Dispatch<React.SetStateAction<ControlState>>,
	showMessage: (message: string, type?: 'error' | 'info' | 'success') => void,
	onExit: () => void,
	exitTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>
): {
	killExploration: () => Promise<void>;
	pauseExploration: () => Promise<void>;
	resumeExploration: () => Promise<void>;
	stopExploration: () => Promise<void>;
} {
	const containerManagerRef = useRef<ContainerManager | null>(null);
	const stateManagerRef = useRef<ExplorationStateManager | null>(null);

	containerManagerRef.current ??= new ContainerManager();
	stateManagerRef.current ??= new ExplorationStateManager();

	const containerManager = containerManagerRef.current;
	const stateManager = stateManagerRef.current;

	const pauseExploration = async (): Promise<void> => {
		try {
			logger.info('Pausing exploration...');
			showMessage('Pausing containers...', 'info');

			for (const worktree of exploration.worktrees) {
				if (worktree.container_id && worktree.status === 'running') {
					await containerManager.pauseContainer(worktree.container_id);
				}
			}

			exploration.status = 'stopped';
			await stateManager.saveExploration(exploration);
			onExplorationUpdate(exploration);

			setState((prev) => ({ ...prev, isPaused: true }));
			showMessage('Exploration paused', 'success');
			logger.info('Exploration paused successfully');
		} catch (error: unknown) {
			const message = formatErrorMessage(error);
			logger.error(`Failed to pause: ${message}`);
			showMessage(`Failed to pause: ${message}`, 'error');
		}
	};

	const resumeExploration = async (): Promise<void> => {
		try {
			logger.info('Resuming exploration...');
			showMessage('Resuming containers...', 'info');

			for (const worktree of exploration.worktrees) {
				if (worktree.container_id && exploration.status === 'stopped') {
					await containerManager.unpauseContainer(worktree.container_id);
				}
			}

			exploration.status = 'running';
			await stateManager.saveExploration(exploration);
			onExplorationUpdate(exploration);

			setState((prev) => ({ ...prev, isPaused: false }));
			showMessage('Exploration resumed', 'success');
			logger.info('Exploration resumed successfully');
		} catch (error: unknown) {
			const message = formatErrorMessage(error);
			logger.error(`Failed to resume: ${message}`);
			showMessage(`Failed to resume: ${message}`, 'error');
		}
	};

	const stopExploration = async (): Promise<void> => {
		try {
			logger.info('Stopping exploration...');
			showMessage('Stopping all containers...', 'info');

			for (const worktree of exploration.worktrees) {
				if (worktree.container_id) {
					try {
						await containerManager.stopContainer(worktree.container_id);
					} catch (error: unknown) {
						const message = formatErrorMessage(error);
						logger.warn(`Failed to stop container ${worktree.container_id}: ${message}`);
					}
				}
			}

			exploration.status = 'stopped';
			exploration.completed_at = new Date().toISOString();
			await stateManager.saveExploration(exploration);
			onExplorationUpdate(exploration);

			showMessage('Exploration stopped', 'success');
			logger.info('Exploration stopped successfully');

			if (exitTimeoutRef.current) {
				clearTimeout(exitTimeoutRef.current);
			}
			exitTimeoutRef.current = setTimeout(() => {
				onExit();
			}, 2000);
		} catch (error: unknown) {
			const message = formatErrorMessage(error);
			logger.error(`Failed to stop: ${message}`);
			showMessage(`Failed to stop: ${message}`, 'error');
		}
	};

	const killExploration = async (): Promise<void> => {
		try {
			logger.info('Killing exploration...');
			showMessage('Forcefully killing all containers...', 'info');

			for (const worktree of exploration.worktrees) {
				if (worktree.container_id) {
					try {
						await containerManager.killContainer(worktree.container_id);
					} catch (error: unknown) {
						const message = formatErrorMessage(error);
						logger.warn(`Failed to kill container ${worktree.container_id}: ${message}`);
					}
				}
			}

			exploration.status = 'failed';
			exploration.completed_at = new Date().toISOString();
			await stateManager.saveExploration(exploration);
			onExplorationUpdate(exploration);

			showMessage('Exploration killed', 'success');
			logger.info('Exploration killed successfully');

			if (exitTimeoutRef.current) {
				clearTimeout(exitTimeoutRef.current);
			}
			exitTimeoutRef.current = setTimeout(() => {
				onExit();
			}, 2000);
		} catch (error: unknown) {
			const message = formatErrorMessage(error);
			logger.error(`Failed to kill: ${message}`);
			showMessage(`Failed to kill: ${message}`, 'error');
		}
	};

	return {
		killExploration,
		pauseExploration,
		resumeExploration,
		stopExploration
	};
}

/**
 * Handle keyboard input for dashboard controls
 */
function handleKeyboardInput(input: string, key: { ctrl?: boolean }, state: ControlState, handlers: KeyHandlers): void {
	if (input === 'q' || (key.ctrl === true && input === 'c')) {
		handlers.onExit();
		return;
	}

	const keyHandlers: Record<string, (() => void) | undefined> = {
		k: () => void handlers.killExploration(),
		p: state.isPaused ? undefined : () => void handlers.pauseExploration(),
		r: state.isPaused ? () => void handlers.resumeExploration() : undefined,
		s: () => void handlers.stopExploration()
	};

	const handler = keyHandlers[input];
	handler?.();
}

/**
 * Interactive controls component
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React component must be PascalCase
export const DashboardControls: React.FC<ControlsProps> = ({ exploration, onExit, onExplorationUpdate }) => {
	const [state, setState] = useState<ControlState>({
		isPaused: false
	});

	// Refs to track timeouts for cleanup (prevents memory leaks)
	const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const exitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	// Cleanup all timeouts on unmount
	useEffect(() => {
		return () => {
			if (messageTimeoutRef.current) {
				clearTimeout(messageTimeoutRef.current);
				messageTimeoutRef.current = null;
			}
			if (exitTimeoutRef.current) {
				clearTimeout(exitTimeoutRef.current);
				exitTimeoutRef.current = null;
			}
		};
	}, []);

	const showMessage = (message: string, type: 'error' | 'info' | 'success' = 'info'): void => {
		// Clear any existing message timeout to prevent accumulation
		if (messageTimeoutRef.current) {
			clearTimeout(messageTimeoutRef.current);
		}

		setState((prev) => ({ ...prev, message, messageType: type }));
		messageTimeoutRef.current = setTimeout(() => {
			setState((prev) => ({ ...prev, message: undefined, messageType: undefined }));
			messageTimeoutRef.current = null;
		}, 3000);
	};

	const { killExploration, pauseExploration, resumeExploration, stopExploration } = useExplorationControls(
		exploration,
		onExplorationUpdate,
		setState,
		showMessage,
		onExit,
		exitTimeoutRef
	);

	// Keyboard input handling
	tui.useInput((input, key) => {
		handleKeyboardInput(input, key, state, {
			killExploration,
			onExit,
			pauseExploration,
			resumeExploration,
			stopExploration
		});
	});

	const messageColorMap = {
		error: 'red',
		info: 'cyan',
		success: 'green'
	} as const;

	const messageColor = state.messageType ? messageColorMap[state.messageType] : 'cyan';

	return (
		<Box flexDirection="column">
			{/* Control Panel */}
			<Box borderColor="blue" borderStyle="round" padding={1}>
				<Box flexDirection="column" width="100%">
					<Text bold color="blue">
						🎮 Controls
					</Text>

					<Box flexDirection="column" marginTop={1}>
						<Text dimColor>
							[P] {state.isPaused ? 'Paused' : 'Pause'} | [R] Resume | [S] Stop | [K] Kill | [Q] Quit
						</Text>
					</Box>

					{state.message && (
						<Box marginTop={1}>
							<Text color={messageColor}>→ {state.message}</Text>
						</Box>
					)}
				</Box>
			</Box>

			{/* Status Indicators */}
			<Box marginTop={1}>
				{state.isPaused && (
					<Text bold color="yellow">
						⏸️ PAUSED
					</Text>
				)}
				{exploration.status === 'running' && !state.isPaused && (
					<Text bold color="green">
						▶️ RUNNING
					</Text>
				)}
				{exploration.status === 'stopped' && (
					<Text bold color="yellow">
						⏹️ STOPPED
					</Text>
				)}
				{exploration.status === 'completed' && (
					<Text bold color="green">
						✅ COMPLETED
					</Text>
				)}
				{exploration.status === 'failed' && (
					<Text bold color="red">
						❌ FAILED
					</Text>
				)}
			</Box>
		</Box>
	);
};

/**
 * Help panel showing available commands
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React component must be PascalCase
export const HelpPanel: React.FC<{ visible: boolean }> = ({ visible }) => {
	if (!visible) return null;

	return (
		<Box borderColor="cyan" borderStyle="round" padding={1}>
			<Box flexDirection="column">
				<Text bold color="cyan">
					⌨️ Keyboard Shortcuts
				</Text>

				<Box flexDirection="column" marginTop={1}>
					<Box>
						<Text bold>P</Text>
						<Text dimColor> - Pause all containers</Text>
					</Box>
					<Box>
						<Text bold>R</Text>
						<Text dimColor> - Resume paused exploration</Text>
					</Box>
					<Box>
						<Text bold>S</Text>
						<Text dimColor> - Stop exploration gracefully</Text>
					</Box>
					<Box>
						<Text bold>K</Text>
						<Text dimColor> - Kill exploration (force stop)</Text>
					</Box>
					<Box>
						<Text bold>Q</Text>
						<Text dimColor> - Quit dashboard (Ctrl+C also works)</Text>
					</Box>
				</Box>
			</Box>
		</Box>
	);
};
