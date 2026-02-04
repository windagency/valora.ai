/**
 * Processing Feedback - Shows user feedback during LLM processing
 *
 * Listens to pipeline events and displays an animated spinner
 * so users know what's happening while the system is "thinking".
 */

import { CONTEXT_THRESHOLD_WARNING, HIGH_CONFIDENCE_THRESHOLD } from 'config/constants';
import { getModelContextWindow } from 'config/providers.config';
import {
	type PipelineEventData,
	PipelineEventType,
	type SessionInfoData,
	type WorktreeInfoData
} from 'types/pipeline.types';
import { formatNumber } from 'utils/number-format';

import { getColorAdapter } from './color-adapter.interface';
import { getPipelineEmitter, type PipelineEventEmitter } from './pipeline-emitter';
import { ANSI, SPINNER_FRAMES, truncateToWidth } from './terminal-utils';

/**
 * Context window usage tracking
 */
export interface ProcessingFeedbackOptions {
	/** Whether feedback is enabled */
	enabled?: boolean;
	/** Show model name in feedback */
	showModel?: boolean;
	/** Show stage information */
	showStage?: boolean;
}

interface ContextWindowState {
	/** Context window size for current model */
	contextWindowSize: number;
	/** Current model name */
	model: string;
	/** Cumulative output tokens generated */
	outputTokensTotal: number;
	/** Prompt tokens used (represents context usage) */
	promptTokensUsed: number;
	/** Utilization percentage */
	utilizationPercent: number;
}

/**
 * Thinking phrases to cycle through during processing
 */
const THINKING_PHRASES = ['Thinking', 'Analyzing', 'Processing', 'Reasoning', 'Considering', 'Evaluating', 'Working'];

/**
 * Stage state for visual indicators
 */
type StageState = 'active' | 'error' | 'success' | 'warning';

/**
 * Per-stage group state
 */
interface StageGroup {
	/** Time when stage started */
	startTime: number;
	/** Number of child messages printed for this stage */
	childCount: number;
	isParallel: boolean;
	name: string;
	state: StageState;
	/** Total tokens for this stage */
	tokenCount: number;
	worktreeInfo?: WorktreeInfoData;
	/** Buffered messages for parallel stages (rendered on completion) */
	messageBuffer: string[];
}

/**
 * Maximum length for tools list in output
 */
const MAX_TOOLS_LIST_LENGTH = 60;

export class ProcessingFeedback {
	private activeLLMRequests = 0;
	private activeParallelStages: Map<string, StageGroup> = new Map();
	/** Context window usage tracking */
	private contextWindow: ContextWindowState | null = null;
	private currentActivity: string = '';
	private currentGroup: null | string = null;
	private currentModel: null | string = null;
	private currentStage: null | string = null;
	private emitter: PipelineEventEmitter;
	private enabled: boolean;
	private eventHandler: ((event: PipelineEventData) => void) | null = null;
	private groupDepth = 0;
	private options: ProcessingFeedbackOptions;
	private phraseIndex = 0;
	private phraseInterval: NodeJS.Timeout | null = null;
	/** Session info for displaying execution mode */
	private sessionInfo: null | SessionInfoData = null;
	private spinnerFrame = 0;
	private startTime: null | number = null;
	private statusBarInterval: NodeJS.Timeout | null = null;
	private statusBarVisible = false;

	constructor(options: ProcessingFeedbackOptions = {}) {
		this.options = {
			enabled: true,
			showModel: true,
			showStage: true,
			...options
		};
		this.enabled = this.options.enabled ?? true;
		this.emitter = getPipelineEmitter();
	}

	/**
	 * Start listening for pipeline events and showing feedback
	 */
	start(): void {
		if (!this.enabled) return;

		this.eventHandler = this.handleEvent.bind(this);
		this.emitter.onAny(this.eventHandler);
	}

	/**
	 * Stop listening and clean up
	 */
	stop(): void {
		if (this.eventHandler) {
			this.emitter.offAny(this.eventHandler);
			this.eventHandler = null;
		}
		this.hideStatusBar();
		this.stopPhraseRotation();
		this.reset();
	}

	/**
	 * Handle pipeline events
	 */
	private handleEvent(event: PipelineEventData): void {
		const eventHandlers: Partial<Record<PipelineEventType, (e: PipelineEventData) => void>> = {
			[PipelineEventType.LLM_REQUEST]: (e) => this.handleLLMRequest(e),
			[PipelineEventType.LLM_RESPONSE]: (e) => this.handleLLMResponse(e),
			[PipelineEventType.PIPELINE_COMPLETE]: () => this.handlePipelineComplete(),
			[PipelineEventType.PIPELINE_ERROR]: (e) => this.handlePipelineError(e),
			[PipelineEventType.PIPELINE_START]: (e) => this.handlePipelineStart(e),
			[PipelineEventType.STAGE_COMPLETE]: (e) => this.handleStageComplete(e),
			[PipelineEventType.STAGE_ERROR]: (e) => this.handleStageError(e),
			[PipelineEventType.STAGE_START]: (e) => this.handleStageStart(e)
		};

		eventHandlers[event.type]?.(event);
	}

