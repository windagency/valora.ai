import path from 'node:path';

import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export default defineConfig({
	resolve: {
		alias: {
			'@windagency/valora-plugin-api': path.resolve(__dirname, '../../packages/valora-plugin-api/src/index'),
			config: path.resolve(__dirname, '../../src/config'),
			llm: path.resolve(__dirname, '../../src/llm'),
			output: path.resolve(__dirname, '../../src/output'),
			types: path.resolve(__dirname, '../../src/types'),
			utils: path.resolve(__dirname, '../../src/utils')
		}
	},
	test: {
		environment: 'node',
		testTimeout: 30000
	}
});
