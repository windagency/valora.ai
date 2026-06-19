import rootConfig from '../../eslint.config.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Filter out the root config's test-file ignore so ESLint can reach src/*.test.ts.
const baseConfig = rootConfig.filter(
	(cfg) => !(Array.isArray(cfg.ignores) && !('files' in cfg) && cfg.ignores.includes('**/*.test.ts'))
);

export default [
	...baseConfig,
	{
		ignores: ['**/*.spec.ts', '**/*.config.ts', '**/*.config.cjs', '**/*.config.js', '**/*.config.mjs']
	},
	{
		files: ['src/**/*.ts', '!src/**/*.test.ts'],
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
	},
	{
		files: ['src/**/*.test.ts'],
		languageOptions: {
			parserOptions: {
				project: './tsconfig.test.json',
				tsconfigRootDir: __dirname
			}
		},
		settings: {
			'import/resolver': {
				typescript: {
					alwaysTryTypes: true,
					project: path.resolve(__dirname, 'tsconfig.test.json')
				}
			}
		}
	}
];