	/**
	 * Handle pipeline start - capture initial context and session info
	 */
	private handlePipelineStart(event: PipelineEventData): void {
		this.currentModel = event.model ?? null;
		this.startTime = Date.now();
		this.sessionInfo = event.sessionInfo ?? null;
	}

	/**
	 * Handle stage start - print group header with active indicator
	 */
	private handleStageStart(event: PipelineEventData): void {
		this.currentStage = event.stage ?? null;

		if (!this.currentStage) {
			return;
		}

		const stageName = this.currentStage.includes('.') ? this.currentStage.split('.').pop() : this.currentStage;
		const isParallel = event.isParallel ?? false;

		// Register the stage with active state
		this.activeParallelStages.set(this.currentStage, {
			childCount: 0,
			isParallel,
			messageBuffer: [],
			name: stageName ?? 'Stage',
			startTime: Date.now(),
			state: 'active',
			tokenCount: 0,
			worktreeInfo: event.worktreeInfo
		});

		// Print initial group header (will be animated by drawStatusBar)
		this.printGroupHeaderDirect(stageName ?? 'Stage', event.worktreeInfo, isParallel);

		// Start status bar if not already showing
		if (!this.statusBarVisible) {
			this.showStatusBar();
		}
	}

	/**
	 * Print initial group header directly (for active states, will be animated by drawStatusBar)
	 */
	private printGroupHeaderDirect(name: string, worktreeInfo?: WorktreeInfoData, isParallel?: boolean): void {
		if (this.isMcpMode()) return;

		const color = getColorAdapter();
		const frame = SPINNER_FRAMES[this.spinnerFrame % SPINNER_FRAMES.length] ?? '⠋';
		const spinnerChar = color.cyan(frame);
		const worktreeSuffix = worktreeInfo ? color.dim(` [${worktreeInfo.branch}]`) : '';
		const executionMode = isParallel ? 'Parallel' : 'Sequential';
		const headerText = `${spinnerChar} ${name} ${color.dim(`| ${executionMode}`)}${worktreeSuffix}`;

		if (this.statusBarVisible) {
			// Move to start of margin line (3 lines up from context insights line)
			process.stderr.write(`${ANSI.moveToCol(1)}${ANSI.cursorUp(3)}`);
			// Clear all 4 lines of status bar area
			process.stderr.write(`${ANSI.CLEAR_LINE}`);
			process.stderr.write(`${ANSI.cursorDown(1)}${ANSI.moveToCol(1)}${ANSI.CLEAR_LINE}`);
			process.stderr.write(`${ANSI.cursorDown(1)}${ANSI.moveToCol(1)}${ANSI.CLEAR_LINE}`);
			process.stderr.write(`${ANSI.cursorDown(1)}${ANSI.moveToCol(1)}${ANSI.CLEAR_LINE}`);
			// Move back to margin position
			process.stderr.write(`${ANSI.cursorUp(3)}${ANSI.moveToCol(1)}`);
			// Print margin before group + header
			process.stderr.write(`\n${headerText}\n`);
			// Print margin before separator
			process.stderr.write('\n');
			// Redraw separator and status bar (with context insights)
			this.drawSeparatorLine(); // separator + \n, cursor on status bar line
			// Reserve both lines by writing content then clear
			process.stderr.write(' \n'); // status bar line placeholder
			process.stderr.write(' '); // context insights line placeholder
			process.stderr.write(`${ANSI.moveToCol(1)}`); // move to start of context insights line
			this.drawStatusBarOnly(); // cursor remains on context insights line
		} else {
			process.stderr.write(`\n${headerText}\n`); // Margin before group + header
		}
	}

	/**
	 * Draw horizontal separator line before status bar
	 */
	private drawSeparatorLine(): void {
		if (this.isMcpMode()) return;

		const color = getColorAdapter();
		const termWidth = process.stderr.columns || 120;
		const separatorLine = '─'.repeat(termWidth);
		process.stderr.write(`${color.dim(separatorLine)}\n`);
	}

	/**
	 * Check if any parallel stages are currently active
	 * Buffer messages when any parallel stage is active to prevent interleaved output
	 */
	private isInParallelMode(): boolean {
		return Array.from(this.activeParallelStages.values()).some((s) => s.state === 'active' && s.isParallel);
	}

	/**
	 * Print content above the status bar, routing to the correct stage
	 */
	private printAboveStatusBar(content: string, isFirstChild?: boolean, stagePath?: string): void {
		if (this.isMcpMode()) {
			return;
		}

		// Add tree branch for first child message
		const color = getColorAdapter();
		const treePrefix = isFirstChild ? `  ${color.dim('└')} ` : '    ';
		const formattedContent = content.startsWith('  ') ? `${treePrefix}${content.slice(2)}` : content;

		// In parallel mode, buffer messages for their respective stages
		if (this.isInParallelMode() && stagePath) {
			const stage = this.activeParallelStages.get(stagePath);
			if (stage) {
				stage.messageBuffer.push(formattedContent);
				return; // Don't print immediately, will flush on stage completion
			}
		}

		// Sequential mode or fallback: print immediately
		this.printLineAboveStatusBar(formattedContent);
	}

