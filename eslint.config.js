import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import checkFile from 'eslint-plugin-check-file';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import perfectionist from 'eslint-plugin-perfectionist';
import prettierPlugin from 'eslint-plugin-prettier';
import sortPlugin from 'eslint-plugin-sort';
import sortDestructureKeys from 'eslint-plugin-sort-destructure-keys';
import unusedImports from 'eslint-plugin-unused-imports';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LAYER_ORDER = ['types', 'config', 'repo', 'services', 'runtime', 'ui'];

const importLayerRemedyRule = {
	create(context) {
		function detectLayer(segment) {
			return LAYER_ORDER.find((layer) => segment === layer);
		}
		function layerIndex(importPath) {
			const segment = importPath.split('/')[0];
			const layer = detectLayer(segment ?? '');
			return layer !== undefined ? LAYER_ORDER.indexOf(layer) : -1;
		}
		function fileLayerIndex(filename) {
			for (const layer of LAYER_ORDER) {
				if (filename.includes(`/src/${layer}/`) || filename.includes(`/${layer}/`)) {
					return LAYER_ORDER.indexOf(layer);
				}
			}
			return -1;
		}
		return {
			ImportDeclaration(node) {
				const importPath = node.source.value;
				const importIdx = layerIndex(importPath);
				const fileIdx = fileLayerIndex(context.filename);
				if (importIdx === -1 || fileIdx === -1) return;
				if (importIdx <= fileIdx) return;
				const suggested =
					importPath
						.split('/')
						.pop()
						?.replace(/\.(service|repo|runtime|ui)$/, '') ?? 'shared';
				context.report({
					data: { importPath, layer: LAYER_ORDER[fileIdx], suggested },
					messageId: 'layerViolation',
					node
				});
			}
		};
	},
	meta: {
		docs: {
			description: 'Enforce forward-only layer imports and surface agent-targeted remediation instructions'
		},
		messages: {
			layerViolation:
				"Layer violation: '{{importPath}}' is a higher-layer module imported from '{{layer}}' layer. " +
				"Fix: extract the shared contract into 'types/{{suggested}}.types.ts' and import from there. " +
				'Allowed direction: types → config → repo → services → runtime → ui. ' +
				'Cross-cutting concerns must enter through Providers only.'
		},
		schema: [],
		type: 'problem'
	}
};

export default [
	includeIgnoreFile(path.resolve(__dirname, '.gitignore')),
	js.configs.recommended,
	perfectionist.configs['recommended-natural'],
	{
		ignores: [
			'**/*.spec.ts',
			'**/*.test.ts',
			'**/*.config.ts',
			'**/*.config.cjs',
			'**/*.config.js',
			'**/*.config.mjs',
			'**/__tests__/fixtures/**'
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
				afterEach: 'readonly',
				beforeAll: 'readonly',
				beforeEach: 'readonly',
				describe: 'readonly',
				expect: 'readonly',
				it: 'readonly',
				test: 'readonly',
				Buffer: 'readonly',
				clearInterval: 'readonly',
				clearTimeout: 'readonly',
				console: 'readonly',
				global: 'readonly',
				NodeJS: 'readonly',
				process: 'readonly',
				AbortSignal: 'readonly',
				fetch: 'readonly',
				Response: 'readonly',
				require: 'readonly',
				setInterval: 'readonly',
				setTimeout: 'readonly',
				TextDecoder: 'readonly',
				vi: 'readonly'
			},
			parser: tsparser,
			sourceType: 'module'
		},
		plugins: {
			'@typescript-eslint': tseslint,
			'check-file': checkFile,
			import: importPlugin,
			prettier: prettierPlugin,
			sort: sortPlugin,
			'sort-destructure-keys': sortDestructureKeys,
			'unused-imports': unusedImports,
			'valora-local': {
				rules: {
					'import-layer-remedy': importLayerRemedyRule
				}
			}
		},
		rules: {
			// ESLint recommended rules
			...js.configs.recommended.rules,

			// File naming convention: kebab-case for all source files
			'check-file/filename-naming-convention': [
				'error',
				{ '**/*.{ts,tsx}': 'KEBAB_CASE' },
				{ ignoreMiddleExtensions: true }
			],

			// Import rules
			'import/first': 'error',
			'import/newline-after-import': 'error',
			'import/no-absolute-path': 'error',
			'import/no-cycle': 'error',
			'import/no-duplicates': 'error',
			'import/no-relative-packages': 'error',
			'import/no-self-import': 'error',
			'import/no-unresolved': 'error',
			'import/no-useless-path-segments': 'error',

			// Forbid literal relative parent imports (../../foo) while allowing path aliases
			'no-restricted-imports': ['error', { patterns: ['../**'] }],

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
					internalPattern: [
						'^(?:analysis|ast|cleanup|cli|config|di|executor|exploration|lint|llm|mcp|observability|output|services|session|src|types|ui|utils)/.+'
					],
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

			// Layer direction enforcement with agent-targeted remediation text
			'valora-local/import-layer-remedy': 'error',

			// Prettier rules (via eslint-config-prettier)
			...prettierConfig.rules,

			// Disable formatting rules that Prettier handles
			'prettier/prettier': 'error'
		},
		settings: {
			// Tells eslint how to resolve imports
			'import/resolver': {
				typescript: {
					alwaysTryTypes: true,
					project: './tsconfig.json'
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
					format: ['camelCase', 'PascalCase'],
					selector: 'function'
				},
				{
					format: ['camelCase'],
					selector: 'method'
				},
				{
					format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
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
	},
	// Scripts live outside src/ so allow parent-relative imports to reach src/
	{
		files: ['scripts/**/*.{ts,js,mjs}'],
		rules: {
			'no-restricted-imports': 'off'
		}
	},
	// Workspace packages: parent-relative imports reach sibling subdirectories
	// inside the same package, which is the conventional pattern. The
	// host-wide rule is to prevent host code from reaching across module
	// boundaries; inside a single package the boundary is the package itself.
	{
		files: ['packages/*/src/**/*.{ts,tsx}'],
		rules: {
			'no-restricted-imports': 'off'
		}
	},
	// Type-only declaration files in shared packages: parameter names are
	// documentation, not runtime variables. The unused-args rule fights
	// against meaningful naming in interface signatures.
	{
		files: [
			'packages/valora-plugin-memory-vault/src/embeddings/embedder.port.ts',
			'packages/valora-plugin-memory-vault/src/embeddings/llm-provider-embedder.ts',
			'packages/valora-plugin-memory-vault/src/embeddings/vector-store.ts',
			'packages/valora-plugin-memory-vault/src/vault/vault-store.ts',
			'packages/valora-plugin-memory-vault/src/vault/vault-index.ts',
			'packages/valora-plugin-memory-vault/src/manager.ts',
			'packages/valora-plugin-memory-vault/src/store.ts',
			'packages/valora-plugin-memory-vault/src/vault-memory-provider.ts',
			'packages/valora-runtime/src/logger.ts',
			'packages/valora-runtime/src/safe-exec.ts'
		],
		rules: {
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': 'off'
		}
	}
];
