import rootConfig from '../../eslint.config.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// This package contains only TypeScript test files.
// Filter out the root config's global test-file ignore so ESLint can reach src/*.test.ts.
// Restore the other config-file ignores individually (without *.test.ts) so this
// file is never self-linted (which would cause the import resolver to rewrite the
// relative path above as an npm package path).
const baseConfig = rootConfig.filter(
	(cfg) => !(Array.isArray(cfg.ignores) && !('files' in cfg) && cfg.ignores.includes('**/*.test.ts'))
);

export default [
	...baseConfig,
	{
		ignores: ['**/*.spec.ts', '**/*.config.ts', '**/*.config.cjs', '**/*.config.js', '**/*.config.mjs']
	},
	{
		files: ['src/**/*.test.ts'],
		languageOptions: {
			parserOptions: {
				project: './tsconfig.json',
				tsconfigRootDir: __dirname
			}
		},
		settings: {
			'import/resolver': {
				typescript: {
					alwaysTryTypes: true,
					project: path.resolve(__dirname, 'tsconfig.json')
				}
			}
		}
	}
];
