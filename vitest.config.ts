import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
	resolve: {
		alias: {
			analysis: path.resolve(__dirname, './src/analysis'),
			ast: path.resolve(__dirname, './src/ast'),
			batch: path.resolve(__dirname, './src/batch'),
			security: path.resolve(__dirname, './src/security'),
			cleanup: path.resolve(__dirname, './src/cleanup'),
			cli: path.resolve(__dirname, './src/cli'),
			config: path.resolve(__dirname, './src/config'),
			di: path.resolve(__dirname, './src/di'),
			executor: path.resolve(__dirname, './src/executor'),
			exploration: path.resolve(__dirname, './src/exploration'),
			llm: path.resolve(__dirname, './src/llm'),
			lsp: path.resolve(__dirname, './src/lsp'),
			mcp: path.resolve(__dirname, './src/mcp'),
			memory: path.resolve(__dirname, './src/memory'),
			output: path.resolve(__dirname, './src/output'),
			plugins: path.resolve(__dirname, './src/plugins'),
			services: path.resolve(__dirname, './src/services'),
			session: path.resolve(__dirname, './src/session'),
			src: path.resolve(__dirname, './src'),
			types: path.resolve(__dirname, './src/types'),
			ui: path.resolve(__dirname, './src/ui'),
			updater: path.resolve(__dirname, './src/updater'),
			utils: path.resolve(__dirname, './src/utils'),
			'@windagency/valora-plugin-compression-python/src/index': path.resolve(
				__dirname,
				'./packages/valora-plugin-compression-python/src/index'
			),
			'@windagency/valora-plugin-compression-typescript/src/index': path.resolve(
				__dirname,
				'./packages/valora-plugin-compression-typescript/src/index'
			),
			'@windagency/valora-plugin-compression-universal/src/index': path.resolve(
				__dirname,
				'./packages/valora-plugin-compression-universal/src/index'
			)
		}
	},
	test: {
		coverage: {
			exclude: [
				'node_modules/',
				'dist/',
				'coverage/',
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
		include: ['src/**/*.{test,spec}.ts', '__tests__/**/*.{test,spec}.ts'],
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
		setupFiles: ['./__tests__/utils/setup.ts'],
		testTimeout: 30000
	}
});
