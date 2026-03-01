/**
 * Base Cleanup Scheduler
 *
 * Abstract base class for cleanup schedulers that provides common
 * lifecycle management (start/stop, schedule updates, timer handling).
 * Subclasses implement the specific cleanup logic.
 */

import { MS_PER_HOUR, MS_PER_MINUTE } from 'config/constants';
import { getLogger, type Logger } from 'output/logger';

/**
 * Base schedule configuration
 */
export interface BaseCleanupSchedule {
	enabled: boolean;
	intervalHours: number;
	startDelayMinutes?: number;
}

/**
 * Abstract base class for cleanup schedulers
 */
export abstract class BaseCleanupScheduler<TSchedule extends BaseCleanupSchedule, TResult> {
	protected intervalId?: NodeJS.Timeout;
	protected isRunning = false;
	protected logger: Logger;
	protected schedule: TSchedule;
	protected readonly schedulerName: string;

	constructor(schedule: TSchedule, schedulerName: string) {
		this.schedule = schedule;
		this.schedulerName = schedulerName;
		this.logger = getLogger();
	}

	/**
	 * Start the cleanup scheduler
	 */
	start(): void {
		if (!this.schedule.enabled) {
			this.logger.info(`${this.schedulerName} disabled`);
			return;
		}

		if (this.isRunning) {
			this.logger.warn(`${this.schedulerName} already running`);
			return;
		}

		this.isRunning = true;

		const intervalMs = this.schedule.intervalHours * MS_PER_HOUR;
		const startDelayMs = (this.schedule.startDelayMinutes ?? 0) * MS_PER_MINUTE;

		this.logger.debug(`Starting ${this.schedulerName}`, {
			intervalHours: this.schedule.intervalHours,
			startDelayMinutes: this.schedule.startDelayMinutes
		});

		// Schedule first run with delay
		// Use unref() to allow process to exit if this is the only thing keeping it alive
		setTimeout(() => {
			void this.runCleanup();
			// Then schedule recurring runs
			this.intervalId = setInterval(() => {
				void this.runCleanup();
			}, intervalMs);
			// Allow process to exit if timer is the only thing keeping it alive
			if (this.intervalId) {
				this.intervalId.unref();
			}
		}, startDelayMs).unref();
	}

	/**
	 * Stop the cleanup scheduler
	 */
	stop(): void {
		if (!this.isRunning) {
			return;
		}

		this.isRunning = false;

		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = undefined;
		}

		this.logger.debug(`${this.schedulerName} stopped`);
	}

	/**
	 * Update cleanup schedule
	 */
	updateSchedule(schedule: Partial<TSchedule>): void {
		const wasRunning = this.isRunning;

		if (wasRunning) {
			this.stop();
		}

		this.schedule = { ...this.schedule, ...schedule };

		if (wasRunning && this.schedule.enabled) {
			this.start();
		}

		this.logger.info(`Updated ${this.schedulerName} schedule`);
		this.logger.debug('New cleanup schedule', { schedule: this.schedule });
	}

	/**
	 * Get current cleanup schedule
	 */
	getSchedule(): TSchedule {
		return { ...this.schedule };
	}

	/**
	 * Check if scheduler is currently running
	 */
	isSchedulerRunning(): boolean {
		return this.isRunning;
	}

	/**
	 * Get next scheduled run time
	 */
	getNextRunTime(): Date | null {
		if (!this.isRunning || !this.intervalId) {
			return null;
		}

		const now = new Date();
		const intervalMs = this.schedule.intervalHours * MS_PER_HOUR;

		return new Date(now.getTime() + intervalMs);
	}

	/**
	 * Run cleanup - implemented by subclasses for their specific cleanup logic
	 */
	protected abstract runCleanup(): Promise<void>;

	/**
	 * Run cleanup immediately (manual trigger)
	 */
	abstract runNow(): Promise<TResult>;
}
