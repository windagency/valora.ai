import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'plugins/plugin-api.types': path.resolve(__dirname, '../../dist/plugins/plugin-api.types'),
			'types/llm.types': path.resolve(__dirname, '../../dist/types/llm.types')
		}
	},
	test: {
		environment: 'node',
		testTimeout: 30000
	}
});
