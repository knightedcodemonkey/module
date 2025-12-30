import MagicString from 'magic-string'

import type { ExportsMap } from '../helpers/ast.js'
import { exportsRename } from '../utils/exports.js'

type WarnOnce = (
  codeId: string,
  message: string,
  loc?: { start: number; end: number },
) => void

const exportBagToEsm = (params: {
  code: MagicString
  exportTable: ExportsMap
  warnOnce: WarnOnce
  importMetaRef: boolean
}) => {
  const { code, exportTable, warnOnce } = params
  let importMetaRef = params.importMetaRef

  const isValidExportName = (name: string) => /^[$A-Z_a-z][$\w]*$/.test(name)
  const asExportName = (name: string) =>
    isValidExportName(name) ? name : JSON.stringify(name)
  const accessProp = (name: string) =>
    isValidExportName(name)
      ? `${exportsRename}.${name}`
      : `${exportsRename}[${JSON.stringify(name)}]`
  const exportValueFor = (name: string) => {
    if (name === '__dirname') {
      importMetaRef = true
      return 'import.meta.dirname'
    }
    if (name === '__filename') {
      importMetaRef = true
      return 'import.meta.filename'
    }
    return name
  }
  const tempNameFor = (name: string) => {
    const sanitized = name.replace(/[^$\w]/g, '_') || 'value'
    const safe = /^[0-9]/.test(sanitized) ? `_${sanitized}` : sanitized
    return `__export_${safe}`
  }

  for (const [key, entry] of exportTable) {
    if (entry.reassignments.length) {
      const loc = entry.reassignments[0]
      warnOnce(
        `cjs-export-reassignment:${key}`,
        `Export '${key}' is reassigned after export; ESM live bindings may change consumer behavior.`,
        { start: loc.start, end: loc.end },
      )
    }
  }

  const lines: string[] = []

  const defaultEntry = exportTable.get('default')
  if (defaultEntry) {
    const def = defaultEntry.fromIdentifier ?? exportsRename
    const defExpr = exportValueFor(def)

    if (defExpr !== def) {
      const temp = tempNameFor(def)
      lines.push(`const ${temp} = ${defExpr};`)
      lines.push(`export default ${temp};`)
    } else {
      lines.push(`export default ${defExpr};`)
    }
  }

  for (const [key, entry] of exportTable) {
    if (key === 'default') continue

    if (!isValidExportName(key)) {
      warnOnce(
        `cjs-string-export:${key}`,
        `Synthesized string-literal export '${key}'. Some tooling may require bracket access to use it.`,
      )
    }

    if (entry.fromIdentifier) {
      const resolved = exportValueFor(entry.fromIdentifier)
      if (resolved !== entry.fromIdentifier) {
        const temp = tempNameFor(entry.fromIdentifier)
        lines.push(`const ${temp} = ${resolved};`)
        lines.push(`export { ${temp} as ${asExportName(key)} };`)
      } else {
        lines.push(`export { ${resolved} as ${asExportName(key)} };`)
      }
    } else {
      const temp = tempNameFor(key)
      lines.push(`const ${temp} = ${accessProp(key)};`)
      lines.push(`export { ${temp} as ${asExportName(key)} };`)
    }
  }

  if (lines.length) {
    code.append(`\n${lines.join('\n')}\n`)
  }

  return importMetaRef
}

export { exportBagToEsm, type WarnOnce }
