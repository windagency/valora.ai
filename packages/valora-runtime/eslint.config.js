import path from 'node:path';
import { fileURLToPath } from 'node:url';

import rootConfig from '../../eslint.config.js';

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
		rules: {
			'no-restricted-imports': 'off'
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
