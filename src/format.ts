import MagicString from 'magic-string'
import _traverse from '@babel/traverse'

import type { ParseResult } from '@babel/parser'
import type { File } from '@babel/types'

import type { ModuleOptions } from './types.js'

const traverse = _traverse.default

type FormatOptions = Omit<ModuleOptions, 'out'>
export const format = (code: string, ast: ParseResult<File>, options: FormatOptions) => {
  const src = new MagicString(code)
  const { type = 'commonjs' } = options

  traverse(ast, {
    MetaProperty(metaPropertyPath) {
      if (type === 'commonjs') {
        const path = metaPropertyPath.findParent(path => path.isMemberExpression())

        if (path) {
          const { node } = path
          const { start, end } = node

          if (
            node.type === 'MemberExpression' &&
            node.property.type === 'Identifier' &&
            typeof start == 'number' &&
            typeof end === 'number'
          ) {
            const name = node.property.name

            switch (name) {
              case 'url':
                src.update(start, end, 'require("node:url").pathToFileURL(__filename).toString()')
                break
              case 'filename':
                src.update(start, end, '__filename')
                break
              case 'dirname':
                src.update(start, end, '__dirname')
                break
              case 'resolve':
                src.update(start, end, 'require.resolve')
                break
            }
          }
        }
      }
    },
    ExpressionStatement(expressionStatementPath) {
      if (type === 'module') {
        const { node } = expressionStatementPath
        const { start, end } = node

        if (node.expression.type === 'Identifier' && typeof start === 'number' && typeof end === 'number') {
          const name = node.expression.name

          switch (name) {
            case '__filename':
              src.update(start, end, 'import.meta.filename')
              break
            case '__dirname':
              src.update(start, end, 'import.meta.dirname')
              break
          }
        }
      }
    },
    MemberExpression(memberExpressionPath) {
      if (type === 'module') {
        const { node } = memberExpressionPath
        const { start, end } = node

        // Update require.resolve to import.meta.resolve
        if (
          node.object.type === 'Identifier' &&
          node.object.name === 'require' &&
          node.property.type === 'Identifier' &&
          node.property.name == 'resolve' &&
          typeof start === 'number' &&
          typeof end === 'number'
        ) {
          src.update(start, end, 'import.meta.resolve')
        }
      }
    },
  })

  return src
}
