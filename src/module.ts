import { resolve } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'

import { specifier } from '@knighted/specifier'

import { parse } from './parse.js'
import { format } from './format.js'
import { getLangFromExt } from './utils.js'
import type { ModuleOptions } from './types.js'

const defaultOptions = {
  target: 'commonjs',
  sourceType: 'auto',
  transformSyntax: true,
  liveBindings: 'strict',
  rewriteSpecifier: undefined,
  dirFilename: 'inject',
  importMeta: 'shim',
  requireSource: 'builtin',
  cjsDefault: 'auto',
  topLevelAwait: 'error',
  out: undefined,
  inPlace: false,
} satisfies ModuleOptions
const transform = async (filename: string, options: ModuleOptions = defaultOptions) => {
  const opts = { ...defaultOptions, ...options }
  const file = resolve(filename)
  const code = (await readFile(file)).toString()
  const ast = parse(filename, code)
  let source = await format(code, ast, opts)

  if (opts.rewriteSpecifier) {
    const code = await specifier.updateSrc(
      source,
      getLangFromExt(filename),
      ({ value }) => {
        if (typeof opts.rewriteSpecifier === 'function') {
          return opts.rewriteSpecifier(value) ?? undefined
        }

        // Collapse any BinaryExpression or NewExpression to test for a relative specifier
        const collapsed = value.replace(/['"`+)\s]|new String\(/g, '')
        const relative = /^(?:\.|\.\.)\//

        if (relative.test(collapsed)) {
          // $2 is for any closing quotation/parens around BE or NE
          return value.replace(
            /(.+)\.(?:m|c)?(?:j|t)s([)'"]*)?$/,
            `$1${opts.rewriteSpecifier}$2`,
          )
        }
      },
    )

    source = code
  }

  const outputPath = opts.inPlace ? file : opts.out ? resolve(opts.out) : undefined

  if (outputPath) {
    await writeFile(outputPath, source)
  }

  return source
}

export { transform }
