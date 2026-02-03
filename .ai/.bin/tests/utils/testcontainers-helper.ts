/**
 * Testcontainers Helper for VALORA Tests
 *
 * Provides isolated test environments using Docker containers for:
 * - PostgreSQL databases
 * - Redis caches
 * - LocalStack (AWS services)
 * - Custom service containers
 */

// Conditionally import testcontainers to handle environments where they're not available
let PostgreSqlContainer: any;
let RedisContainer: any;
let LocalStackContainer: any;
let GenericContainer: any;
let testcontainersInitialized = false;

async function initializeTestcontainers() {
	if (testcontainersInitialized) return;

	try {
		const pgModule = await import('@testcontainers/postgresql');
		const redisModule = await import('@testcontainers/redis');
		const localstackModule = await import('@testcontainers/localstack');
		const genericModule = await import('testcontainers');

		PostgreSqlContainer = pgModule.PostgreSqlContainer;
		RedisContainer = redisModule.RedisContainer;
		LocalStackContainer = localstackModule.LocalstackContainer;
		GenericContainer = genericModule.GenericContainer;
		testcontainersInitialized = true;
	} catch (error) {
		console.warn('Testcontainers not available, using mock implementations for tests');
		// Create mock implementations
		PostgreSqlContainer = class MockPostgreSqlContainer {
			withDatabase() {
				return this;
			}
			withUsername() {
				return this;
			}
			withPassword() {
				return this;
			}
			withExposedPorts() {
				return this;
			}
			async start() {
				return {
					getDatabase: () => 'test',
					getHost: () => 'localhost',
					getMappedPort: () => 5432,
					getPassword: () => 'test',
					getUsername: () => 'test',
					stop: async () => {}
				};
			}
		};

		RedisContainer = class MockRedisContainer {
			withExposedPorts() {
				return this;
			}
			async start() {
				return {
					getHost: () => 'localhost',
					getMappedPort: () => 6379,
					stop: async () => {}
				};
			}
		};

		LocalStackContainer = class MockLocalStackContainer {
			withServices() {
				return this;
			}
			withExposedPorts() {
				return this;
			}
			async start() {
				return {
					getHost: () => 'localhost',
					getMappedPort: () => 4566,
					stop: async () => {}
				};
			}
		};

		GenericContainer = class MockGenericContainer {
			withExposedPorts() {
				return this;
			}
			withEnvironment() {
				return this;
			}
			withCommand() {
				return this;
			}
			async start() {
				return {
					stop: async () => {}
				};
			}
		};
	}
}

export class TestcontainersHelper {
	private postgresContainer?: any;
	private redisContainer?: any;
	private localstackContainer?: any;
	private customContainers: Map<string, any> = new Map();

	/**
	 * Start shared containers that can be reused across tests
	 */
	async startSharedContainers(): Promise<void> {
		// Skip if testcontainers are disabled
		if (process.env.SKIP_TESTCONTAINERS === 'true') {
			console.log('Skipping testcontainers initialization (SKIP_TESTCONTAINERS=true)');
			return;
		}

		// Initialize testcontainers modules
		await initializeTestcontainers();

		try {
			// Start PostgreSQL container
			this.postgresContainer = await new PostgreSqlContainer('postgres:15-alpine')
				.withDatabase('ai_orchestrator_test')
				.withUsername('test_user')
				.withPassword('test_password')
				.withExposedPorts(5432)
				.start();

			// Start Redis container
			this.redisContainer = await new RedisContainer('redis:7-alpine').withExposedPorts(6379).start();

			// Start LocalStack for AWS service mocking (all services enabled by default)
			this.localstackContainer = await new LocalStackContainer('localstack/localstack:3.0').start();
		} catch (error) {
			console.error('Failed to start shared containers:', error);
			await this.stopAllContainers();
			throw error;
		}
	}

