import { requireInteropHelper } from './interopHelpers.js'

import type { FormatterOptions } from '../types.js'
import { exportsRename } from '../utils/exports.js'

type BuildEsmPreludeOptions = {
  needsCreateRequire: boolean
  needsRequireResolveHelper: boolean
  requireMainNeedsRealpath: boolean
  hoistedImports: string[]
  hoistedStatements: string[]
  needsImportInterop: boolean
  importMetaPreludeMode: FormatterOptions['importMetaPrelude']
  importMetaRef: boolean
  useExportsBag: boolean
}

const buildEsmPrelude = (options: BuildEsmPreludeOptions) => {
  const {
    needsCreateRequire,
    needsRequireResolveHelper,
    requireMainNeedsRealpath,
    hoistedImports,
    hoistedStatements,
    needsImportInterop,
    importMetaPreludeMode,
    useExportsBag,
  } = options
  let importMetaRef = options.importMetaRef

  const importPrelude: string[] = []

  if (needsCreateRequire || needsRequireResolveHelper) {
    importMetaRef = true
  }

  if (needsCreateRequire || needsRequireResolveHelper) {
    importPrelude.push('import { createRequire } from "node:module";\n')
  }

  if (needsRequireResolveHelper) {
    importPrelude.push('import { fileURLToPath } from "node:url";\n')
  }

  if (requireMainNeedsRealpath) {
    importPrelude.push('import { realpathSync } from "node:fs";\n')
    importPrelude.push('import { pathToFileURL } from "node:url";\n')
  }

  if (hoistedImports.length) {
    importPrelude.push(...hoistedImports)
  }

  const setupPrelude: string[] = []

  if (needsImportInterop) {
    setupPrelude.push(requireInteropHelper)
  }

  if (hoistedStatements.length) {
    setupPrelude.push(...hoistedStatements)
  }

  const requireInit = needsCreateRequire
    ? 'const require = createRequire(import.meta.url);\n'
    : ''

  const requireResolveInit = needsRequireResolveHelper
    ? needsCreateRequire
      ? `const __requireResolve = (id, parent) => {
  const resolved = require.resolve(id, parent);
  return resolved.startsWith("file://") ? fileURLToPath(resolved) : resolved;
};\n`
      : `const __requireResolve = (id, parent) => {
  const req = createRequire(parent ?? import.meta.url);
  const resolved = req.resolve(id, parent);
  return resolved.startsWith("file://") ? fileURLToPath(resolved) : resolved;
};\n`
    : ''

  const exportsBagInit = useExportsBag
    ? `let ${exportsRename} = {};
`
    : ''

  const modulePrelude = ''

  const prelude = `${importPrelude.join('')}${
    importPrelude.length ? '\n' : ''
  }${setupPrelude.join('')}${setupPrelude.length ? '\n' : ''}${requireInit}${requireResolveInit}${exportsBagInit}${modulePrelude}`

  const importMetaTouch = (() => {
    if (importMetaPreludeMode === 'on') return 'void import.meta.filename;\n'
    if (importMetaPreludeMode === 'off') return ''
    return importMetaRef ? 'void import.meta.filename;\n' : ''
  })()

  return `${prelude}${importMetaTouch}`
}

export { buildEsmPrelude }
