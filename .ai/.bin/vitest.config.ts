import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
	resolve: {
		alias: {
			cleanup: path.resolve(__dirname, './src/cleanup'),
			cli: path.resolve(__dirname, './src/cli'),
			config: path.resolve(__dirname, './src/config'),
			di: path.resolve(__dirname, './src/di'),
			executor: path.resolve(__dirname, './src/executor'),
			exploration: path.resolve(__dirname, './src/exploration'),
			llm: path.resolve(__dirname, './src/llm'),
			mcp: path.resolve(__dirname, './src/mcp'),
			output: path.resolve(__dirname, './src/output'),
			services: path.resolve(__dirname, './src/services'),
			session: path.resolve(__dirname, './src/session'),
			src: path.resolve(__dirname, './src'),
			tests: path.resolve(__dirname, './src/tests'),
			types: path.resolve(__dirname, './src/types'),
			ui: path.resolve(__dirname, './src/ui'),
			utils: path.resolve(__dirname, './src/utils')
		}
	},
	test: {
		coverage: {
			exclude: [
				'node_modules/',
				'dist/',
				'coverage/',
				'tests/',
				'**/__tests__/',
				'**/*.d.ts',
				'**/*.config.ts',
				'src/cli/index.ts',
				'src/mcp/server.ts'
			],
			reporter: ['text', 'json', 'html', 'lcov'],
			thresholds: {
				global: {
					branches: 70,
					functions: 70,
					lines: 70,
					statements: 70
				}
			}
		},
		environment: 'node',
		exclude: ['node_modules', 'dist', 'coverage'],
		globals: true,
		hookTimeout: 120000, // 2 minutes for architecture tests that need to parse all files
		include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
		// Use threads for better performance, but allow fallback to single thread
		pool: process.env.CI ? 'threads' : 'forks',
		poolOptions: {
			forks: {
				isolate: true,
				singleFork: false
			},
			threads: {
				isolate: true,
				singleThread: false
			}
		},
		reporters: process.env.CI ? ['verbose', 'json'] : ['verbose'],
		setupFiles: ['./tests/utils/setup.ts'],
		testTimeout: 30000
	}
});
