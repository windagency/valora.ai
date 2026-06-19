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
			// Within the bundled-vault package, relative parent imports are the
			// natural way to reach sibling subdirectories. The host-wide rule
			// against `../**` patterns exists to prevent host code from
			// reaching across module boundaries; inside a single package the
			// boundary is the package itself.
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
