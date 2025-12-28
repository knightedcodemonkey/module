import { resolve } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'

import { specifier } from './specifier.js'
import type { Spec } from './specifier.js'
import type { TemplateLiteral } from 'oxc-parser'

import { parse } from '#parse'
import { format } from '#format'
import { getLangFromExt } from '#utils/lang.js'
import type { ModuleOptions } from './types.js'
import { resolve as pathResolve, dirname as pathDirname, extname, join } from 'node:path'
import { readFile as fsReadFile, stat } from 'node:fs/promises'
import { parse as parseModule } from '#parse'
import { walk } from '#walk'

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
    return value.replace(/(.+)\.(?:m|c)?(?:j|t)s([)'"]*)?$/, `$1${rewriteSpecifier}$2`)
  }
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
  topLevelAwait: 'error',
  out: undefined,
  inPlace: false,
} satisfies ModuleOptions
const transform = async (filename: string, options: ModuleOptions = defaultOptions) => {
  const opts = { ...defaultOptions, ...options }
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
      const rewritten = rewriteSpecifierValue(spec.value, opts.rewriteSpecifier)
      const baseValue = rewritten ?? spec.value
      const appended = appendExtensionIfNeeded(spec, appendMode, dirIndex, baseValue)

      return appended ?? rewritten ?? undefined
    })

    source = code
  }

  if (detectCycles !== 'off' && opts.target === 'module' && opts.transformSyntax) {
    await detectCircularRequireGraph(file, detectCycles, dirIndex || 'index.js')
  }

  const outputPath = opts.inPlace ? file : opts.out ? resolve(opts.out) : undefined

  if (outputPath) {
    await writeFile(outputPath, source)
  }

  return source
}

export { transform }
