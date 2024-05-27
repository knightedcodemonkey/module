import MagicString from 'magic-string'

import type { NodePath } from '@babel/traverse'
import type { MetaProperty } from '@babel/types'
import type { FormatterOptions } from '../types.js'

export const metaProperty = (nodePath: NodePath<MetaProperty>, src: MagicString, options: FormatterOptions) => {
  if (options.type === 'commonjs') {
    const path = nodePath.findParent(path => path.isMemberExpression())

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
    } else {
      const { node } = nodePath
      const { start, end } = node

      if (
        node.property.type === 'Identifier' &&
        node.property.name === 'meta' &&
        typeof start === 'number' &&
        typeof end === 'number'
      ) {
        // This is an `import.meta` expression
        src.update(start, end, 'require.main')
      }
    }
  }
}
