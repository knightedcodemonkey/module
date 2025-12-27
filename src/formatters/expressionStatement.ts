import MagicString from 'magic-string'
import type { Node, ExpressionStatement } from 'oxc-parser'

import type { FormatterOptions } from '../types.js'

export const expressionStatement = (
  node: ExpressionStatement,
  parent: Node | null,
  src: MagicString,
  options: FormatterOptions,
) => {
  if (options.target === 'module') {
    if (node.expression.type === 'Identifier') {
      const { start, end } = node
      const name = node.expression.name

      // CommonJS globals (as bare identifiers)
      switch (name) {
        case 'require':
          src.remove(start, end)
          break
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
  }

  if (options.target === 'commonjs') {
    if (node.expression.type === 'Identifier') {
      const { start, end } = node
      const name = node.expression.name

      void start
      void end
      void name
    }
  }
}
