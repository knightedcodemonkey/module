import type { Node, ParseResult } from 'oxc-parser'
import MagicString from 'magic-string'

import type { ExportsMap } from './helpers/ast.js'
import { hasTopLevelAwait, isAsyncContext } from './helpers/async.js'
import { isIdentifierName } from './helpers/identifier.js'
import { assignmentExpression } from './formatters/assignmentExpression.js'
import { identifier } from './formatters/identifier.js'
import { memberExpression } from './formatters/memberExpression.js'
import { metaProperty } from './formatters/metaProperty.js'
import { buildIdiomaticPlan } from './pipeline/idiomaticPlan.js'
import { buildEsmPrelude } from './pipeline/buildEsmPrelude.js'
import { exportBagToEsm, type WarnOnce } from './pipeline/exportBagToEsm.js'
import {
  isRequireCall,
  isStaticRequire,
  lowerCjsRequireToImports,
  type RequireTransform,
} from './pipeline/lowerCjsRequireToImports.js'
import {
  lowerEsmToCjs,
  type ExportTransform,
  type ImportTransform,
} from './pipeline/lowerEsmToCjs.js'
import { buildFormatVisitor, type FormatWalkState } from './pipeline/formatVisitor.js'
import { interopHelper } from './pipeline/interopHelpers.js'
import type { Diagnostic, ExportsMeta, FormatterOptions } from './types.js'
import { collectCjsExports } from './utils/exports.js'
import { collectModuleIdentifiers } from './utils/identifiers.js'
import { isValidUrl } from './utils/url.js'
import { ancestorWalk } from './walk.js'
const isRequireMainMember = (node: Node, shadowed: Set<string>) =>
  node.type === 'MemberExpression' &&
  node.object.type === 'Identifier' &&
  node.object.name === 'require' &&
  !shadowed.has('require') &&
  node.property.type === 'Identifier' &&
  node.property.name === 'main'

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
  const warned = new Set<string>()
  const emitDiagnostic = (diag: Diagnostic) => {
    if (opts.diagnostics) {
      opts.diagnostics(diag)
      return
    }

    if (diag.level === 'warning') {
      // eslint-disable-next-line no-console -- used for opt-in diagnostics
      console.warn(diag.message)
      return
    }

    // eslint-disable-next-line no-console -- used for opt-in diagnostics
    console.error(diag.message)
  }
  const warnOnce: WarnOnce = (
    codeId: string,
    message: string,
    loc?: { start: number; end: number },
  ) => {
    const key = `${codeId}:${loc?.start ?? ''}`
    if (warned.has(key)) return
    warned.add(key)
    emitDiagnostic({
      level: 'warning',
      code: codeId,
      message,
      filePath: opts.filePath,
      loc,
    })
  }
  const transformMode = opts.transformSyntax
  const fullTransform = transformMode === true
  const moduleIdentifiers = await collectModuleIdentifiers(ast.program)
  const shadowedBindings = new Set(
    [...moduleIdentifiers.entries()]
      .filter(([, meta]) => meta.declare.length > 0)
      .map(([name]) => name),
  )

  if (opts.target === 'module' && fullTransform) {
    if (shadowedBindings.has('module') || shadowedBindings.has('exports')) {
      throw new Error(
        'Cannot transform to ESM: module or exports is shadowed in module scope.',
      )
    }
  }

  const exportTable: ExportsMap | null =
    opts.target === 'module' ? await collectCjsExports(ast.program) : null
  const idiomaticMode =
    opts.target === 'module' && fullTransform ? (opts.idiomaticExports ?? 'safe') : 'off'
  let useExportsBag = fullTransform
  let idiomaticPlan: {
    replacements: Array<{ start: number; end: number }>
    exports: string[]
  } | null = null
  let idiomaticFallbackReason: string | undefined
  if (opts.target === 'module' && exportTable) {
    const hasExportsVia = [...exportTable.values()].some(entry =>
      entry.via.has('exports'),
    )
    const hasModuleExportsVia = [...exportTable.values()].some(entry =>
      entry.via.has('module.exports'),
    )

    if (hasExportsVia && hasModuleExportsVia) {
      const firstExports = [...exportTable.values()].find(entry =>
        entry.via.has('exports'),
      )?.writes[0]
      const firstModule = [...exportTable.values()].find(entry =>
        entry.via.has('module.exports'),
      )?.writes[0]

      warnOnce(
        'cjs-mixed-exports',
        'Both module.exports and exports are assigned in this module; CommonJS shadowing may not match synthesized ESM exports.',
        { start: firstModule?.start ?? 0, end: firstExports?.end ?? 0 },
      )
    }

    if (idiomaticMode !== 'off') {
      const res = buildIdiomaticPlan({
        src,
        code,
        exportTable,
        shadowedBindings,
        idiomaticMode,
      })
      if (res.ok) {
        useExportsBag = false
        idiomaticPlan = res.plan
      } else {
        idiomaticFallbackReason = res.reason
      }
    }
  }
  const shouldCheckTopLevelAwait = opts.target === 'commonjs' && fullTransform
  const containsTopLevelAwait = shouldCheckTopLevelAwait
    ? hasTopLevelAwait(ast.program)
    : false
  if (idiomaticFallbackReason && idiomaticMode !== 'off') {
    warnOnce(
      'idiomatic-exports-fallback',
      `Idiomatic exports disabled for this file: ${idiomaticFallbackReason}. Falling back to helper exports.`,
    )
  }
  const requireMainStrategy = opts.requireMainStrategy ?? 'import-meta-main'
  let requireMainNeedsRealpath = false
  let needsRequireResolveHelper = false
  const nestedRequireStrategy = opts.nestedRequireStrategy ?? 'create-require'
  const importMetaPreludeMode = opts.importMetaPrelude ?? 'auto'
  let importMetaRef = false

  const shouldLowerCjs = opts.target === 'commonjs' && fullTransform
  const shouldRaiseEsm = opts.target === 'module' && fullTransform
  let hoistedImports: string[] = []
  let hoistedStatements: string[] = []
  let pendingRequireTransforms: RequireTransform[] = []
  let needsCreateRequire = false
  let needsImportInterop = false
  let pendingCjsTransforms: {
    transforms: Array<ImportTransform | ExportTransform>
    needsInterop: boolean
  } | null = null

  if (shouldLowerCjs && opts.topLevelAwait === 'error' && containsTopLevelAwait) {
    throw new Error(
      'Top-level await is not supported when targeting CommonJS (set topLevelAwait to "wrap" or "preserve" to override).',
    )
  }

  if (shouldRaiseEsm) {
    const {
      transforms,
      imports,
      hoisted,
      needsCreateRequire: reqCreate,
      needsInteropHelper: reqInteropHelper,
    } = lowerCjsRequireToImports(ast.program, code, shadowedBindings)

    pendingRequireTransforms = transforms
    hoistedImports = imports
    hoistedStatements = hoisted
    needsCreateRequire = reqCreate
    needsImportInterop = reqInteropHelper
  }

  const walkState: FormatWalkState = {
    importMetaRef,
    requireMainNeedsRealpath,
    needsCreateRequire,
    needsRequireResolveHelper,
  }

  await ancestorWalk(ast.program, {
    enter: buildFormatVisitor(
      {
        code,
        opts,
        warnOnce,
        shadowedBindings,
        requireMainStrategy,
        nestedRequireStrategy,
        shouldRaiseEsm,
        fullTransform,
        useExportsBag,
        exportsMeta,
        isRequireMainMember,
        isRequireCall,
        isStaticRequire,
        isAsyncContext,
        isValidUrl,
        isIdentifierName,
        assignmentExpression,
        metaProperty,
        memberExpression,
        identifier,
      },
      walkState,
    ),
  })
  ;({
    importMetaRef,
    requireMainNeedsRealpath,
    needsCreateRequire,
    needsRequireResolveHelper,
  } = walkState)

  if (pendingRequireTransforms.length) {
    for (const t of pendingRequireTransforms) {
      code.overwrite(t.start, t.end, t.code)
    }
  }

  if (!useExportsBag && idiomaticPlan) {
    if (idiomaticPlan.exports.length === idiomaticPlan.replacements.length) {
      idiomaticPlan.replacements.forEach((rep, idx) => {
        code.overwrite(rep.start, rep.end, idiomaticPlan!.exports[idx])
      })
    } else {
      const [first, ...rest] = idiomaticPlan.replacements
      if (first) {
        code.overwrite(first.start, first.end, idiomaticPlan.exports.join('\n'))
      }
      for (const rep of rest) {
        const original = code.slice(rep.start, rep.end)
        const hasSemicolon = original.trimEnd().endsWith(';')
        code.overwrite(rep.start, rep.end, hasSemicolon ? ';' : '')
      }
    }
  }

  if (shouldLowerCjs) {
    const { importTransforms, exportTransforms, needsInterop } = lowerEsmToCjs(
      ast.program,
      code,
      opts,
      containsTopLevelAwait,
    )

    pendingCjsTransforms = {
      transforms: [...importTransforms, ...exportTransforms].sort(
        (a, b) => a.start - b.start,
      ),
      needsInterop,
    }
  }

  if (pendingCjsTransforms) {
    for (const t of pendingCjsTransforms.transforms) {
      code.overwrite(t.start, t.end, t.code)
    }

    if (pendingCjsTransforms.needsInterop) {
      code.prepend(`${interopHelper}exports.__esModule = true;\n`)
    }
  }

  if (useExportsBag && opts.target === 'module' && fullTransform && exportTable) {
    importMetaRef = exportBagToEsm({ code, exportTable, warnOnce, importMetaRef })
  }

  if (shouldRaiseEsm && fullTransform) {
    const prelude = buildEsmPrelude({
      needsCreateRequire,
      needsRequireResolveHelper,
      requireMainNeedsRealpath,
      hoistedImports,
      hoistedStatements,
      needsImportInterop,
      importMetaPreludeMode,
      importMetaRef,
      useExportsBag,
    })

    code.prepend(prelude)
  }

  if (opts.target === 'commonjs' && fullTransform && containsTopLevelAwait) {
    const body = code.toString()

    if (opts.topLevelAwait === 'wrap') {
      const tlaPromise = `const __tla = (async () => {\n${body}\nreturn module.exports;\n})();\n`
      const setPromise = `const __setTla = target => {\n  if (!target) return;\n  const type = typeof target;\n  if (type !== 'object' && type !== 'function') return;\n  target.__tla = __tla;\n};\n`
      const attach = `__setTla(module.exports);\n__tla.then(resolved => __setTla(resolved), err => { throw err; });\n`
      return `${tlaPromise}${setPromise}${attach}`
    }

    return `;(async () => {\n${body}\n})();\n`
  }

  return code.toString()
}

export { format }
