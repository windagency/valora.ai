import type { LogEntry } from './observability.types';

interface WorktreeLogBufferOptions {
	maxEntries?: number;
}

export class WorktreeLogBuffer {
	public totalPushed = 0;
	private buffer: LogEntry[] = [];
	private readonly maxEntries: number;

	constructor(options: WorktreeLogBufferOptions = {}) {
		this.maxEntries = options.maxEntries ?? 5_000;
	}

	all(): LogEntry[] {
		return [...this.buffer];
	}

	clear(): void {
		this.buffer = [];
		this.totalPushed = 0;
	}

	push(entry: LogEntry): void {
		this.totalPushed++;
		this.buffer.push(entry);
		if (this.buffer.length > this.maxEntries) {
			this.buffer.shift();
		}
	}
}