	/**
	 * Print a single line above the status bar (immediate output)
	 */
	private printLineAboveStatusBar(formattedContent: string): void {
		if (this.statusBarVisible) {
			// Save cursor, move up past status bar area, clear and print content, restore status bar
			// Status bar area = margin (1 line) + separator (1 line) + status bar (1 line) + context insights (1 line) = 4 lines

			// Move to start of margin line (3 lines up from context insights line)
			process.stderr.write(`${ANSI.moveToCol(1)}${ANSI.cursorUp(3)}`);
			// Clear all 4 lines of status bar area
			process.stderr.write(`${ANSI.CLEAR_LINE}`);
			process.stderr.write(`${ANSI.cursorDown(1)}${ANSI.moveToCol(1)}${ANSI.CLEAR_LINE}`);
			process.stderr.write(`${ANSI.cursorDown(1)}${ANSI.moveToCol(1)}${ANSI.CLEAR_LINE}`);
			process.stderr.write(`${ANSI.cursorDown(1)}${ANSI.moveToCol(1)}${ANSI.CLEAR_LINE}`);
			// Move back to margin position
			process.stderr.write(`${ANSI.cursorUp(3)}${ANSI.moveToCol(1)}`);
			// Print content
			process.stderr.write(`${formattedContent}\n`);
			// Print margin before separator
			process.stderr.write('\n');
			// Redraw separator and status bar (with context insights)
			this.drawSeparatorLine(); // separator + \n, cursor on status bar line
			// Reserve both lines by writing content then clear
			process.stderr.write(' \n'); // status bar line placeholder
			process.stderr.write(' '); // context insights line placeholder
			process.stderr.write(`${ANSI.moveToCol(1)}`); // move to start of context insights line
			this.drawStatusBarOnly(); // cursor remains on context insights line
		} else {
			process.stderr.write(`${formattedContent}\n`);
		}
	}

	/**
	 * Flush buffered messages for a stage (prints all messages as a block)
	 */
	private flushStageMessages(stage: StageGroup): void {
		if (stage.messageBuffer.length === 0) return;

		for (const message of stage.messageBuffer) {
			this.printLineAboveStatusBar(message);
		}
		stage.messageBuffer = [];
	}

	/**
	 * Show the fixed status bar at the bottom
	 */
	private showStatusBar(): void {
		if (this.isMcpMode() || this.statusBarVisible) return;

		this.statusBarVisible = true;
		// Reserve margin + separator + status bar + context insights lines
		// Use \n to create lines (which causes terminal to scroll if needed)
		process.stderr.write('\n'); // margin
		this.drawSeparatorLine(); // separator + \n, cursor on status bar line
		// Reserve both status bar and context insights lines by writing content
		// Writing actual characters ensures the terminal allocates these lines
		process.stderr.write(' \n'); // status bar line placeholder
		process.stderr.write(' '); // context insights line placeholder
		// Move back to start of context insights line
		process.stderr.write(`${ANSI.moveToCol(1)}`);
		// Now cursor is on context insights line, draw both lines
		this.drawStatusBarOnly(); // draws status (moves up) and context (stays on context line)

		// Start status bar update interval
		// Use unref() to allow process to exit even if interval is active
		this.statusBarInterval = setInterval(() => {
			this.spinnerFrame++;
			this.drawStatusBar();
		}, 80);
		this.statusBarInterval.unref();
	}

	/**
	 * Hide the status bar
	 */
	private hideStatusBar(): void {
		if (!this.statusBarVisible) return;

		if (this.statusBarInterval) {
			clearInterval(this.statusBarInterval);
			this.statusBarInterval = null;
		}

		// Move to start of margin line and clear all 4 lines (margin + separator + status bar + context insights)
		process.stderr.write(`${ANSI.moveToCol(1)}${ANSI.cursorUp(3)}`);
		process.stderr.write(`${ANSI.CLEAR_LINE}`);
		process.stderr.write(`${ANSI.cursorDown(1)}${ANSI.moveToCol(1)}${ANSI.CLEAR_LINE}`);
		process.stderr.write(`${ANSI.cursorDown(1)}${ANSI.moveToCol(1)}${ANSI.CLEAR_LINE}`);
		process.stderr.write(`${ANSI.cursorDown(1)}${ANSI.moveToCol(1)}${ANSI.CLEAR_LINE}`);
		// Move back to where content should continue
		process.stderr.write(`${ANSI.cursorUp(3)}${ANSI.moveToCol(1)}`);
		this.statusBarVisible = false;
	}

	/**
	 * Draw/update the status bar
	 */
	private drawStatusBar(): void {
		this.drawStatusBarOnly();
	}

