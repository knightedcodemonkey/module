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
    },
  },
)
