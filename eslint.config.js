import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs['recommended-type-checked'].rules,
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  prettier,
  {
    // ApeironCode-web is a standalone Next.js marketing site with its own
    // eslint.config.mjs + tsconfig.json; .playwright-mcp is a scratch dir.
    // Neither belongs to the agent's root tsconfig, so the root typed-lint must
    // not try to parse them (it would fail with "not found in any project").
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'extensions/**',
      'ApeironCode-web/**',
      '.playwright-mcp/**',
    ],
  },
];