	/**
	 * Draw only the status bar text (without updating group headers)
	 * Draws 2 lines: status bar (line 1) and context insights (line 2)
	 * Cursor is expected to be on context insights line and remains there after drawing
	 */
	private drawStatusBarOnly(): void {
		if (!this.statusBarVisible || this.isMcpMode()) return;

		const color = getColorAdapter();
		const frame = SPINNER_FRAMES[this.spinnerFrame % SPINNER_FRAMES.length] ?? '⠋';
		const spinnerChar = color.cyan(frame);
		const termWidth = process.stderr.columns || 120;

		const phrase = THINKING_PHRASES[this.phraseIndex % THINKING_PHRASES.length] ?? 'Processing';
		const activity = this.currentActivity || phrase;
		const sessionModeIndicator = this.getSessionModeIndicator();
		const parts = this.buildStatusBarParts();

		let statusText =
			parts.length > 0
				? `${sessionModeIndicator}${spinnerChar} ${color.cyan(activity)} ${color.dim(`| ${parts.join(' | ')}`)}`
				: `${sessionModeIndicator}${spinnerChar} ${color.cyan(activity)}`;

		statusText = truncateToWidth(statusText, termWidth - 1);

		// Build context insights line
		const contextInsights = this.buildContextInsightsLine();
		const contextLine = contextInsights ? truncateToWidth(contextInsights, termWidth - 1) : '';

		// Cursor is on context insights line (line 2)
		// Move up to status bar line (line 1), clear and write status
		process.stderr.write(`${ANSI.cursorUp(1)}${ANSI.moveToCol(1)}${ANSI.CLEAR_LINE}${statusText}`);

		// Move down to context insights line (line 2) using ANSI cursor movement (not \n to avoid scroll)
		// Clear and write context
		process.stderr.write(`${ANSI.cursorDown(1)}${ANSI.moveToCol(1)}${ANSI.CLEAR_LINE}${contextLine}`);
		// Cursor remains on context insights line for consistent positioning
	}

	/**
	 * Build the status bar parts array
	 * Note: Token count and context indicator are shown in the context insights line below
	 */
	private buildStatusBarParts(): string[] {
		const parts: string[] = [];
		const activeStages = Array.from(this.activeParallelStages.values()).filter((s) => s.state === 'active');
		const stageInfo = activeStages.map((s) => s.name).join(', ');
		const elapsed = this.getElapsedSeconds();

		if (this.options.showModel && this.currentModel) {
			parts.push(this.currentModel);
		}
		if (stageInfo) {
			parts.push(stageInfo);
		}
		if (elapsed > 0) {
			parts.push(this.formatElapsedTime(elapsed));
		}

		return parts;
	}

	/**
	 * Build the context insights line showing detailed token usage
	 * Format: Context: 48,880/200,000 tokens (24% used) | In: 29,817 | Out: 19,063 | Remaining: 151,120
	 */
	private buildContextInsightsLine(): string {
		if (!this.contextWindow) {
			const color = getColorAdapter();
			return color.dim('Context: Awaiting token usage data...');
		}

		const color = getColorAdapter();
		const { contextWindowSize, outputTokensTotal, promptTokensUsed, utilizationPercent } = this.contextWindow;
		const remaining = Math.max(0, contextWindowSize - promptTokensUsed);

		// Colour-code the percentage based on utilisation using object lookup
		const percentText = `${utilizationPercent.toFixed(0)}% used`;
		const utilizationLevel = this.getUtilizationLevel(utilizationPercent);
		const utilizationColors = {
			high: color.red,
			normal: color.green,
			warning: color.yellow
		} as const;
		const coloredPercent = utilizationColors[utilizationLevel](percentText);

		// Build parts with dim separators but colored values
		const separator = color.dim(' | ');
		const parts = [
			`${color.dim('Context:')} ${color.cyan(formatNumber(promptTokensUsed))}${color.dim('/')}${color.dim(formatNumber(contextWindowSize))} ${color.dim('tokens')} (${coloredPercent})`,
			`${color.dim('In:')} ${color.cyan(formatNumber(promptTokensUsed))}`,
			`${color.dim('Out:')} ${color.cyan(formatNumber(outputTokensTotal))}`,
			`${color.dim('Remaining:')} ${color.cyan(formatNumber(remaining))}`
		];

		return parts.join(separator);
	}

	/**
	 * Determine utilisation level based on percentage thresholds
	 */
	private getUtilizationLevel(percent: number): 'high' | 'normal' | 'warning' {
		if (percent > HIGH_CONFIDENCE_THRESHOLD) return 'high';
		if (percent > CONTEXT_THRESHOLD_WARNING) return 'warning';
		return 'normal';
	}

	/**
	 * Get the session mode indicator for the status bar
	 * Returns a colored indicator showing whether running live or from session
	 */
	private getSessionModeIndicator(): string {
		if (!this.sessionInfo) {
			return '';
		}

		const color = getColorAdapter();

		if (this.sessionInfo.isResumed) {
			// Session resumed - show "Session" indicator in green
			return `${color.green('⟳')} ${color.dim('Session')} `;
		} else {
			// Fresh session - show "Live" indicator in cyan
			return `${color.cyan('●')} ${color.dim('Live')} `;
		}
	}

	/**
	 * Update the current activity shown in status bar
	 */
	private setActivity(activity: string): void {
		this.currentActivity = activity;
		if (this.statusBarVisible) {
			this.drawStatusBar();
		}
	}

	/**
	 * Handle LLM request - update status bar
	 */
	private handleLLMRequest(event: PipelineEventData): void {
		if (event.model) {
			this.currentModel = event.model;
		}
		this.currentStage = event.stage ?? this.currentStage;
		this.activeLLMRequests++;
		this.setActivity('Calling LLM');
	}

