import type { PluginAPI } from '@windagency/valora-plugin-api';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { scan } from './scanner.js';
import { AUDIT_CONFIG_SCHEMA } from './scanner.types.js';

export function register(api: PluginAPI): void {
	const getConfig = api.config.extend(AUDIT_CONFIG_SCHEMA);

	api.cli.addSubcommand('audit scan', 'Static cross-sibling duplication scan — outputs JSON, CI-safe', async () => {
		// process.argv: ['node', '<bin>', 'audit', 'scan', ...user-args]
		const userArgs = process.argv.slice(4);
		const rootArg = userArgs.find((a) => !a.startsWith('-')) ?? '.';

		const getFlag = (name: string): string | undefined =>
			userArgs
				.find((a) => a.startsWith(`--${name}=`))
				?.split('=')
				.slice(1)
				.join('=');

		const parseIntFlag = (name: string, raw: string): number => {
			const n = parseInt(raw, 10);
			if (Number.isNaN(n)) throw new Error(`Flag --${name} must be an integer, got: ${raw}`);
			return n;
		};

		const depthFlag = getFlag('depth');
		const thresholdFlag = getFlag('threshold');
		const excludeFlag = getFlag('exclude');
		const concernsFlag = getFlag('concerns');

		// Resolve config, scan, and emit output under one guard so that any
		// failure (invalid flag, unreadable root, write error) maps to a single
		// non-zero exit, and the success path never runs the error handler.
		let exitCode: number;
		try {
			const config = AUDIT_CONFIG_SCHEMA.parse({
				...getConfig(),
				...(depthFlag !== undefined && { depth: parseIntFlag('depth', depthFlag) }),
				...(thresholdFlag !== undefined && { threshold: parseIntFlag('threshold', thresholdFlag) }),
				...(excludeFlag !== undefined && { exclude: excludeFlag.split(',') }),
				...(concernsFlag !== undefined && { concerns: concernsFlag.split(',') })
			});

			const report = await scan(path.resolve(rootArg), config);
			const json = JSON.stringify(report, null, 2);
			const outputPath = getFlag('output');

			if (outputPath) {
				fs.writeFileSync(path.resolve(outputPath), json, 'utf-8');
				api.logger.info('Audit report written', { path: outputPath });
			} else {
				process.stdout.write(json + '\n');
			}

			exitCode = report.summary.totalViolations > 0 ? 1 : 0;
		} catch (e) {
			api.logger.error('Audit scan failed', e instanceof Error ? e : new Error(String(e)));
			exitCode = 2;
		}

		process.exit(exitCode);
	});
}
