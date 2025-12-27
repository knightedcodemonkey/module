import type { ParseResult } from 'oxc-parser'
import type { FormatterOptions, ExportsMeta } from './types.js'
import MagicString from 'magic-string'

import { identifier } from '#formatters/identifier.js'
import { metaProperty } from '#formatters/metaProperty.js'
import { memberExpression } from '#formatters/memberExpression.js'
import { assignmentExpression } from '#formatters/assignmentExpression.js'
import { isValidUrl } from '#utils/url.js'
import { exportsRename, collectCjsExports } from '#utils/exports.js'
import { collectModuleIdentifiers } from '#utils/identifiers.js'
import { isIdentifierName } from '#helpers/identifier.js'
import { ancestorWalk } from '#walk'

/**
 * Node added support for import.meta.main.
 * Added in: v24.2.0, v22.18.0
 * @see https://nodejs.org/api/esm.html#importmetamain
 */
const format = async (src: string, ast: ParseResult, opts: FormatterOptions) => {
  const code = new MagicString(src)
  const exportsMeta = {
    hasExportsBeenReassigned: false,
    defaultExportValue: undefined,
    hasDefaultExportBeenReassigned: false,
    hasDefaultExportBeenAssigned: false,
  } satisfies ExportsMeta
  const exportTable =
    opts.target === 'module' ? await collectCjsExports(ast.program) : null
  await collectModuleIdentifiers(ast.program)

  if (opts.target === 'module' && opts.transformSyntax) {
    /**
     * Prepare ESM output by renaming `exports` to `__exports` and seeding an
     * `import.meta.filename` touch so import.meta is present even when the
     * original source never referenced it.
     */
    code.prepend(`let ${exportsRename} = {};
void import.meta.filename;
`)
  }

  await ancestorWalk(ast.program, {
    async enter(node, ancestors) {
      const parent = ancestors[ancestors.length - 2] ?? null

      if (
        node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression'
      ) {
        const skipped = ['__filename', '__dirname']
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
        if (opts.target === 'module') {
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

      if (node.type === 'MemberExpression') {
        memberExpression(node, parent, code, opts)
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

  if (opts.target === 'module' && opts.transformSyntax && exportTable) {
    const isValidExportName = (name: string) => /^[$A-Z_a-z][$\w]*$/.test(name)
    const asExportName = (name: string) =>
      isValidExportName(name) ? name : JSON.stringify(name)
    const accessProp = (name: string) =>
      isValidExportName(name)
        ? `${exportsRename}.${name}`
        : `${exportsRename}[${JSON.stringify(name)}]`
    const tempNameFor = (name: string) => {
      const sanitized = name.replace(/[^$\w]/g, '_') || 'value'
      const safe = /^[0-9]/.test(sanitized) ? `_${sanitized}` : sanitized
      return `__export_${safe}`
    }

    const lines: string[] = []

    const defaultEntry = exportTable.get('default')
    if (defaultEntry) {
      const def = defaultEntry.fromIdentifier ?? exportsRename
      lines.push(`export default ${def};`)
    }

    for (const [key, entry] of exportTable) {
      if (key === 'default') continue

      if (entry.fromIdentifier) {
        lines.push(`export { ${entry.fromIdentifier} as ${asExportName(key)} };`)
      } else {
        const temp = tempNameFor(key)
        lines.push(`const ${temp} = ${accessProp(key)};`)
        lines.push(`export { ${temp} as ${asExportName(key)} };`)
      }
    }

    if (lines.length) {
      code.append(`\n${lines.join('\n')}\n`)
    }
  }

  return code.toString()
}

export { format }
