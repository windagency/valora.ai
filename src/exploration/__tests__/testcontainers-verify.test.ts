/**
 * Simple verification test for testcontainers functionality
 */

import { describe, expect, it } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';

describe('Testcontainers Verification', () => {
	it('should start and stop a PostgreSQL container', async () => {
		const container = await new PostgreSqlContainer('postgres:15-alpine')
			.withDatabase('test_db')
			.withUsername('test_user')
			.withPassword('test_pass')
			.start();

		expect(container).toBeDefined();
		expect(container.getHost()).toBeTruthy(); // Can be 'localhost' or Docker bridge IP
		expect(container.getPort()).toBeGreaterThan(0);
		expect(container.getDatabase()).toBe('test_db');

		await container.stop();
	}, 60000);

	it('should start and stop a Redis container', async () => {
		const container = await new RedisContainer('redis:7-alpine').start();

		expect(container).toBeDefined();
		expect(container.getHost()).toBeTruthy(); // Can be 'localhost' or Docker bridge IP
		expect(container.getPort()).toBeGreaterThan(0);

		await container.stop();
	}, 60000);

	it('should provide correct connection URL for PostgreSQL', async () => {
		const container = await new PostgreSqlContainer('postgres:15-alpine')
			.withDatabase('url_test')
			.withUsername('user1')
			.withPassword('pass1')
			.start();

		const connectionUrl = container.getConnectionUri();
		expect(connectionUrl).toMatch(/^postgres(ql)?:\/\//); // Can be postgres:// or postgresql://
		expect(connectionUrl).toContain('user1');
		expect(connectionUrl).toContain('url_test');

		await container.stop();
	}, 60000);
});
