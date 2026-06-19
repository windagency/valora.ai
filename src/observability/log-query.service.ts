import type { LogEntry, LogQuery } from './observability.types';
import type { WorktreeLogBuffer } from './worktree-log-buffer';

export class LogQueryService {
	constructor(private readonly buffer: WorktreeLogBuffer) {}

	query(q: Partial<LogQuery>): LogEntry[] {
		const limit = q.limit ?? 100;
		let entries = this.buffer.all();

		if (q.level !== undefined) {
			entries = entries.filter((e) => e.level === q.level);
		}
		if (q.service !== undefined) {
			entries = entries.filter((e) => e.service === q.service);
		}
		if (q.pattern !== undefined) {
			const lower = q.pattern.toLowerCase();
			entries = entries.filter((e) => e.message.toLowerCase().includes(lower));
		}
		if (q.sinceMs !== undefined) {
			entries = entries.filter((e) => e.timestampMs >= q.sinceMs!);
		}
		if (q.untilMs !== undefined) {
			entries = entries.filter((e) => e.timestampMs <= q.untilMs!);
		}

		return entries.slice(0, limit);
	}
}
