import { resolve } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'

import { specifier } from './specifier.js'
import type { Spec } from './specifier.js'
import type { TemplateLiteral } from 'oxc-parser'

import { parse } from '#parse'
import { format } from '#format'
import { getLangFromExt } from '#utils/lang.js'
import type { ModuleOptions } from './types.js'

type AppendJsExtensionMode = NonNullable<ModuleOptions['appendJsExtension']>

const collapseSpecifier = (value: string) => value.replace(/['"`+)\s]|new String\(/g, '')

const appendExtensionIfNeeded = (
  spec: Spec,
  mode: AppendJsExtensionMode,
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
  const isBare = !isRelative && !/^([a-zA-Z][a-zA-Z0-9+.-]*:|\/)/.test(collapsed)

  if (mode === 'relative-only' && !isRelative) return
  if (mode === 'all' && !(isRelative || isBare)) return

  const base = collapsed.split(/[?#]/)[0]
  if (!base || base.endsWith('/')) return

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

const defaultOptions = {
  target: 'commonjs',
  sourceType: 'auto',
  transformSyntax: true,
  liveBindings: 'strict',
  rewriteSpecifier: undefined,
  appendJsExtension: undefined,
  dirFilename: 'inject',
  importMeta: 'shim',
  importMetaMain: 'shim',
  requireSource: 'builtin',
  cjsDefault: 'auto',
  topLevelAwait: 'error',
  out: undefined,
  inPlace: false,
} satisfies ModuleOptions
const transform = async (filename: string, options: ModuleOptions = defaultOptions) => {
  const opts = { ...defaultOptions, ...options }
  const appendMode: AppendJsExtensionMode =
    options?.appendJsExtension ?? (opts.target === 'module' ? 'relative-only' : 'off')
  const file = resolve(filename)
  const code = (await readFile(file)).toString()
  const ast = parse(filename, code)
  let source = await format(code, ast, opts)

  if (opts.rewriteSpecifier || appendMode !== 'off') {
    const code = await specifier.updateSrc(source, getLangFromExt(filename), spec => {
      const rewritten = rewriteSpecifierValue(spec.value, opts.rewriteSpecifier)
      const baseValue = rewritten ?? spec.value
      const appended = appendExtensionIfNeeded(spec, appendMode, baseValue)

      return appended ?? rewritten ?? undefined
    })

    source = code
  }

  const outputPath = opts.inPlace ? file : opts.out ? resolve(opts.out) : undefined

  if (outputPath) {
    await writeFile(outputPath, source)
  }

  return source
}

export { transform }
