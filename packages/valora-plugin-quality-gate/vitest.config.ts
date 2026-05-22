import path from 'node:path';

import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

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
