import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'@windagency/valora-plugin-api': path.resolve(__dirname, '../../packages/valora-plugin-api/src/index')
		}
	},
	test: {
		environment: 'node',
		testTimeout: 30000
	}
});
