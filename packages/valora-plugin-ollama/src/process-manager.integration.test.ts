// tests/integration/plugins/ollama-process-manager.test.ts
import { exec } from 'child_process';
import { promisify } from 'util';

import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OllamaProcessManagerImpl } from './process-manager.js';

const execAsync = promisify(exec);

async function isDockerAvailable(): Promise<boolean> {
	try {
		await execAsync('docker --version');
		return true;
	} catch {
		return false;
	}
}

const dockerAvailable = await isDockerAvailable();

describe.skipIf(!dockerAvailable)('OllamaProcessManagerImpl (integration)', () => {
	let container: StartedTestContainer;
	let baseUrl: string;
	let manager: OllamaProcessManagerImpl;

	beforeAll(async () => {
		container = await new GenericContainer('ollama/ollama')
			.withExposedPorts(11434)
			.withWaitStrategy(Wait.forHttp('/api/tags', 11434).withStartupTimeout(120_000))
			.withStartupTimeout(120_000)
			.start();

		baseUrl = `http://${container.getHost()}:${container.getMappedPort(11434)}`;
		manager = new OllamaProcessManagerImpl();
	}, 130_000);

	afterAll(async () => {
		await container?.stop();
	}, 30_000);

	it('isRunning returns true when Ollama server is accessible', async () => {
		const result = await manager.isRunning(baseUrl);
		expect(result).toBe(true);
	});

	it('isRunning returns false for a non-existent endpoint', async () => {
		const result = await manager.isRunning('http://localhost:19999');
		expect(result).toBe(false);
	});

	it('stop() resolves cleanly even when no process was spawned by the manager', async () => {
		const freshManager = new OllamaProcessManagerImpl();
		await expect(freshManager.stop()).resolves.toBeUndefined();
	});
});
