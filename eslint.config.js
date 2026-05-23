import importPlugin from 'eslint-plugin-import'
import tsParser from '@typescript-eslint/parser'

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'sibling', 'index', 'parent'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'import/no-unused-modules': [
        'warn',
        {
          missingExports: true,
          unusedExports: true,
          src: ['src/**/*.ts'],
        },
      ],
    },
  },
  {
    files: ['test/fixtures/**'],
    rules: {
      'import/no-unused-modules': 'off',
    },
  },
]
