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

		const baseConfig = getConfig();
		const config = AUDIT_CONFIG_SCHEMA.parse({
			...baseConfig,
			...(getFlag('depth') !== undefined && { depth: parseInt(getFlag('depth')!, 10) }),
			...(getFlag('threshold') !== undefined && {
				threshold: parseInt(getFlag('threshold')!, 10)
			}),
			...(getFlag('exclude') !== undefined && { exclude: getFlag('exclude')!.split(',') }),
			...(getFlag('concerns') !== undefined && { concerns: getFlag('concerns')!.split(',') })
		});

		try {
			const report = await scan(path.resolve(rootArg), config);
			const json = JSON.stringify(report, null, 2);
			const outputPath = getFlag('output');

			if (outputPath) {
				fs.writeFileSync(path.resolve(outputPath), json, 'utf-8');
				api.logger.info('Audit report written', { path: outputPath });
			} else {
				process.stdout.write(json + '\n');
			}

			process.exit(report.summary.totalViolations > 0 ? 1 : 0);
		} catch (e) {
			api.logger.error('Audit scan failed', e instanceof Error ? e : new Error(String(e)));
			process.exit(2);
		}
	});
}
