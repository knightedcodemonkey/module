import { resolve } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'

import { specifier } from './specifier.js'
import type { Spec } from './specifier.js'
import type { TemplateLiteral } from 'oxc-parser'

import { parse } from './parse.js'
import {
  format,
  collectDualPackageUsage,
  dualPackageHazardDiagnostics,
  type PackageUsage,
} from './format.js'
import { getLangFromExt } from './utils/lang.js'
import type { ModuleOptions, Diagnostic } from './types.js'
import type MagicString from 'magic-string'
import type { SourceMap } from 'magic-string'
import { resolve as pathResolve, dirname as pathDirname, extname, join } from 'node:path'
import { readFile as fsReadFile, stat, realpath } from 'node:fs/promises'
import { parse as parseModule } from './parse.js'
import { walk } from './walk.js'
import { collectModuleIdentifiers } from './utils/identifiers.js'
import { builtinSpecifiers } from './utils/builtinSpecifiers.js'

type AppendJsExtensionMode = NonNullable<ModuleOptions['appendJsExtension']>
type DetectCircularRequires = NonNullable<ModuleOptions['detectCircularRequires']>

const collapseSpecifier = (value: string) => value.replace(/['"`+)\s]|new String\(/g, '')

const appendExtensionIfNeeded = (
  spec: Spec,
  mode: AppendJsExtensionMode,
  dirIndex: string | false,
  value: string = spec.value,
) => {
  if (mode === 'off') return

  if (spec.type === 'TemplateLiteral') {
    const node = spec.node as TemplateLiteral
    if (node.expressions.length > 0) return
  } else if (spec.type !== 'StringLiteral') {
    return
  }

  const collapsed = collapseSpecifier(value)
  const isRelative = /^(?:\.\.?)\//.test(collapsed)
  if (!isRelative) return

  const base = collapsed.split(/[?#]/)[0]
  if (!base) return

  if (base.endsWith('/')) {
    if (!dirIndex) return
    return `${value}${dirIndex}`
  }

  const lastSegment = base.split('/').pop() ?? ''
  if (lastSegment.includes('.')) return

  return `${value}.js`
}

const rewriteSpecifierValue = (
  value: string,
  rewriteSpecifier: ModuleOptions['rewriteSpecifier'],
) => {
  if (!rewriteSpecifier) return

  if (typeof rewriteSpecifier === 'function') {
    return rewriteSpecifier(value) ?? undefined
  }

  const collapsed = collapseSpecifier(value)
  const relative = /^(?:\.\.?)\//

  if (relative.test(collapsed)) {
    return value.replace(/(.+)\.(?:m|c)?(?:j|t)sx?([)'"]*)?$/, `$1${rewriteSpecifier}$2`)
  }
}

const normalizeBuiltinSpecifier = (value: string) => {
  const collapsed = collapseSpecifier(value)
  if (!collapsed) return

  const specPart = collapsed.split(/[?#]/)[0] ?? ''

  // Ignore relative and absolute paths.
  if (/^(?:\.\.?\/|\/)/.test(specPart)) return

  // Skip other protocols (e.g., http:, data:) but allow node:.
  if (/^[a-zA-Z][a-zA-Z+.-]*:/.test(specPart) && !specPart.startsWith('node:')) return

  const bare = specPart.startsWith('node:') ? specPart.slice(5) : specPart
  const base = bare.split('/')[0] ?? ''

  if (!builtinSpecifiers.has(bare) && !builtinSpecifiers.has(base)) return
  if (specPart.startsWith('node:')) return

  const quote = /^['"`]/.exec(value)?.[0] ?? ''
  return quote ? `${quote}node:${value.slice(quote.length)}` : `node:${value}`
}

const fileExists = async (candidate: string) => {
  try {
    const s = await stat(candidate)
    return s.isFile()
  } catch {
    return false
  }
}

const normalizePath = async (p: string) => pathResolve(await realpath(p).catch(() => p))

const resolveRequirePath = async (fromFile: string, spec: string, dirIndex: string) => {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null
  const base = pathResolve(pathDirname(fromFile), spec)
  const ext = extname(base)
  const candidates: string[] = []

  if (ext) {
    candidates.push(base)
  } else {
    candidates.push(
      `${base}.js`,
      `${base}.cjs`,
      `${base}.mjs`,
      `${base}.ts`,
      `${base}.mts`,
      `${base}.cts`,
    )
    candidates.push(join(base, dirIndex))
  }

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return await normalizePath(candidate)
  }

  return null
}

const collectStaticRequires = async (filePath: string, dirIndex: string) => {
  const src = await fsReadFile(filePath, 'utf8')
  const ast = parseModule(filePath, src)
  const specs: string[] = []

  await walk(ast.program, {
    enter(node) {
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'require' &&
        node.arguments.length === 1 &&
        node.arguments[0].type === 'Literal' &&
        typeof node.arguments[0].value === 'string'
      ) {
        const spec = node.arguments[0].value
        if (spec.startsWith('./') || spec.startsWith('../')) {
          specs.push(spec)
        }
      }
    },
  })

  const resolved: string[] = []
  for (const spec of specs) {
    const target = await resolveRequirePath(filePath, spec, dirIndex)
    if (target) resolved.push(target)
  }

  return resolved
}

const detectCircularRequireGraph = async (
  entryFile: string,
  mode: DetectCircularRequires,
  dirIndex: string,
) => {
  const cache = new Map<string, string[]>()
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const dfs = async (file: string, stack: string[]) => {
    const normalized = await normalizePath(file)

    if (visiting.has(normalized)) {
      const cycle = [...stack, normalized]
      const msg = `Circular require detected: ${cycle.join(' -> ')}`
      if (mode === 'error') {
        throw new Error(msg)
      }
      // eslint-disable-next-line no-console -- surfaced when cycle detection is warn-only
      console.warn(msg)
      return
    }

    if (visited.has(normalized)) return
    visiting.add(normalized)
    stack.push(normalized)

    let deps = cache.get(normalized)
    if (!deps) {
      deps = await collectStaticRequires(normalized, dirIndex)
      cache.set(normalized, deps)
    }

    for (const dep of deps) {
      await dfs(dep, stack)
    }

    stack.pop()
    visiting.delete(normalized)
    visited.add(normalized)
  }

  await dfs(await normalizePath(entryFile), [])
}

const mergeUsageMaps = (
  target: Map<string, PackageUsage>,
  source: Map<string, PackageUsage>,
) => {
  for (const [pkg, usage] of source) {
    const existing = target.get(pkg) ?? { imports: [], requires: [] }
    existing.imports.push(...usage.imports)
    existing.requires.push(...usage.requires)
    target.set(pkg, existing)
  }
}

const collectProjectDualPackageHazards = async (files: string[], opts: ModuleOptions) => {
  const hazardMode = opts.detectDualPackageHazard ?? 'warn'

  if (hazardMode === 'off') return new Map<string, Diagnostic[]>()

  const hazardLevel = hazardMode === 'error' ? 'error' : 'warning'
  const usages = new Map<string, PackageUsage>()
  const manifestCache = new Map<string, any | null>()

  for (const file of files) {
    const code = await readFile(file, 'utf8')
    const ast = parseModule(file, code)
    const moduleIdentifiers = await collectModuleIdentifiers(ast.program)
    const shadowedBindings = new Set(
      [...moduleIdentifiers.entries()]
        .filter(([, meta]) => meta.declare.length > 0)
        .map(([name]) => name),
    )
    const perFileUsage = await collectDualPackageUsage(
      ast.program,
      shadowedBindings,
      file,
    )

    mergeUsageMaps(usages, perFileUsage)
  }

  const diags = await dualPackageHazardDiagnostics({
    usages,
    hazardLevel,
    cwd: opts.cwd,
    manifestCache,
  })
  const byFile = new Map<string, Diagnostic[]>()

  for (const diag of diags) {
    const key = diag.filePath ?? files[0]
    const existing = byFile.get(key) ?? []

    existing.push(diag)
    byFile.set(key, existing)
  }

  return byFile
}

const createDefaultOptions = (): ModuleOptions => ({
  target: 'commonjs',
  sourceType: 'auto',
  transformSyntax: true,
  liveBindings: 'strict',
  rewriteSpecifier: undefined,
  rewriteTemplateLiterals: 'allow',
  appendJsExtension: undefined,
  appendDirectoryIndex: 'index.js',
  dirFilename: 'inject',
  importMeta: 'shim',
  importMetaMain: 'shim',
  requireMainStrategy: 'import-meta-main',
  detectCircularRequires: 'off',
  detectDualPackageHazard: 'warn',
  dualPackageHazardScope: 'file',
  requireSource: 'builtin',
  nestedRequireStrategy: 'create-require',
  cjsDefault: 'auto',
  idiomaticExports: 'safe',
  importMetaPrelude: 'auto',
  topLevelAwait: 'error',
  sourceMap: false,
  cwd: undefined,
  out: undefined,
  inPlace: false,
})
function transform(
  filename: string,
  options: ModuleOptions & { sourceMap: true },
): Promise<{ code: string; map: SourceMap }>
function transform(
  filename: string,
  options?: ModuleOptions & { sourceMap?: false | undefined },
): Promise<string>
function transform(
  filename: string,
  options?: ModuleOptions,
): Promise<string | { code: string; map: SourceMap }>
async function transform(filename: string, options?: ModuleOptions) {
  const base = createDefaultOptions()
  const opts = options
    ? { ...base, ...options, filePath: filename }
    : { ...base, filePath: filename }
  const cwdBase = opts.cwd ? resolve(opts.cwd) : process.cwd()
  const appendMode: AppendJsExtensionMode =
    options?.appendJsExtension ?? (opts.target === 'module' ? 'relative-only' : 'off')
  const dirIndex =
    opts.appendDirectoryIndex === undefined ? 'index.js' : opts.appendDirectoryIndex
  const detectCycles: DetectCircularRequires = opts.detectCircularRequires ?? 'off'
  const file = resolve(cwdBase, filename)
  const code = (await readFile(file)).toString()
  const ast = parse(filename, code)
  let sourceCode: MagicString | null = null
  let source: string

  if (opts.sourceMap) {
    sourceCode = await format(code, ast, { ...opts, sourceMap: true })
    source = sourceCode.toString()
  } else {
    source = await format(code, ast, opts)
  }

  if (opts.rewriteSpecifier || appendMode !== 'off' || dirIndex) {
    const applyRewrite = (spec: any) => {
      if (
        spec.type === 'TemplateLiteral' &&
        opts.rewriteTemplateLiterals === 'static-only'
      ) {
        const node = spec.node as TemplateLiteral
        if (node.expressions.length > 0) return
      }
      const normalized = normalizeBuiltinSpecifier(spec.value)
      const rewritten = rewriteSpecifierValue(
        normalized ?? spec.value,
        opts.rewriteSpecifier,
      )
      const baseValue = rewritten ?? normalized ?? spec.value
      const appended = appendExtensionIfNeeded(spec, appendMode, dirIndex, baseValue)

      return appended ?? rewritten ?? normalized ?? undefined
    }

    if (opts.sourceMap && sourceCode) {
      await specifier.updateMagicString(sourceCode, code, ast, applyRewrite)
      source = sourceCode.toString()
    } else {
      const rewritten = await specifier.updateSrc(
        source,
        getLangFromExt(filename),
        applyRewrite,
      )
      source = rewritten
    }
  }

  if (detectCycles !== 'off' && opts.target === 'module' && opts.transformSyntax) {
    await detectCircularRequireGraph(file, detectCycles, dirIndex || 'index.js')
  }

  const outputPath = opts.inPlace
    ? file
    : opts.out
      ? resolve(cwdBase, opts.out)
      : undefined

  if (outputPath) {
    await writeFile(outputPath, source)
  }

  if (opts.sourceMap && sourceCode) {
    const map = sourceCode.generateMap({
      hires: true,
      includeContent: true,
      file: outputPath ?? filename,
      source: opts.filePath ?? filename,
    })

    return { code: source, map }
  }

  return source
}

export { transform, collectProjectDualPackageHazards }
