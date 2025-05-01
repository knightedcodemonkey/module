import MagicString from 'magic-string'
import type { Node, AssignmentExpression } from 'oxc-parser'
import { walk } from '@knighted/walk'

import type { FormatterOptions, ExportsMeta } from '../types.js'
import { exportsRename } from '../utils.js'

type AssignmentExpressionArg = {
  node: AssignmentExpression
  parent: Node | null
  code: MagicString
  opts: FormatterOptions
  meta: ExportsMeta
}

export const assignmentExpression = async ({
  node,
  parent,
  code,
  opts,
  meta,
}: AssignmentExpressionArg) => {
  if (opts.type === 'module' && opts.importsExports) {
    await walk(node, {
      enter(childNode, childParent) {
        if (childNode.type === 'Identifier' && childNode.name === 'exports') {
          if (childParent === node && node.left === childNode) {
            /**
             * The code is reassigning `exports` to something else.
             * Redeclare it with a new variable name using var.
             */
            //meta.hasExportsBeenReassigned = true
            //console.log('writing exports reassignment')
            //code.update(node.left.start, node.left.end, exportsRename)
            //console.log(code.slice(node.start, node.end))
            //code.update(childNode.start, childNode.end, exportsRename)
            //console.log('reassigning exports', childParent, code.update(node.left.start, node.left.end, exportsRename))
          }
          //console.log('found exports assignment', meta.hasExportsBeenReassigned, expr)
        }
      },
    })
  }
}
