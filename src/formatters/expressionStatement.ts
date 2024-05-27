import MagicString from 'magic-string'

import type { NodePath } from '@babel/traverse'
import type { ExpressionStatement, MemberExpression } from '@babel/types'
import type { FormatterOptions } from '../types.js'

export const expressionStatement = (
  nodePath: NodePath<ExpressionStatement>,
  src: MagicString,
  options: FormatterOptions,
) => {
  if (options.type === 'module') {
    const { node } = nodePath
    const { start, end } = node

    if (typeof start === 'number' && typeof end === 'number') {
      const isMemberExpressionModuleExports = (expression: MemberExpression) => {
        return (
          expression.object.type === 'Identifier' &&
          expression.object.name === 'module' &&
          expression.property.type === 'Identifier' &&
          expression.property.name === 'exports'
        )
      }

      if (node.expression.type === 'Identifier') {
        const name = node.expression.name

        // CommonJS globals
        switch (name) {
          case 'module':
            src.update(start, end, 'import.meta')
            break
          case 'exports':
            src.update(start, end, '{}')
            break
          case '__filename':
            src.update(start, end, 'import.meta.filename')
            break
          case '__dirname':
            src.update(start, end, 'import.meta.dirname')
            break
        }
      }

      if (node.expression.type === 'MemberExpression') {
        const { expression } = node

        // Check for `module.exports` without an assignment
        if (isMemberExpressionModuleExports(expression)) {
          /**
           * @TODO: Should this depend on `options.modules` being enabled?
           * Probably not for the same reason `exports` is converted to an empty object (ReferenceError in ESM).
           * This is a standalone reference to `module.exports` without being part of an AssignmentExpression.
           */
          src.update(start, end, '{}')
        }
      }

      /*
      if (
        options.modules &&
        node.expression.type === 'AssignmentExpression' &&
        node.expression.left.type === 'MemberExpression' &&
        isMemberExpressionModuleExports(node.expression.left)
      ) {
        // @TODO support `modules` option.
      }
      */
    }
  }
}