	/**
	 * Handle LLM response - update token count and context window usage
	 */
	private handleLLMResponse(event: PipelineEventData): void {
		this.activeLLMRequests = Math.max(0, this.activeLLMRequests - 1);

		const stageName = event.stage ?? this.currentStage;
		this.updateStageTokenCount(stageName, event.tokenCount);

		// Update context window usage if we have prompt tokens
		if (event.promptTokens && event.model) {
			this.updateContextWindowUsage(event.model, event.promptTokens, event.outputTokens);
		}

		if (this.activeLLMRequests > 0) {
			this.setActivity('Processing');
		}
	}

	/**
	 * Update context window usage tracking
	 */
	private updateContextWindowUsage(model: string, promptTokens: number, outputTokens?: number): void {
		const contextWindowSize = getModelContextWindow(model);
		const utilizationPercent = Math.min(100, (promptTokens / contextWindowSize) * 100);

		// Accumulate output tokens across calls
		const previousOutputTokens = this.contextWindow?.outputTokensTotal ?? 0;
		const newOutputTokens = previousOutputTokens + (outputTokens ?? 0);

		this.contextWindow = {
			contextWindowSize,
			model,
			outputTokensTotal: newOutputTokens,
			promptTokensUsed: promptTokens,
			utilizationPercent: Math.round(utilizationPercent * 10) / 10
		};
	}

	/**
	 * Update token count for a stage
	 */
	private updateStageTokenCount(stageName: null | string | undefined, tokenCount?: number): void {
		if (!stageName || !tokenCount) return;

		const stage = this.activeParallelStages.get(stageName);
		if (stage) {
			stage.tokenCount += tokenCount;
		}
	}

	/**
	 * Handle stage complete - update state and clean up
	 */
	private handleStageComplete(event: PipelineEventData): void {
		const stageName = event.stage;

		if (stageName && this.activeParallelStages.has(stageName)) {
			const stageGroup = this.activeParallelStages.get(stageName);

			if (stageGroup) {
				// Update state to success
				stageGroup.state = 'success';

				// For parallel stages with buffered messages, print them as a complete block
				if (stageGroup.isParallel && stageGroup.messageBuffer.length > 0) {
					// Print stage header for the completed block
					const color = getColorAdapter();
					const executionMode = stageGroup.isParallel ? 'Parallel' : 'Sequential';
					const worktreeSuffix = stageGroup.worktreeInfo ? color.dim(` [${stageGroup.worktreeInfo.branch}]`) : '';
					const headerText = `${color.green('✓')} ${stageGroup.name} ${color.dim(`| ${executionMode}`)}${worktreeSuffix}`;
					this.printLineAboveStatusBar(`\n${headerText}`);

					// Flush all buffered messages for this stage
					this.flushStageMessages(stageGroup);
				}

				// Calculate duration
				const duration = ((Date.now() - stageGroup.startTime) / 1000).toFixed(1);
				const tokens = stageGroup.tokenCount > 0 ? `, ${formatNumber(stageGroup.tokenCount)} tokens` : '';

				// Print stage completion summary (indented inside the stage group)
				const color = getColorAdapter();
				const completionMessage = `    ${color.green('✓')} ${color.gray(`Done (${stageGroup.name}, ${duration}s${tokens})`)}`;

				// Print completion above status bar (indented as part of the stage group)
				this.printLineAboveStatusBar(completionMessage);
			}

			// Remove the stage from active stages
			this.activeParallelStages.delete(stageName);

			// If no more active stages, hide status bar
			if (this.activeParallelStages.size === 0) {
				this.hideStatusBar();
			}
		}
	}

	/**
	 * Handle stage error
	 */
	private handleStageError(event: PipelineEventData): void {
		this.stopPhraseRotation();
		const stagePath = event.stage;
		const stageName = stagePath ?? 'Stage';
		const error = event.error ?? 'Unknown error';
		const color = getColorAdapter();

		// Update stage state to error and flush buffered messages
		if (stagePath && this.activeParallelStages.has(stagePath)) {
			const stageGroup = this.activeParallelStages.get(stagePath);
			if (stageGroup) {
				stageGroup.state = 'error';

				// For parallel stages, flush buffered messages first
				if (stageGroup.isParallel && stageGroup.messageBuffer.length > 0) {
					const executionMode = stageGroup.isParallel ? 'Parallel' : 'Sequential';
					const worktreeSuffix = stageGroup.worktreeInfo ? color.dim(` [${stageGroup.worktreeInfo.branch}]`) : '';
					const headerText = `${color.red('✗')} ${stageGroup.name} ${color.dim(`| ${executionMode}`)}${worktreeSuffix}`;
					this.printLineAboveStatusBar(`\n${headerText}`);
					this.flushStageMessages(stageGroup);
				}
			}
		}

		const indent = this.getIndent();
		const errorMessage = `${indent}    ${color.red('✗')} ${color.red(`${stageName} failed: ${error}`)}`;
		this.printLineAboveStatusBar(errorMessage);
	}

