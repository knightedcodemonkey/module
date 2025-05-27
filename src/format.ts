import type { ParseResult } from 'oxc-parser'
import type { FormatterOptions, ExportsMeta, IdentMeta } from './types.js'
import MagicString from 'magic-string'
import { walk, ancestorWalk } from '@knighted/walk'

import { identifier } from './formatters/identifier.js'
import { metaProperty } from './formatters/metaProperty.js'
import { memberExpression } from './formatters/memberExpression.js'
import { expressionStatement } from './formatters/expressionStatement.js'
import { assignmentExpression } from './formatters/assignmentExpression.js'
import { isValidUrl, exportsRename, collectModuleIdentifiers } from '../src/utils.js'
import { isIdentifierName } from '../src/helpers.js'

/**
 * Note, there is no specific conversion for `import.meta.main` as it does not exist.
 * @see https://github.com/nodejs/node/issues/49440
 */
const format = async (src: string, ast: ParseResult, opts: FormatterOptions) => {
  const code = new MagicString(src)
  const exportsMeta = {
    hasExportsBeenReassigned: false,
    defaultExportValue: undefined,
    hasDefaultExportBeenReassigned: false,
    hasDefaultExportBeenAssigned: false,
  } satisfies ExportsMeta
  let identifiers = await collectModuleIdentifiers(ast.program)

  if (opts.type === 'module' && opts.importsExports) {
    /**
     * Rename `exports` to `__exports` in the global scope.
     * Collect all identifiers in the global/module scope.
     */
    code.prepend(`let ${exportsRename} = {};\n`)
  }

  await ancestorWalk(ast.program, {
    async enter(node, ancestors) {
      const parent = ancestors[ancestors.length - 2] ?? null

      if (
        node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression'
      ) {
        const skipped = ['__filename', '__dirname', 'exports']
        const skippedParams = node.params.filter(
          param => param.type === 'Identifier' && skipped.includes(param.name),
        )
        const skippedFuncIdentifier =
          node.id?.type === 'Identifier' && skipped.includes(node.id.name)

        if (skippedParams.length || skippedFuncIdentifier) {
          this.skip()
        }
      }

      /**
       * Check for assignment to `import.meta.url`.
       */
      if (
        node.type === 'AssignmentExpression' &&
        node.left.type === 'MemberExpression' &&
        node.left.object.type === 'MetaProperty' &&
        node.left.property.type === 'Identifier' &&
        node.left.property.name === 'url'
      ) {
        if (node.right.type === 'Literal' && typeof node.right.value === 'string') {
          if (!isValidUrl(node.right.value)) {
            const rhs = code.snip(node.right.start, node.right.end).toString()
            const assignment = code.snip(node.start, node.end).toString()

            code.update(
              node.start,
              node.end,
              `/* Invalid assignment: ${rhs} is not a URL. ${assignment} */`,
            )
            this.skip()
          }
        }
      }

      /**
       * Skip module scope CJS globals when they are object properties.
       * Ignoring `exports` here.
       */
      if (
        node.type === 'MemberExpression' &&
        node.property.type === 'Identifier' &&
        ['__filename', '__dirname'].includes(node.property.name)
      ) {
        this.skip()
      }

      /**
       * Check for bare `module.exports` expressions.
       */
      if (
        node.type === 'MemberExpression' &&
        node.object.type === 'Identifier' &&
        node.object.name === 'module' &&
        node.property.type === 'Identifier' &&
        node.property.name === 'exports' &&
        parent?.type === 'ExpressionStatement'
      ) {
        if (opts.type === 'module') {
          code.update(node.start, node.end, ';')
          // Prevent parsing the `exports` identifier again.
          this.skip()
        }
      }

      /**
       * Format `module.exports` and `exports` assignments.
       */
      if (node.type === 'AssignmentExpression') {
        await assignmentExpression({
          node,
          parent,
          code,
          opts,
          meta: exportsMeta,
        })
      }

      if (node.type === 'MetaProperty') {
        metaProperty(node, parent, code, opts)
      }

      if (isIdentifierName(node)) {
        identifier({
          node,
          ancestors,
          code,
          opts,
          meta: exportsMeta,
        })
      }
    },
  })

  return code.toString()
}

export { format }
