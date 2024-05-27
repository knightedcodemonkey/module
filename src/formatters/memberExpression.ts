import MagicString from 'magic-string'

import type { NodePath } from '@babel/traverse'
import type { MemberExpression } from '@babel/types'
import type { FormatterOptions } from '../types.js'

export const memberExpression = (
  nodePath: NodePath<MemberExpression>,
  src: MagicString,
  options: FormatterOptions,
) => {
  if (options.type === 'module') {
    const { node } = nodePath
    const { start, end } = node

    if (
      typeof start === 'number' &&
      typeof end === 'number' &&
      node.object.type === 'Identifier' &&
      node.object.name === 'require' &&
      node.property.type === 'Identifier'
    ) {
      const { name } = node.property

      // CommonJS properties of `require`
      switch (name) {
        case 'main':
          src.update(start, end, 'import.meta')
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
