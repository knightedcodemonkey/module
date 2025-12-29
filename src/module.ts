import { resolve } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'

import { specifier } from './specifier.js'
import type { Spec } from './specifier.js'
import type { TemplateLiteral } from 'oxc-parser'

import { parse } from './parse.js'
import { format } from './format.js'
import { getLangFromExt } from './utils/lang.js'
import type { ModuleOptions } from './types.js'
import { builtinModules } from 'node:module'
import { resolve as pathResolve, dirname as pathDirname, extname, join } from 'node:path'
import { readFile as fsReadFile, stat } from 'node:fs/promises'
import { parse as parseModule } from './parse.js'
import { walk } from './walk.js'

type AppendJsExtensionMode = NonNullable<ModuleOptions['appendJsExtension']>
type DetectCircularRequires = NonNullable<ModuleOptions['detectCircularRequires']>

const collapseSpecifier = (value: string) => value.replace(/['"`+)\s]|new String\(/g, '')

const builtinSpecifiers = new Set<string>(
  builtinModules
    .map(mod => (mod.startsWith('node:') ? mod.slice(5) : mod))
    .flatMap(mod => {
      const parts = mod.split('/')
      const base = parts[0]
      return parts.length > 1 ? [mod, base] : [mod]
    }),
)

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

const resolveRequirePath = async (fromFile: string, spec: string, dirIndex: string) => {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null
  const base = pathResolve(pathDirname(fromFile), spec)
  const ext = extname(base)
  const candidates: string[] = []

  if (ext) {
    candidates.push(base)
  } else {
    candidates.push(`${base}.js`, `${base}.cjs`, `${base}.mjs`)
    candidates.push(join(base, dirIndex))
  }

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate
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
    if (visiting.has(file)) {
      const cycle = [...stack, file]
      const msg = `Circular require detected: ${cycle.join(' -> ')}`
      if (mode === 'error') {
        throw new Error(msg)
      }
      // eslint-disable-next-line no-console -- surfaced when cycle detection is warn-only
      console.warn(msg)
      return
    }

    if (visited.has(file)) return
    visiting.add(file)
    stack.push(file)

    let deps = cache.get(file)
    if (!deps) {
      deps = await collectStaticRequires(file, dirIndex)
      cache.set(file, deps)
    }

    for (const dep of deps) {
      await dfs(dep, stack)
    }

    stack.pop()
    visiting.delete(file)
    visited.add(file)
  }

  await dfs(entryFile, [])
}

const defaultOptions = {
  target: 'commonjs',
  sourceType: 'auto',
  transformSyntax: true,
  liveBindings: 'strict',
  rewriteSpecifier: undefined,
  appendJsExtension: undefined,
  appendDirectoryIndex: 'index.js',
  dirFilename: 'inject',
  importMeta: 'shim',
  importMetaMain: 'shim',
  requireMainStrategy: 'import-meta-main',
  detectCircularRequires: 'off',
  requireSource: 'builtin',
  nestedRequireStrategy: 'create-require',
  cjsDefault: 'auto',
  idiomaticExports: 'safe',
  importMetaPrelude: 'auto',
  topLevelAwait: 'error',
  cwd: undefined,
  out: undefined,
  inPlace: false,
} satisfies ModuleOptions
const transform = async (filename: string, options: ModuleOptions = defaultOptions) => {
  const opts = { ...defaultOptions, ...options, filePath: filename }
  const appendMode: AppendJsExtensionMode =
    options?.appendJsExtension ?? (opts.target === 'module' ? 'relative-only' : 'off')
  const dirIndex =
    opts.appendDirectoryIndex === undefined ? 'index.js' : opts.appendDirectoryIndex
  const detectCycles: DetectCircularRequires = opts.detectCircularRequires ?? 'off'
  const file = resolve(filename)
  const code = (await readFile(file)).toString()
  const ast = parse(filename, code)
  let source = await format(code, ast, opts)

  if (opts.rewriteSpecifier || appendMode !== 'off' || dirIndex) {
    const code = await specifier.updateSrc(source, getLangFromExt(filename), spec => {
      const normalized = normalizeBuiltinSpecifier(spec.value)
      const rewritten = rewriteSpecifierValue(
        normalized ?? spec.value,
        opts.rewriteSpecifier,
      )
      const baseValue = rewritten ?? normalized ?? spec.value
      const appended = appendExtensionIfNeeded(spec, appendMode, dirIndex, baseValue)

      return appended ?? rewritten ?? normalized ?? undefined
    })

    source = code
  }

  if (detectCycles !== 'off' && opts.target === 'module' && opts.transformSyntax) {
    await detectCircularRequireGraph(file, detectCycles, dirIndex || 'index.js')
  }

  const outputBase = opts.cwd ? resolve(opts.cwd) : undefined
  const outputPath = opts.inPlace
    ? file
    : opts.out
      ? outputBase
        ? resolve(outputBase, opts.out)
        : resolve(opts.out)
      : undefined

  if (outputPath) {
    await writeFile(outputPath, source)
  }

  return source
}

export { transform }
