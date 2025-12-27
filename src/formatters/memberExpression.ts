import MagicString from 'magic-string'
import type { MemberExpression, Node } from 'oxc-parser'

import type { FormatterOptions } from '../types.js'
import { exportsRename } from '#utils/exports.js'

export const memberExpression = (
  node: MemberExpression,
  parent: Node | null,
  src: MagicString,
  options: FormatterOptions,
  shadowed?: Set<string>,
) => {
  if (options.target === 'module') {
    if (
      (node.object.type === 'Identifier' && shadowed?.has(node.object.name)) ||
      (node.property.type === 'Identifier' && shadowed?.has(node.property.name))
    ) {
      return
    }
    if (
      node.object.type === 'Identifier' &&
      node.property.type === 'Identifier' &&
      node.object.name === 'module' &&
      node.property.name === 'exports'
    ) {
      src.update(node.start, node.end, exportsRename)
      return
    }

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
