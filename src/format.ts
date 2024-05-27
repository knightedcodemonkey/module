import MagicString from 'magic-string'
import _traverse from '@babel/traverse'

import type { ParseResult } from '@babel/parser'
import type { File } from '@babel/types'
import type { FormatterOptions } from './types.js'

import { metaProperty } from './formatters/metaProperty.js'
import { memberExpression } from './formatters/memberExpression.js'
import { expressionStatement } from './formatters/expressionStatement.js'

const traverse = _traverse.default

/**
 * Note, there is no specific conversion for `import.meta.main` as it does not exist.
 * @see https://github.com/nodejs/node/issues/49440
 */
export const format = (code: string, ast: ParseResult<File>, options: FormatterOptions) => {
  const src = new MagicString(code)

  traverse(ast, {
    MetaProperty(path) {
      metaProperty(path, src, options)
    },
    ExpressionStatement(path) {
      expressionStatement(path, src, options)
    },
    MemberExpression(path) {
      memberExpression(path, src, options)
    },
  })

  return src
}
