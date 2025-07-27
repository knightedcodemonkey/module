import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import nodePlugin from 'eslint-plugin-n'

export default tseslint.config(
  eslint.configs.recommended,
  nodePlugin.configs['flat/recommended'],
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': 'error',
    },
  },
  {
    files: ['test/fixtures/**/*'],
    rules: {
      'no-undef': 'off',
      'n/no-missing-import': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'n/no-unsupported-features/node-builtins': [
        'error',
        {
          ignores: ['import.meta.dirname', 'import.meta.filename'],
        },
      ],
    },
  },
  {
    files: ['test/*.ts'],
    rules: {
      'n/no-unsupported-features/node-builtins': [
        'error',
        {
          ignores: ['test.describe', 'import.meta.dirname'],
        },
      ],
    },
  },
)
