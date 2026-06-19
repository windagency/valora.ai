import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'@windagency/valora-plugin-api': path.resolve(__dirname, '../../packages/valora-plugin-api/src/index'),
			'types/llm.types': path.resolve(__dirname, '../../dist/types/llm.types')
		}
	},
	test: {
		environment: 'node',
		testTimeout: 30000
	}
});
