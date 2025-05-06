import MagicString from 'magic-string'
import type { Node, IdentifierName } from 'oxc-parser'

import type { FormatterOptions, ExportsMeta } from '../types.js'
import { exportsRename } from '../utils.js'
import { identifier as ident } from '../helpers.js'

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
        {
          const parent = ancestors[ancestors.length - 2]

          if (opts.importsExports) {
            if (parent.type === 'AssignmentExpression' && parent.left === node) {
              // The code is reassigning `exports` to something else.

              meta.hasExportsBeenReassigned = true
              code.update(parent.left.start, parent.left.end, exportsRename)
            }

            if (
              //ident.isGlobalScope(ancestors) &&
              !ident.isFunctionExpressionId(ancestors) &&
              !ident.isExportSpecifierAlias(ancestors) &&
              !ident.isClassPropertyKey(ancestors) &&
              !ident.isMethodDefinitionKey(ancestors) &&
              !ident.isMemberKey(ancestors) &&
              !ident.isPropertyKey(ancestors) &&
              !ident.isIife(ancestors)
            ) {
              code.update(start, end, exportsRename)
            }
          }
        }
        break
    }
  }
}
