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
    settings: {
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts'],
      },
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
          alwaysTryTypes: true,
        },
        node: {
          extensions: ['.js', '.mjs', '.cjs', '.ts'],
        },
      },
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
        'error',
        {
          missingExports: true,
          unusedExports: true,
          src: ['src/**/*.ts', 'test/**/*.ts'],
          ignoreExports: ['src/specifier.ts', 'src/types.ts'],
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