	/**
	 * Handle pipeline complete
	 */
	private handlePipelineComplete(): void {
		this.stopPhraseRotation();
		// End any remaining stage group
		if (this.groupDepth > 0) {
			this.endGroup();
		}
		this.reset();
	}

	/**
	 * Handle pipeline error
	 */
	private handlePipelineError(event: PipelineEventData): void {
		this.stopPhraseRotation();
		const color = getColorAdapter();
		const indent = this.getIndent();
		const isFirstChild = this.isFirstChildMessage();

		this.printAboveStatusBar(
			`${indent}${color.red('✗')} ${color.red(`Pipeline failed: ${event.error ?? 'Unknown error'}`)}`,
			isFirstChild
		);
		this.reset();
	}

	/**
	 * Stop phrase rotation
	 */
	private stopPhraseRotation(): void {
		if (this.phraseInterval) {
			clearInterval(this.phraseInterval);
			this.phraseInterval = null;
		}
	}

	/**
	 * Get elapsed seconds since start
	 */
	private getElapsedSeconds(): number {
		if (!this.startTime) return 0;
		return Math.floor((Date.now() - this.startTime) / 1000);
	}

	/**
	 * Format elapsed time as "1h 5m 30s" or "5m 30s" or "30s"
	 */
	private formatElapsedTime(totalSeconds: number): string {
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		const parts: string[] = [];
		if (hours > 0) {
			parts.push(`${hours}h`);
		}
		if (minutes > 0 || hours > 0) {
			parts.push(`${minutes}m`);
		}
		parts.push(`${seconds}s`);

		return parts.join(' ');
	}

	/**
	 * Reset internal state
	 */
	private reset(): void {
		this.contextWindow = null;
		this.currentModel = null;
		this.currentStage = null;
		this.currentActivity = '';
		this.startTime = null;
		this.phraseIndex = 0;
		this.spinnerFrame = 0;
		this.activeParallelStages.clear();
		this.activeLLMRequests = 0;
		this.sessionInfo = null;
		this.hideStatusBar();
	}