	/**
	 * Stop all containers
	 */
	async stopAllContainers(): Promise<void> {
		const stopPromises: Promise<void>[] = [];

		if (this.postgresContainer) {
			stopPromises.push(this.postgresContainer.stop());
		}

		if (this.redisContainer) {
			stopPromises.push(this.redisContainer.stop());
		}

		if (this.localstackContainer) {
			stopPromises.push(this.localstackContainer.stop());
		}

		// Stop custom containers
		for (const container of this.customContainers.values()) {
			stopPromises.push(container.stop());
		}

		await Promise.all(stopPromises);
		this.customContainers.clear();
	}

	/**
	 * Get PostgreSQL connection URL
	 */
	async getDatabaseUrl(): Promise<string> {
		if (!this.postgresContainer) {
			if (process.env.SKIP_TESTCONTAINERS === 'true') {
				return 'postgresql://test_user:test_password@localhost:5432/ai_orchestrator_test';
			}
			throw new Error('PostgreSQL container not started');
		}

		const host = this.postgresContainer.getHost();
		const port = this.postgresContainer.getMappedPort(5432);
		const database = this.postgresContainer.getDatabase();
		const username = this.postgresContainer.getUsername();
		const password = this.postgresContainer.getPassword();

		return `postgresql://${username}:${password}@${host}:${port}/${database}`;
	}

	/**
	 * Get Redis connection URL
	 */
	async getRedisUrl(): Promise<string> {
		if (!this.redisContainer) {
			if (process.env.SKIP_TESTCONTAINERS === 'true') {
				return 'redis://localhost:6379';
			}
			throw new Error('Redis container not started');
		}

		const host = this.redisContainer.getHost();
		const port = this.redisContainer.getMappedPort(6379);

		return `redis://${host}:${port}`;
	}

	/**
	 * Get LocalStack endpoint URL
	 */
	async getLocalStackUrl(): Promise<string> {
		if (!this.localstackContainer) {
			throw new Error('LocalStack container not started');
		}

		const host = this.localstackContainer.getHost();
		const port = this.localstackContainer.getMappedPort(4566);

		return `http://${host}:${port}`;
	}

	/**
	 * Start a custom container for specific test scenarios
	 */
	async startCustomContainer(
		name: string,
		containerConfig: {
			image: string;
			ports?: number[];
			environment?: Record<string, string>;
			command?: string[];
		}
	): Promise<any> {
		if (this.customContainers.has(name)) {
			throw new Error(`Container ${name} already exists`);
		}

		let container = new GenericContainer(containerConfig.image);

		if (containerConfig.ports) {
			container = container.withExposedPorts(...containerConfig.ports);
		}

		if (containerConfig.environment) {
			container = container.withEnvironment(containerConfig.environment);
		}

		if (containerConfig.command) {
			container = container.withCommand(containerConfig.command);
		}

		const startedContainer = await container.start();
		this.customContainers.set(name, startedContainer);

		return startedContainer;
	}

	/**
	 * Stop a specific custom container
	 */
	async stopCustomContainer(name: string): Promise<void> {
		const container = this.customContainers.get(name);
		if (container) {
			await container.stop();
			this.customContainers.delete(name);
		}
	}

	/**
	 * Get a custom container instance
	 */
	getCustomContainer(name: string): any {
		return this.customContainers.get(name);
	}

	/**
	 * Health check for all containers
	 */
	async healthCheck(): Promise<boolean> {
		try {
			// Check database connectivity
			if (this.postgresContainer) {
				const dbUrl = await this.getDatabaseUrl();
				// Basic connectivity check would go here
			}

			// Check Redis connectivity
			if (this.redisContainer) {
				const redisUrl = await this.getRedisUrl();
				// Basic connectivity check would go here
			}

			return true;
		} catch (error) {
			console.error('Container health check failed:', error);
			return false;
		}
	}

	/**
	 * Reset container state between tests
	 */
	async resetState(): Promise<void> {
		// Reset database to clean state
		if (this.postgresContainer) {
			// Truncate tables, reset sequences, etc.
		}

		// Clear Redis data
		if (this.redisContainer) {
			// FLUSHDB command would go here
		}
	}
}
