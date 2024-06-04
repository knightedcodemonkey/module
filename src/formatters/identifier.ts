import MagicString from 'magic-string'

import type { NodePath } from '@babel/traverse'
import type { Identifier } from '@babel/types'
import type { FormatterOptions } from '../types.js'

export const identifier = (nodePath: NodePath<Identifier>, src: MagicString, options: FormatterOptions) => {
  if (options.type === 'module') {
    const { node } = nodePath
    const { start, end } = node

    if (typeof start === 'number' && typeof end === 'number' && node.type === 'Identifier') {
      const { name } = node
      const isMemberExpression = Boolean(nodePath.findParent(path => path.isMemberExpression()))

      // CommonJS globals in expression/statement
      switch (name) {
        case 'module': {
          if (!isMemberExpression) {
            src.update(start, end, 'import.meta')
          }
          break
        }
        case 'exports': {
          if (!isMemberExpression) {
            src.update(start, end, '{}')
          }
          break
        }
        case '__filename':
          src.update(start, end, 'import.meta.filename')
          break
        case '__dirname':
          src.update(start, end, 'import.meta.dirname')
          break
      }
    }
  }
}
