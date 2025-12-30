import { builtinModules } from 'node:module'
import { dirname, join, resolve as pathResolve } from 'node:path'
import { readFile as fsReadFile, stat as fsStat } from 'node:fs/promises'
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

const builtinSpecifiers = new Set<string>(
  builtinModules
    .map(mod => (mod.startsWith('node:') ? mod.slice(5) : mod))
    .flatMap(mod => {
      const parts = mod.split('/')
      const base = parts[0]
      return parts.length > 1 ? [mod, base] : [mod]
    }),
)

const stripQuery = (value: string) =>
  value.includes('?') || value.includes('#') ? (value.split(/[?#]/)[0] ?? value) : value

const packageFromSpecifier = (spec: string) => {
  const cleaned = stripQuery(spec)
  if (!cleaned) return null
  if (cleaned.startsWith('node:')) return null
  if (/^(?:\.?\.?\/|\/)/.test(cleaned)) return null
  if (/^[a-zA-Z][a-zA-Z+.-]*:/.test(cleaned)) return null

  const parts = cleaned.split('/')

  if (cleaned.startsWith('@')) {
    if (parts.length < 2) return null
    const pkg = `${parts[0]}/${parts[1]}`
    if (builtinSpecifiers.has(pkg) || builtinSpecifiers.has(parts[1] ?? '')) return null
    const subpath = parts.slice(2).join('/')
    return { pkg, subpath }
  }

  const pkg = parts[0] ?? ''
  if (!pkg || builtinSpecifiers.has(pkg)) return null
  const subpath = parts.slice(1).join('/')
  return { pkg, subpath }
}

const fileExists = async (filename: string) => {
  try {
    const stats = await fsStat(filename)
    return stats.isFile()
  } catch {
    return false
  }
}

const findPackageManifest = async (
  pkg: string,
  filePath: string | undefined,
  cwd: string | undefined,
) => {
  const startDir = filePath
    ? dirname(pathResolve(filePath))
    : pathResolve(cwd ?? process.cwd())
  const seen = new Set<string>()
  let dir = startDir

  while (!seen.has(dir)) {
    seen.add(dir)
    const candidate = join(dir, 'node_modules', pkg, 'package.json')
    if (await fileExists(candidate)) return candidate

    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return null
}

const readPackageManifest = async (
  pkg: string,
  filePath: string | undefined,
  cwd: string | undefined,
  cache: Map<string, any | null>,
) => {
  const start = pathResolve(filePath ? dirname(filePath) : (cwd ?? process.cwd()))
  const cacheKey = `${pkg}@${start}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const manifestPath = await findPackageManifest(pkg, filePath, cwd)
  if (!manifestPath) {
    cache.set(cacheKey, null)
    return null
  }

  try {
    const raw = await fsReadFile(manifestPath, 'utf8')
    const json = JSON.parse(raw)
    cache.set(cacheKey, json)
    return json
  } catch {
    cache.set(cacheKey, null)
    return null
  }
}

const analyzeExportsTargets = (exportsField: unknown) => {
  const root =
    exportsField && typeof exportsField === 'object' && !Array.isArray(exportsField)
      ? // @ts-expect-error -- loose lookup of root export condition
        (exportsField['.'] ?? exportsField)
      : exportsField

  if (typeof root === 'string') {
    return { importTarget: root, requireTarget: root }
  }

  if (root && typeof root === 'object') {
    const record = root as Record<string, unknown>
    const importTarget = typeof record.import === 'string' ? record.import : undefined
    const requireTarget = typeof record.require === 'string' ? record.require : undefined
    const defaultTarget = typeof record.default === 'string' ? record.default : undefined

    return {
      importTarget: importTarget ?? defaultTarget,
      requireTarget: requireTarget ?? defaultTarget,
    }
  }

  return { importTarget: undefined, requireTarget: undefined }
}

const describeDualPackage = (pkgJson: any) => {
  const { importTarget, requireTarget } = analyzeExportsTargets(pkgJson?.exports)
  const moduleField = typeof pkgJson?.module === 'string' ? pkgJson.module : undefined
  const mainField = typeof pkgJson?.main === 'string' ? pkgJson.main : undefined
  const typeField = typeof pkgJson?.type === 'string' ? pkgJson.type : undefined

  const divergentExports = importTarget && requireTarget && importTarget !== requireTarget
  const divergentModuleMain = moduleField && mainField && moduleField !== mainField
  const typeModuleMainCjs =
    typeField === 'module' && typeof mainField === 'string' && mainField.endsWith('.cjs')

  const hasHazardSignals = divergentExports || divergentModuleMain || typeModuleMainCjs

  const details: string[] = []
  if (divergentExports) {
    details.push(`exports import -> ${importTarget}, require -> ${requireTarget}`)
  }
  if (divergentModuleMain) {
    details.push(`module -> ${moduleField}, main -> ${mainField}`)
  }
  if (typeModuleMainCjs) {
    details.push(`type: module with CommonJS main (${mainField})`)
  }

  return { hasHazardSignals, details, importTarget, requireTarget }
}

type HazardLevel = 'warning' | 'error'

export type PackageUse = {
  spec: string
  subpath: string
  loc?: { start: number; end: number }
  filePath?: string
}

export type PackageUsage = {
  imports: PackageUse[]
  requires: PackageUse[]
}

const recordUsage = (
  usages: Map<string, PackageUsage>,
  pkg: string,
  kind: 'import' | 'require',
  spec: string,
  subpath: string,
  loc?: { start: number; end: number },
  filePath?: string,
) => {
  const existing = usages.get(pkg) ?? { imports: [], requires: [] }
  const bucket = kind === 'import' ? existing.imports : existing.requires

  bucket.push({ spec, subpath, loc, filePath })
  usages.set(pkg, existing)
}

const collectDualPackageUsage = async (
  program: Node,
  shadowedBindings: Set<string>,
  filePath?: string,
) => {
  const usages = new Map<string, PackageUsage>()

  await ancestorWalk(program, {
    enter(node) {
      if (
        node.type === 'ImportDeclaration' &&
        node.source.type === 'Literal' &&
        typeof node.source.value === 'string'
      ) {
        const pkg = packageFromSpecifier(node.source.value)
        if (pkg)
          recordUsage(
            usages,
            pkg.pkg,
            'import',
            node.source.value,
            pkg.subpath,
            { start: node.source.start, end: node.source.end },
            filePath,
          )
      }

      if (
        node.type === 'ExportNamedDeclaration' &&
        node.source &&
        node.source.type === 'Literal' &&
        typeof node.source.value === 'string'
      ) {
        const pkg = packageFromSpecifier(node.source.value)
        if (pkg)
          recordUsage(
            usages,
            pkg.pkg,
            'import',
            node.source.value,
            pkg.subpath,
            { start: node.source.start, end: node.source.end },
            filePath,
          )
      }

      if (
        node.type === 'ExportAllDeclaration' &&
        node.source.type === 'Literal' &&
        typeof node.source.value === 'string'
      ) {
        const pkg = packageFromSpecifier(node.source.value)
        if (pkg)
          recordUsage(
            usages,
            pkg.pkg,
            'import',
            node.source.value,
            pkg.subpath,
            { start: node.source.start, end: node.source.end },
            filePath,
          )
      }

      if (
        node.type === 'ImportExpression' &&
        node.source.type === 'Literal' &&
        typeof node.source.value === 'string'
      ) {
        const pkg = packageFromSpecifier(node.source.value)
        if (pkg)
          recordUsage(
            usages,
            pkg.pkg,
            'import',
            node.source.value,
            pkg.subpath,
            { start: node.source.start, end: node.source.end },
            filePath,
          )
      }

      if (node.type === 'CallExpression' && isStaticRequire(node, shadowedBindings)) {
        const arg = node.arguments[0]
        if (arg?.type === 'Literal' && typeof arg.value === 'string') {
          const pkg = packageFromSpecifier(arg.value)
          if (pkg)
            recordUsage(
              usages,
              pkg.pkg,
              'require',
              arg.value,
              pkg.subpath,
              {
                start: arg.start,
                end: arg.end,
              },
              filePath,
            )
        }
      }
    },
  })

  return usages
}

const dualPackageHazardDiagnostics = async (params: {
  usages: Map<string, PackageUsage>
  hazardLevel: HazardLevel
  filePath?: string
  cwd?: string
  manifestCache?: Map<string, any | null>
}) => {
  const { usages, hazardLevel, filePath, cwd } = params
  const manifestCache = params.manifestCache ?? new Map<string, any | null>()
  const diags: Diagnostic[] = []

  for (const [pkg, usage] of usages) {
    const hasImport = usage.imports.length > 0
    const hasRequire = usage.requires.length > 0
    const combined = [...usage.imports, ...usage.requires]
    const hasRoot = combined.some(entry => !entry.subpath)
    const hasSubpath = combined.some(entry => Boolean(entry.subpath))
    const origin = usage.imports[0] ?? usage.requires[0]
    const diagFile = origin?.filePath ?? filePath

    if (hasImport && hasRequire) {
      const importSpecs = usage.imports.map(u =>
        u.subpath ? `${pkg}/${u.subpath}` : pkg,
      )
      const requireSpecs = usage.requires.map(u =>
        u.subpath ? `${pkg}/${u.subpath}` : pkg,
      )

      diags.push({
        level: hazardLevel,
        code: 'dual-package-mixed-specifiers',
        message: `Package '${pkg}' is loaded via import (${importSpecs.join(', ')}) and require (${requireSpecs.join(', ')}); conditional exports can instantiate it twice.`,
        filePath: diagFile,
        loc: origin?.loc,
      })
    }

    if (hasRoot && hasSubpath) {
      const subpaths = combined
        .filter(entry => entry.subpath)
        .map(entry => `${pkg}/${entry.subpath}`)
      const originSubpath = combined.find(entry => entry.subpath) ?? combined[0]
      diags.push({
        level: hazardLevel,
        code: 'dual-package-subpath',
        message: `Package '${pkg}' is referenced via root specifier '${pkg}' and subpath(s) ${subpaths.join(', ')}; mixing them loads separate module instances.`,
        filePath: originSubpath?.filePath ?? filePath,
        loc: originSubpath?.loc,
      })
    }

    if (hasImport && hasRequire) {
      const manifest = await readPackageManifest(pkg, diagFile, cwd, manifestCache)
      if (manifest) {
        const meta = describeDualPackage(manifest)
        if (meta.hasHazardSignals) {
          const detail = meta.details.length ? ` (${meta.details.join('; ')})` : ''
          diags.push({
            level: hazardLevel,
            code: 'dual-package-conditional-exports',
            message: `Package '${pkg}' exposes different entry points for import vs require${detail}. Mixed usage can produce distinct instances.`,
            filePath: diagFile,
            loc: origin?.loc,
          })
        }
      }
    }
  }

  return diags
}

const detectDualPackageHazards = async (params: {
  program: Node
  shadowedBindings: Set<string>
  hazardLevel: HazardLevel
  filePath?: string
  cwd?: string
  diagOnce: (
    level: HazardLevel,
    codeId: string,
    message: string,
    loc?: { start: number; end: number },
  ) => void
}) => {
  const { program, shadowedBindings, hazardLevel, filePath, cwd, diagOnce } = params
  const manifestCache = new Map<string, any | null>()
  const usages = await collectDualPackageUsage(program, shadowedBindings, filePath)
  const diags = await dualPackageHazardDiagnostics({
    usages,
    hazardLevel,
    filePath,
    cwd,
    manifestCache,
  })

  for (const diag of diags) {
    diagOnce(diag.level, diag.code, diag.message, diag.loc)
  }
}

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
  const diagOnce = (
    level: Diagnostic['level'],
    codeId: string,
    message: string,
    loc?: { start: number; end: number },
  ) => {
    const key = `${level}:${codeId}:${loc?.start ?? ''}`
    if (warned.has(key)) return
    warned.add(key)
    emitDiagnostic({ level, code: codeId, message, filePath: opts.filePath, loc })
  }
  const warnOnce: WarnOnce = (
    codeId: string,
    message: string,
    loc?: { start: number; end: number },
  ) => diagOnce('warning', codeId, message, loc)
  const transformMode = opts.transformSyntax
  const fullTransform = transformMode === true
  const moduleIdentifiers = await collectModuleIdentifiers(ast.program)
  const shadowedBindings = new Set(
    [...moduleIdentifiers.entries()]
      .filter(([, meta]) => meta.declare.length > 0)
      .map(([name]) => name),
  )

  const hazardMode = opts.detectDualPackageHazard ?? 'warn'
  if (hazardMode !== 'off') {
    const hazardLevel: HazardLevel = hazardMode === 'error' ? 'error' : 'warning'
    await detectDualPackageHazards({
      program: ast.program,
      shadowedBindings,
      hazardLevel,
      filePath: opts.filePath,
      cwd: opts.cwd,
      diagOnce,
    })
  }

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

export { format, collectDualPackageUsage, dualPackageHazardDiagnostics }
