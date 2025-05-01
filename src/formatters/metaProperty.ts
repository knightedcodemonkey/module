import MagicString from 'magic-string'
import type { Node, MetaProperty } from 'oxc-parser'

import type { FormatterOptions } from '../types.js'

export const metaProperty = (
  node: MetaProperty,
  parent: Node | null,
  src: MagicString,
  options: FormatterOptions,
) => {
  if (options.type === 'commonjs') {
    if (parent?.type !== 'MemberExpression') {
      // This is a bare `import.meta` expression
      const { start, end } = node

      src.update(start, end, 'module')
    }

    if (parent?.type === 'MemberExpression' && parent.property.type === 'Identifier') {
      switch (parent.property.name) {
        case 'url':
          src.update(
            parent.start,
            parent.end,
            'require("node:url").pathToFileURL(__filename).href',
          )
          break
        case 'filename':
          src.update(parent.start, parent.end, '__filename')
          break
        case 'dirname':
          src.update(parent.start, parent.end, '__dirname')
          break
        case 'resolve':
          /**
           * Should this be `require('node:url').pathToFileURL(require.resolve(<parsed specifier>)).href`?
           */
          src.update(parent.start, parent.end, 'require.resolve')
          break
      }
    }
  }
}
