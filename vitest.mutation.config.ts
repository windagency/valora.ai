import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Vitest configuration for mutation testing.
 * Scoped to unit tests only (src/**\/*.test.ts) for fast feedback.
 * Used by: pnpm test:mutation
 */
export default defineConfig({
	resolve: {
		alias: {
			batch: path.resolve(__dirname, './src/batch'),
			security: path.resolve(__dirname, './src/security'),
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
			types: path.resolve(__dirname, './src/types'),
			ui: path.resolve(__dirname, './src/ui'),
			utils: path.resolve(__dirname, './src/utils')
		}
	},
	test: {
		// Only run co-located unit tests — skip integration, e2e, security, etc.
		include: ['src/**/*.{test,spec}.ts'],
		exclude: [
			'node_modules',
			'dist',
			'coverage',
			// Skip integration tests (they use real file system / containers)
			'src/**/*.integration.test.ts'
		],
		environment: 'node',
		globals: true,
		hookTimeout: 30000,
		setupFiles: ['./tests/utils/setup.ts'],
		testTimeout: 15000,
		pool: 'forks',
		poolOptions: {
			forks: { isolate: true, singleFork: false }
		},
		reporters: ['verbose']
	}
});
