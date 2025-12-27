import MagicString from 'magic-string'
import type { Node, MetaProperty } from 'oxc-parser'

import type { FormatterOptions } from '../types.js'

const importMetaMainSupport =
  '(() => { const [__nmaj, __nmin] = process.versions.node.split(".").map(n => parseInt(n, 10) || 0); return (__nmaj > 24 || (__nmaj === 24 && __nmin >= 2) || (__nmaj === 22 && __nmin >= 18)); })()'
const importMetaMainShim = 'process.argv[1] === __filename'

const importMetaMainExpr = (mode: FormatterOptions['importMetaMain']) => {
  switch (mode) {
    case 'warn':
      return `(${importMetaMainSupport} ? ${importMetaMainShim} : (console.warn("import.meta.main is not supported before Node 22.18/24.2; falling back to shim."), ${importMetaMainShim}))`
    case 'error':
      return `(${importMetaMainSupport} ? ${importMetaMainShim} : (() => { throw new Error("import.meta.main is not supported before Node 22.18/24.2"); })())`
    case 'shim':
    default:
      return importMetaMainShim
  }
}

export const metaProperty = (
  node: MetaProperty,
  parent: Node | null,
  src: MagicString,
  options: FormatterOptions,
) => {
  if (options.target === 'commonjs') {
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
           * Map to require.resolve intentionally: matches CJS resolution semantics.
           * Wrapping in pathToFileURL(...) would change the return shape (URL string)
           * without truly emulating ESM import.meta.resolve rules.
           */
          src.update(parent.start, parent.end, 'require.resolve')
          break
        case 'main':
          src.update(parent.start, parent.end, importMetaMainExpr(options.importMetaMain))
          break
      }
    }
  }
}
