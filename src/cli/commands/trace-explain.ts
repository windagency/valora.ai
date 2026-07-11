import * as fs from 'fs';
import * as path from 'path';

import type { CommandAdapter } from 'cli/command-adapter.interface';
import type { TraceEvent } from 'observability/observability.types';

import { ReasoningTraceRecorder } from 'observability/reasoning-trace-recorder';
import { getColorAdapter } from 'output/color-adapter.interface';
import { InputValidator } from 'utils/input-validator';
import { getRuntimeDataDir } from 'utils/paths';

export function configureTraceCommand(program: CommandAdapter): void {
	const color = getColorAdapter();
	const trace = program.command('trace').description('Inspect and verify forensic reasoning traces');

	trace
		.command('explain <session-id> <stage>')
		.description('Display a human-readable trace for a specific session and stage')
		.action((...rawArgs: Array<Record<string, unknown>>) => {
			const sessionId = rawArgs[0] as unknown as string;
			const stage = rawArgs[1] as unknown as string;
			let traceFile: string;
			try {
				traceFile = resolveTraceFile(sessionId, stage);
			} catch (error) {
				console.error(color.red('Invalid session-id/stage:'), (error as Error).message);
				process.exit(1);
				return;
			}

			if (!fs.existsSync(traceFile)) {
				console.error(color.red(`Trace file not found: ${traceFile}`));
				process.exit(1);
			}

			const lines = fs
				.readFileSync(traceFile, 'utf-8')
				.trim()
				.split('\n')
				.filter((l) => l.trim().length > 0);

			if (lines.length === 0) {
				console.log(color.yellow('Trace is empty.'));
				return;
			}

			console.log(color.bold(`Trace: ${sessionId} / ${stage}`));
			console.log(color.gray(`File: ${traceFile}`));
			console.log('');

			for (const line of lines) {
				let event: TraceEvent;
				try {
					event = JSON.parse(line) as TraceEvent;
				} catch {
					console.log(color.red(`  [UNPARSEABLE LINE] ${line.slice(0, 80)}`));
					continue;
				}
				printEvent(event, color);
			}
		});

	trace
		.command('verify <session-id> <stage>')
		.description('Verify chain integrity of a trace (detects tampering)')
		.action((...rawArgs: Array<Record<string, unknown>>) => {
			const sessionId = rawArgs[0] as unknown as string;
			const stage = rawArgs[1] as unknown as string;
			let traceFile: string;
			try {
				traceFile = resolveTraceFile(sessionId, stage);
			} catch (error) {
				console.error(color.red('Invalid session-id/stage:'), (error as Error).message);
				process.exit(1);
				return;
			}
			const result = ReasoningTraceRecorder.verify(traceFile);

			if (result.valid) {
				console.log(color.green(`✓ Trace valid — ${result.eventCount} event(s), chain intact`));
			} else {
				console.error(
					color.red(
						`✗ Trace integrity failure at line ${result.firstInvalidLine ?? '?'} (${result.eventCount} events verified before failure)`
					)
				);
				process.exit(1);
			}
		});
}

export function resolveTraceFile(sessionId: string, stage: string): string {
	// Both segments previously reached this path join unvalidated — a
	// traversal-shaped session-id or stage escaped getRuntimeDataDir()/traces/
	// entirely, reachable from a single `valora trace explain/verify` call
	// with no CommandGuard involvement at all (base command is `valora`, not
	// a shell command). validateSessionId's charset (no `/`, no `..`) rejects
	// both cases identically — reused here rather than inventing a second,
	// narrower "stage" validator for a structurally identical constraint.
	InputValidator.validateSessionId(sessionId);
	InputValidator.validateSessionId(stage);
	return path.join(getRuntimeDataDir(), 'traces', sessionId, `${stage}.jsonl`);
}

function printEvent(event: TraceEvent, color: ReturnType<typeof getColorAdapter>): void {
	const kindColor: Record<string, (s: string) => string> = {
		llm_request: color.cyan,
		llm_response: color.green,
		stage_complete: color.bold,
		tool_call: color.yellow,
		tool_result: color.gray
	};
	const fmt = kindColor[event.kind] ?? ((s: string) => s);

	const ts = new Date(event.timestamp).toLocaleTimeString();
	console.log(`  #${event.sequenceNumber} ${fmt(event.kind.padEnd(14))} ${color.gray(ts)}`);

	for (const [k, v] of Object.entries(event.payload)) {
		if (v === null || v === undefined) continue;
		const display = typeof v === 'string' ? v : JSON.stringify(v);
		console.log(`      ${color.gray(k + ':')} ${display}`);
	}
	console.log('');
}
