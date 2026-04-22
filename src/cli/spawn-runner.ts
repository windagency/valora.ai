import type { ProcessRunner } from 'plugins/plugin-installer.service';

import { spawn } from 'node:child_process';

export const spawnRunner: ProcessRunner = {
	run: (argv: string[], options?: { cwd?: string }): Promise<number> =>
		new Promise((resolve) => {
			const [cmd, ...args] = argv;
			if (!cmd) {
				resolve(1);
				return;
			}
			const child = spawn(cmd, args, { cwd: options?.cwd, stdio: 'inherit' });
			child.on('exit', (code) => resolve(code ?? 1));
			child.on('error', () => resolve(1));
		})
};

export const silentSpawnRunner: ProcessRunner = {
	run: (argv: string[], options?: { cwd?: string }): Promise<number> =>
		new Promise((resolve) => {
			const [cmd, ...args] = argv;
			if (!cmd) {
				resolve(1);
				return;
			}
			const child = spawn(cmd, args, { cwd: options?.cwd, stdio: 'pipe' });
			child.on('exit', (code) => resolve(code ?? 1));
			child.on('error', () => resolve(1));
		})
};
