import rootConfig from '../../eslint.config.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default [
	...rootConfig,
	{
		files: ['src/**/*.{ts,tsx}'],
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