	/**
	 * Enable or disable feedback
	 */
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		if (!enabled) {
			this.stop();
		}
	}

	/**
	 * Check if feedback is enabled
	 */
	isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Check if spinner is currently active
	 */
	isSpinnerActive(): boolean {
		return this.statusBarVisible;
	}

	/**
	 * Check if currently inside a group (stage)
	 */
	private isInsideGroup(): boolean {
		return this.activeParallelStages.size > 0;
	}

	/**
	 * Get indent string - only indent if inside a group
	 */
	private getIndent(): string {
		return this.isInsideGroup() ? '  ' : '';
	}

	/**
	 * Get the current active stage (most recently started)
	 */
	private getCurrentActiveStage(): null | StageGroup {
		if (!this.currentStage) return null;
		return this.activeParallelStages.get(this.currentStage) ?? null;
	}

	/**
	 * Check if this is the first child message for a stage
	 * and increment the child count.
	 * In parallel execution, the stagePath should be provided to track correctly.
	 */
	private isFirstChildMessage(stagePath?: string): boolean {
		let stage: null | StageGroup = null;

		// Try to find the stage by the provided path first (for parallel execution)
		if (stagePath) {
			stage = this.activeParallelStages.get(stagePath) ?? null;

			// If no exact match, try to find a stage that ends with the short name
			if (!stage) {
				const shortName = stagePath.includes('.') ? stagePath.split('.').pop() : stagePath;
				for (const [, value] of this.activeParallelStages) {
					if (value.name === shortName) {
						stage = value;
						break;
					}
				}
			}
		}

		// Fall back to current stage if no match found
		stage ??= this.getCurrentActiveStage();

		if (!stage) return false;

		const isFirst = stage.childCount === 0;
		stage.childCount++;
		return isFirst;
	}

	/**
	 * Show a status message - updates the status bar activity
	 */
	showStatus(message: string): void {
		if (!this.enabled) return;
		if (this.isMcpMode()) return;

		// Update status bar with current activity
		this.setActivity(message);
	}

	/**
	 * Show an info message (gray indicator, white text, dim metadata)
	 */
	showInfo(message: string, data?: Record<string, unknown>): void {
		if (!this.enabled) return;
		if (this.isMcpMode()) return;

		const color = getColorAdapter();
		const details = this.formatDataDetails(data);
		const indent = this.getIndent();
		const stagePath = data?.['stage'] as string | undefined;
		const isFirstChild = this.isFirstChildMessage(stagePath);

		this.printAboveStatusBar(
			`${indent}${color.gray('●')} ${message}${details ? ` ${color.dim(`(${details})`)}` : ''}`,
			isFirstChild,
			stagePath
		);
		// Update activity without triggering a redraw (printAboveStatusBar already redraws)
		this.currentActivity = message;
	}

	/**
	 * Show a warning message (yellow indicator, white text, dim metadata)
	 */
	showWarn(message: string, data?: Record<string, unknown>): void {
		if (!this.enabled) return;
		if (this.isMcpMode()) return;

		const color = getColorAdapter();
		const details = this.formatDataDetails(data);
		const indent = this.getIndent();
		const stagePath = data?.['stage'] as string | undefined;
		const isFirstChild = this.isFirstChildMessage(stagePath);

		this.printAboveStatusBar(
			`${indent}${color.yellow('⚠')} ${message}${details ? ` ${color.dim(`(${details})`)}` : ''}`,
			isFirstChild,
			stagePath
		);
	}

	/**
	 * Show an error message (red indicator, red text, dim context)
	 */
	showError(message: string, data?: Record<string, unknown>): void {
		if (!this.enabled) return;
		if (this.isMcpMode()) return;

		const color = getColorAdapter();
		const details = this.formatDataDetails(data);
		const indent = this.getIndent();
		const stagePath = data?.['stage'] as string | undefined;
		const isFirstChild = this.isFirstChildMessage(stagePath);

		this.printAboveStatusBar(
			`${indent}${color.red('✗')} ${color.red(message)}${details ? ` ${color.dim(`(${details})`)}` : ''}`,
			isFirstChild,
			stagePath
		);
	}

	/**
	 * Show a success message (green indicator, grey text)
	 */
	showSuccess(message: string): void {
		if (!this.enabled) return;
		if (this.isMcpMode()) return;

		const color = getColorAdapter();
		const indent = this.getIndent();
		const isFirstChild = this.isFirstChildMessage();

		this.printAboveStatusBar(`${indent}${color.green('✓')} ${color.gray(message)}`, isFirstChild);
	}

	/**
	 * Show a completed/done message (grey text)
	 */
	showDone(message: string): void {
		if (!this.enabled) return;
		if (this.isMcpMode()) return;

		const color = getColorAdapter();
		const indent = this.getIndent();
		const isFirstChild = this.isFirstChildMessage();

		this.printAboveStatusBar(`${indent}${color.dim(message)}`, isFirstChild);
	}

	/**
	 * Show an action being performed (white indicator, grey text)
	 */
	showAction(action: string, target?: string): void {
		if (!this.enabled) return;
		if (this.isMcpMode()) return;

		const color = getColorAdapter();
		const message = target ? `${action}: ${target}` : action;
		const indent = this.getIndent();
		const isFirstChild = this.isFirstChildMessage();

		this.printAboveStatusBar(`${indent}${color.gray('●')} ${message}`, isFirstChild);
		// Update activity without triggering a redraw (printAboveStatusBar already redraws)
		this.currentActivity = action;
	}

	/**
	 * Start a new message group (e.g., for a pipeline or stage)
	 */
	startGroup(name: string): void {
		if (!this.enabled) return;
		if (this.isMcpMode()) return;

		const color = getColorAdapter();

		// End any existing group at the same level
		if (this.currentGroup && this.groupDepth > 0) {
			// Don't print anything, just reset
		}

		this.currentGroup = name;
		this.groupDepth = 1;

		// Print group header
		process.stderr.write(`\n${color.bold(color.cyan(`▸ ${name}`))}\n`);
	}

	/**
	 * End the current message group
	 */
	endGroup(): void {
		if (this.groupDepth > 0) {
			this.groupDepth--;
		}
		if (this.groupDepth === 0) {
			this.currentGroup = null;
		}
	}

	/**
	 * Priority fields to show in data details (in order of preference)
	 */
	private static readonly PRIORITY_FIELDS = [
		'sessionId',
		'agent',
		'selectedAgent',
		'command',
		'stage',
		'model',
		'confidence',
		'stageCount',
		'toolNames',
		'toolCount',
		'duration',
		'tokenCount',
		'error',
		'reason',
		'path',
		'file',
		'status'
	];

	/**
	 * Format data details for display
	 * Extracts the most relevant fields from the data object
	 */
	private formatDataDetails(data?: Record<string, unknown>): string {
		if (!data || Object.keys(data).length === 0) {
			return '';
		}

		const details = this.extractPriorityFields(data);

		if (details.length === 0) {
			return this.extractFallbackFields(data).join(', ');
		}

		return details.join(', ');
	}

	/**
	 * Extract formatted values for priority fields
	 */
	private extractPriorityFields(data: Record<string, unknown>): string[] {
		const details: string[] = [];

		for (const field of ProcessingFeedback.PRIORITY_FIELDS) {
			if (details.length >= 3) break;

			const value = data[field];
			if (value === undefined || value === null) continue;

			const formattedValue = this.formatValue(field, value);
			if (formattedValue) {
				details.push(formattedValue);
			}
		}

		return details;
	}

	/**
	 * Extract formatted values for non-priority fields as fallback
	 */
	private extractFallbackFields(data: Record<string, unknown>): string[] {
		const details: string[] = [];

		for (const [key, value] of Object.entries(data)) {
			if (details.length >= 2) break;

			if (typeof value === 'object' || value === undefined || value === null) continue;

			const formattedValue = this.formatValue(key, value);
			if (formattedValue) {
				details.push(formattedValue);
			}
		}

		return details;
	}

	/**
	 * Format a single value for display
	 */
	private formatValue(key: string, value: unknown): string {
		if (value === undefined || value === null) {
			return '';
		}

		const formatters: Record<string, (v: unknown) => string> = {
			agent: (v) => `agent: ${v}`,
			command: (v) => `cmd: ${v}`,
			confidence: (v) => `confidence: ${(Number(v) * 100).toFixed(0)}%`,
			duration: (v) => `${(Number(v) / 1000).toFixed(1)}s`,
			error: (v) => String(v),
			model: (v) => `model: ${v}`,
			reason: (v) => String(v),
			selectedAgent: (v) => `agent: ${v}`,
			sessionId: (v) => `session: ${String(v).slice(0, 12)}`,
			stage: (v) => `stage: ${v}`,
			stageCount: (v) => `${v} stages`,
			tokenCount: (v) => `${v} tokens`,
			toolCount: (v) => `${v} tools`,
			toolNames: (v) => this.formatToolsList(v),
			tools: (v) => this.formatToolsList(v)
		};

		const formatter = formatters[key];
		if (formatter) {
			return formatter(value);
		}

		// Default: show key: value, truncating if needed
		const strValue = String(value);
		if (strValue.length <= 30) {
			return `${key}: ${strValue}`;
		}
		return `${key}: ${strValue.slice(0, 27)}...`;
	}

	/**
	 * Format a list of tool names, truncating to MAX_TOOLS_LIST_LENGTH characters
	 */
	private formatToolsList(value: unknown): string {
		if (!Array.isArray(value)) {
			return '';
		}

		const tools = value as string[];
		if (tools.length === 0) {
			return '';
		}

		// Build truncated list
		let result = '';
		let includedCount = 0;

		for (const tool of tools) {
			const separator = result ? ', ' : '';
			const nextPart = separator + tool;

			// Check if adding this tool would exceed the limit
			if (result.length + nextPart.length + '...'.length > MAX_TOOLS_LIST_LENGTH && includedCount > 0) {
				result += '...';
				break;
			}

			result += nextPart;
			includedCount++;
		}

		return result;
	}

	/**
	 * Check if running in MCP mode
	 */
	private isMcpMode(): boolean {
		return process.env['AI_MCP_ENABLED'] === 'true';
	}

	/**
	 * Show MCP availability status
	 * Displays a summary of available and unavailable MCP servers
	 */
	showMCPStatus(
		results: Array<{
			error?: string;
			name: string;
			riskLevel?: string;
			serverId: string;
			status: 'connection_failed' | 'disabled' | 'not_configured' | 'not_installed' | 'ready';
			toolCount?: number;
		}>
	): void {
		if (!this.enabled || results.length === 0) return;
		if (this.isMcpMode()) return;

		const color = getColorAdapter();

		// Group by status
		const ready = results.filter((r) => r.status === 'ready');
		const unavailable = results.filter((r) => r.status !== 'ready');

		// Print header
		process.stderr.write(`\n${color.bold(color.cyan('External MCP Status'))}\n`);

		// Print ready servers
		for (const result of ready) {
			const tools = result.toolCount !== undefined ? ` (${result.toolCount} tools)` : '';
			const risk = result.riskLevel ? color.dim(` [${result.riskLevel}]`) : '';
			process.stderr.write(`  ${color.green('✓')} ${result.name}${tools}${risk}\n`);
		}

		// Print unavailable servers
		for (const result of unavailable) {
			const reason = this.getMCPStatusReason(result.status, result.error);
			process.stderr.write(`  ${color.yellow('○')} ${result.name}: ${color.dim(reason)}\n`);
		}

		// Print summary
		if (ready.length > 0 && unavailable.length > 0) {
			process.stderr.write(`  ${color.dim(`${ready.length} ready, ${unavailable.length} unavailable`)}\n`);
		}

		process.stderr.write('\n');
	}

	/**
	 * Get human-readable reason for MCP status
	 */
	private getMCPStatusReason(
		status: 'connection_failed' | 'disabled' | 'not_configured' | 'not_installed' | 'ready',
		error?: string
	): string {
		switch (status) {
			case 'connection_failed':
				return error ?? 'connection failed';
			case 'disabled':
				return 'disabled';
			case 'not_configured':
				return error ?? 'not configured';
			case 'not_installed':
				return 'not installed';
			case 'ready':
				return 'ready';
			default:
				return 'unknown';
		}
	}

	/**
	 * Show MCP tool call result
	 */
	showMCPToolCall(serverId: string, toolName: string, success: boolean, durationMs?: number): void {
		if (!this.enabled) return;
		if (this.isMcpMode()) return;

		const color = getColorAdapter();
		const icon = success ? color.green('✓') : color.red('✗');
		const duration = durationMs !== undefined ? ` ${color.dim(`(${durationMs}ms)`)}` : '';
		const indent = this.getIndent();
		const isFirstChild = this.isFirstChildMessage();

		this.printAboveStatusBar(`${indent}${icon} ${color.cyan('MCP')} ${serverId}.${toolName}${duration}`, isFirstChild);
	}
}

// Singleton instance
let feedbackInstance: null | ProcessingFeedback = null;

/**
 * Get the singleton processing feedback instance
 */
export function getProcessingFeedback(): ProcessingFeedback {
	feedbackInstance ??= new ProcessingFeedback();
	return feedbackInstance;
}

/**
 * Set a custom processing feedback instance
 */
export function setProcessingFeedback(feedback: ProcessingFeedback): void {
	feedbackInstance = feedback;
}
