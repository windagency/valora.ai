import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import perfectionist from 'eslint-plugin-perfectionist';
import prettierPlugin from 'eslint-plugin-prettier';
import sortPlugin from 'eslint-plugin-sort';
import sortDestructureKeys from 'eslint-plugin-sort-destructure-keys';
import unusedImports from 'eslint-plugin-unused-imports';

export default [
	js.configs.recommended,
	perfectionist.configs['recommended-natural'],
	{
		ignores: [
			'.pnpm-store/**',
			'coverage/**',
			'dist/**',
			'node_modules/**',
			'tests/**',
			'__tests__/**',
			'**/*.spec.ts',
			'**/*.test.ts',
			'**/*.config.ts',
			'**/*.config.js',
			'**/*.config.mjs'
		]
	},
	// Base config for all files (no type-checking)
	{
		files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
		languageOptions: {
			ecmaVersion: 2022,
			globals: {
				__dirname: 'readonly',
				__filename: 'readonly',
				afterAll: 'readonly',
				beforeAll: 'readonly',
				Buffer: 'readonly',
				clearInterval: 'readonly',
				clearTimeout: 'readonly',
				console: 'readonly',
				global: 'readonly',
				NodeJS: 'readonly',
				process: 'readonly',
				require: 'readonly',
				setInterval: 'readonly',
				setTimeout: 'readonly',
				vi: 'readonly'
			},
			parser: tsparser,
			sourceType: 'module'
		},
		plugins: {
			'@typescript-eslint': tseslint,
			import: importPlugin,
			prettier: prettierPlugin,
			sort: sortPlugin,
			'sort-destructure-keys': sortDestructureKeys,
			'unused-imports': unusedImports
		},
		rules: {
			// ESLint recommended rules
			...js.configs.recommended.rules,

			// Import rules
			'import/first': 'error',
			'import/newline-after-import': 'error',
			'import/no-absolute-path': 'error',
			'import/no-cycle': 'error',
			'import/no-duplicates': 'error',
			'import/no-relative-packages': 'error',
			// 'import/no-relative-parent-imports': 'error',
			'import/no-self-import': 'error',
			'import/no-unresolved': 'error',
			'import/no-useless-path-segments': 'error',

			// ESLint rules
			complexity: ['error', 10],
			// 'no-console': ['warn', { allow: ['warn', 'error'] }],
			'no-console': 'off',
			'no-debugger': 'error',
			'no-duplicate-imports': 'error',
			'no-multiple-empty-lines': [
				'error',
				{
					max: 1,
					maxBOF: 0,
					maxEOF: 0
				}
			],
			'no-return-await': 'off',
			'no-throw-literal': 'off',
			'no-unused-vars': [
				'error',
				{
					args: 'after-used',
					argsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
					vars: 'all',
					varsIgnorePattern: '^_'
				}
			],
			'no-var': 'error',
			'prefer-const': 'error',
			'require-await': 'off',
			'sort-imports': 'off',
			'sort-keys': 'off',
			'sort-vars': 'off',

			// Unused imports rules
			'unused-imports/no-unused-imports': 'error',
			'unused-imports/no-unused-vars': 'off',

			// Perfectionist
			'perfectionist/sort-array-includes': [
				'error',
				{
					customGroups: [],
					groupKind: 'literals-first',
					groups: ['literal', 'spread'],
					ignoreCase: true,
					order: 'asc',
					partitionByNewLine: false,
					specialCharacters: 'keep',
					type: 'natural'
				}
			],
			'perfectionist/sort-classes': [
				'error',
				{
					groups: [
						'index-signature',
						['static-property', 'static-accessor-property'],
						['static-get-method', 'static-set-method'],
						['protected-static-property', 'protected-static-accessor-property'],
						['protected-static-get-method', 'protected-static-set-method'],
						['private-static-property', 'private-static-accessor-property'],
						['private-static-get-method', 'private-static-set-method'],
						'static-block',
						['property', 'accessor-property'],
						['get-method', 'set-method'],
						['protected-property', 'protected-accessor-property'],
						['protected-get-method', 'protected-set-method'],
						['private-property', 'private-accessor-property'],
						['private-get-method', 'private-set-method'],
						'constructor',
						['static-method', 'static-function-property'],
						['protected-static-method', 'protected-static-function-property'],
						['private-static-method', 'private-static-function-property'],
						['method', 'function-property'],
						['protected-method', 'protected-function-property'],
						['private-method', 'private-function-property'],
						'unknown'
					],
					ignoreCase: true,
					newlinesBetween: 'ignore',
					order: 'asc',
					partitionByComment: true,
					partitionByNewLine: false,
					specialCharacters: 'keep',
					type: 'natural'
				}
			],
			'perfectionist/sort-enums': [
				'error',
				{
					forceNumericSort: false,
					ignoreCase: true,
					order: 'asc',
					partitionByComment: true,
					partitionByNewLine: false,
					sortByValue: false,
					specialCharacters: 'keep',
					type: 'natural'
				}
			],
			'perfectionist/sort-exports': [
				'error',
				{
					groupKind: 'mixed',
					ignoreCase: true,
					order: 'asc',
					partitionByComment: true,
					partitionByNewLine: false,
					specialCharacters: 'keep',
					type: 'natural'
				}
			],
			'perfectionist/sort-imports': [
				'error',
				{
					environment: 'node',
					groups: [
						'type',
						['builtin', 'external'],
						'internal-type',
						'internal',
						['parent-type', 'sibling-type', 'index-type'],
						['parent', 'sibling', 'index'],
						'object',
						'unknown'
					],
					ignoreCase: true,
					internalPattern: ['^src/.+'],
					maxLineLength: undefined,
					newlinesBetween: 'always',
					order: 'asc',
					partitionByComment: true,
					partitionByNewLine: false,
					specialCharacters: 'keep',
					type: 'natural'
				}
			],
			'perfectionist/sort-interfaces': [
				'error',
				{
					groupKind: 'mixed',
					groups: [],
					ignoreCase: true,
					newlinesBetween: 'ignore',
					order: 'asc',
					partitionByComment: true,
					partitionByNewLine: false,
					specialCharacters: 'keep',
					type: 'natural'
				}
			],
			'perfectionist/sort-jsx-props': [
				'error',
				{
					groups: [],
					ignoreCase: true,
					order: 'asc',
					specialCharacters: 'keep',
					type: 'natural'
				}
			],
			'perfectionist/sort-named-exports': [
				'error',
				{
					groupKind: 'mixed',
					ignoreCase: true,
					order: 'asc',
					specialCharacters: 'keep',
					type: 'natural'
				}
			],
			'perfectionist/sort-named-imports': [
				'error',
				{
					groupKind: 'mixed',
					ignoreAlias: false,
					ignoreCase: true,
					order: 'asc',
					partitionByComment: true,
					partitionByNewLine: false,
					specialCharacters: 'keep',
					type: 'natural'
				}
			],
			'perfectionist/sort-object-types': [
				'error',
				{
					groups: [],
					ignoreCase: true,
					newlinesBetween: 'ignore',
					order: 'asc',
					partitionByComment: true,
					partitionByNewLine: false,
					specialCharacters: 'keep',
					type: 'natural'
				}
			],
			'perfectionist/sort-objects': [
				'error',
				{
					destructuredObjects: true,
					groups: [],
					ignoreCase: true,
					newlinesBetween: 'ignore',
					objectDeclarations: true,
					order: 'asc',
					partitionByComment: true,
					partitionByNewLine: false,
					specialCharacters: 'keep',
					styledComponents: true,
					type: 'natural'
				}
			],
			'perfectionist/sort-switch-case': [
				'error',
				{
					ignoreCase: true,
					order: 'asc',
					specialCharacters: 'keep',
					type: 'natural'
				}
			],
			'perfectionist/sort-union-types': [
				'error',
				{
					groups: [],
					ignoreCase: true,
					newlinesBetween: 'ignore',
					order: 'asc',
					partitionByComment: true,
					partitionByNewLine: false,
					specialCharacters: 'keep',
					type: 'natural'
				}
			],

			// Prettier rules (via eslint-config-prettier)
			...prettierConfig.rules,

			// Disable formatting rules that Prettier handles
			'prettier/prettier': 'error'
		},
		settings: {
			// Tells eslint how to resolve imports
			'import/resolver': {
				node: {
					extensions: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'],
					paths: ['src']
				}
			},
			perfectionist: {
				partitionByComment: true,
				type: 'line-length'
			}
		}
	},
	// Type-checking rules for source files only
	{
		files: ['src/**/*.{ts,tsx}'],
		languageOptions: {
			parserOptions: {
				ecmaVersion: 2022,
				project: './tsconfig.json',
				sourceType: 'module',
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: {
			// Rules that require type information
			// TypeScript recommended rules
			...tseslint.configs.recommended.rules,

			// @typescript-eslint (non-type-checking rules only)
			'@typescript-eslint/array-type': [
				'error',
				{
					default: 'array-simple'
				}
			],
			'@typescript-eslint/await-thenable': 'error',
			'@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{
					prefer: 'type-imports'
				}
			],
			// Prefer type inference for internal functions, require explicit types for exported functions
			'@typescript-eslint/explicit-function-return-type': [
				'warn',
				{
					allowConciseArrowFunctionExpressionsStartingWithVoid: false,
					allowDirectConstAssertionInArrowFunctions: true,
					allowExpressions: true, // Allow inference for expressions
					allowHigherOrderFunctions: true, // Allow for HOFs like map/filter
					allowTypedFunctionExpressions: true // Allow when type is inferred from context
				}
			],
			// Require explicit return types ONLY for exported functions
			'@typescript-eslint/explicit-module-boundary-types': [
				'error',
				{
					allowArgumentsExplicitlyTypedAsAny: false,
					allowDirectConstAssertionInArrowFunctions: true,
					allowHigherOrderFunctions: true,
					allowTypedFunctionExpressions: true
				}
			],
			'@typescript-eslint/naming-convention': [
				'error',
				{
					format: ['PascalCase'],
					selector: ['class', 'interface', 'typeAlias']
				},
				{
					format: ['camelCase'],
					selector: ['function', 'method']
				},
				{
					format: ['camelCase', 'UPPER_CASE'],
					selector: 'variable'
				},
				{
					format: ['camelCase'],
					leadingUnderscore: 'allow',
					selector: 'parameter'
				}
			],
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-floating-promises': [
				'error',
				{
					ignoreIIFE: false,
					ignoreVoid: true
				}
			],
			'@typescript-eslint/no-misused-promises': [
				'error',
				{
					checksVoidReturn: true
				}
			],
			'@typescript-eslint/no-non-null-assertion': 'off',
			'@typescript-eslint/no-unnecessary-type-assertion': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'error',
			'@typescript-eslint/no-unsafe-call': 'error',
			'@typescript-eslint/no-unsafe-member-access': [
				'error',
				{
					allowOptionalChaining: true
				}
			],
			'@typescript-eslint/no-unsafe-return': 'error',
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/prefer-nullish-coalescing': 'error',
			'@typescript-eslint/prefer-optional-chain': 'error',
			'@typescript-eslint/require-await': 'error',
			'@typescript-eslint/return-await': 'error',
			'@typescript-eslint/strict-boolean-expressions': [
				'off',
				{
					allowNullableObject: false,
					allowNumber: false,
					allowString: false
				}
			]
		}
	}
];
