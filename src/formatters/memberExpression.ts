import MagicString from 'magic-string'
import type { MemberExpression, Node } from 'oxc-parser'

import type { FormatterOptions } from '../types.js'
import { exportsRename } from '#utils/exports.js'

type MemberExpressionExtras = {
  onRequireResolve?: () => void
  requireResolveName?: string
  onDiagnostic?: (
    code: string,
    message: string,
    loc?: { start: number; end: number },
  ) => void
}

export const memberExpression = (
  node: MemberExpression,
  parent: Node | null,
  src: MagicString,
  options: FormatterOptions,
  shadowed?: Set<string>,
  extras?: MemberExpressionExtras,
  useExportsBag: boolean = true,
  rewriteExports: boolean = true,
) => {
  if (options.target === 'module') {
    if (rewriteExports && !useExportsBag) {
      if (
        parent?.type === 'MemberExpression' &&
        parent.object === node &&
        parent.property.type === 'Identifier'
      ) {
        const baseIsExportsIdent =
          node.object.type === 'Identifier' && node.object.name === 'exports'
        const baseIsModuleExports =
          node.object.type === 'Identifier' &&
          node.object.name === 'module' &&
          node.property.type === 'Identifier' &&
          node.property.name === 'exports'

        if (baseIsExportsIdent || baseIsModuleExports) {
          src.update(parent.start, parent.end, parent.property.name)
          return
        }
      }

      if (
        node.object.type === 'Identifier' &&
        node.property.type === 'Identifier' &&
        node.object.name === 'module' &&
        node.property.name === 'exports'
      ) {
        src.update(node.start, node.end, 'undefined')
        return
      }
    }

    if (
      rewriteExports &&
      ((node.object.type === 'Identifier' && shadowed?.has(node.object.name)) ||
        (node.property.type === 'Identifier' && shadowed?.has(node.property.name)))
    ) {
      return
    }
    if (rewriteExports) {
      if (
        node.object.type === 'Identifier' &&
        node.property.type === 'Identifier' &&
        node.object.name === 'module' &&
        node.property.name === 'exports'
      ) {
        if (useExportsBag) {
          src.update(node.start, node.end, exportsRename)
        }
        return
      }
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
          if (parent?.type === 'BinaryExpression') {
            return
          }
          src.update(start, end, 'import.meta.main')
          break
        case 'resolve':
          if (options.transformSyntax !== true) {
            src.update(start, end, 'import.meta.resolve')
            return
          }
          extras?.onRequireResolve?.()
          src.update(start, end, extras?.requireResolveName ?? 'import.meta.resolve')
          break
        case 'cache':
          /**
           * Can of worms here. ¯\_(ツ)_/¯
           * @see https://github.com/nodejs/help/issues/2806
           */
          extras?.onDiagnostic?.(
            'legacy-require-cache',
            'Access to require.cache is not supported when raising to ESM; behavior may differ.',
            { start, end },
          )
          src.update(start, end, '{}')
          break
        case 'extensions':
          extras?.onDiagnostic?.(
            'legacy-require-extensions',
            'Access to require.extensions is not supported when raising to ESM; use loaders instead.',
            { start, end },
          )
          break
      }
    }

    if (
      node.object.type === 'Identifier' &&
      node.property.type === 'Identifier' &&
      node.object.name === 'module' &&
      node.property.name === 'require'
    ) {
      if (!shadowed?.has('module')) {
        src.update(node.start, node.end, 'require')
      }
      return
    }

    if (
      node.object.type === 'Identifier' &&
      node.property.type === 'Identifier' &&
      node.object.name === 'module' &&
      (node.property.name === 'parent' || node.property.name === 'children')
    ) {
      extras?.onDiagnostic?.(
        `legacy-module-${node.property.name}`,
        `Access to module.${node.property.name} may not behave the same in ESM; consider loaders or explicit wiring instead.`,
        { start: node.start, end: node.end },
      )
    }
  }
}
