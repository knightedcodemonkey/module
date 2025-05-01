import MagicString from 'magic-string'
import type { MemberExpression, Node } from 'oxc-parser'

import type { FormatterOptions } from '../types.js'

export const memberExpression = (
  node: MemberExpression,
  parent: Node | null,
  src: MagicString,
  options: FormatterOptions,
) => {
  if (options.type === 'module') {
    if (
      node.object.type === 'Identifier' &&
      node.property.type === 'Identifier' &&
      node.object.name === 'require'
    ) {
      const { start, end } = node
      const { name } = node.property

      // CommonJS properties of `require`
      switch (name) {
        case 'main':
          /**
           * Node.js team still quibbling over import.meta.main ¯\_(ツ)_/¯
           * @see https://github.com/nodejs/node/pull/32223
           */
          if (parent?.type === 'ExpressionStatement') {
            // This is a standalone expression so remove it to not cause run-time errors.
            src.remove(start, end)
          }
          /**
           * Transform require.main === module.
           */
          if (parent?.type === 'BinaryExpression') {
          }
          break
        case 'resolve':
          src.update(start, end, 'import.meta.resolve')
          break
        case 'cache':
          /**
           * Can of worms here. ¯\_(ツ)_/¯
           * @see https://github.com/nodejs/help/issues/2806
           */
          src.update(start, end, '{}')
          break
      }
    }
  }
}
