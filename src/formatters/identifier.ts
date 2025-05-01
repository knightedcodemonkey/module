import MagicString from 'magic-string'
import type { Node, IdentifierName } from 'oxc-parser'

import type { FormatterOptions, ExportsMeta } from '../types.js'
import { exportsRename } from '../utils.js'

type IdentifierArg = {
  node: IdentifierName
  ancestors: Node[]
  code: MagicString
  opts: FormatterOptions
  meta: ExportsMeta
}

export const identifier = ({ node, ancestors, code, opts, meta }: IdentifierArg) => {
  if (opts.type === 'module') {
    const { start, end, name } = node

    switch (name) {
      case '__filename':
        code.update(start, end, 'import.meta.url')
        break
      case '__dirname':
        code.update(start, end, 'import.meta.dirname')
        break
      case 'exports':
        const parent = ancestors[ancestors.length - 2]

        if (
          opts.importsExports &&
          //parent &&
          //ancestors.find(ancestor => ancestor.type === 'AssignmentExpression')
          !['Property'].includes(parent.type)
        ) {
          if (parent.type === 'AssignmentExpression' && parent.left === node) {
            // The code is reassigning `exports` to something else.

            meta.hasExportsBeenReassigned = true
            code.update(parent.left.start, parent.left.end, exportsRename)
          } else {
            code.update(start, end, exportsRename)
          }
        }
        break
    }
  }
}
