import { resolve } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'

import { specifier } from '@knighted/specifier'

import { parse } from './parse.js'
import { format } from './format.js'
import type { ModuleOptions } from './types.js'

const defaultOptions = {
  type: 'commonjs',
  out: undefined,
  modules: false,
  specifier: undefined,
} satisfies ModuleOptions

const transform = async (filename: string, options: ModuleOptions = defaultOptions) => {
  const opts = { ...defaultOptions, ...options }
  const file = resolve(filename)
  const code = (await readFile(file)).toString()
  const ast = parse(code)
  let source = format(code, ast, opts).toString()

  if (options.specifier) {
    const { code, error } = await specifier.updateSrc(source, ({ value }) => {
      // Collapse any BinaryExpression or NewExpression to test for a relative specifier
      const collapsed = value.replace(/['"`+)\s]|new String\(/g, '')
      const relative = /^(?:\.|\.\.)\//

      if (relative.test(collapsed)) {
        // $2 is for any closing quotation/parens around BE or NE
        return value.replace(/(.+)\.(?:m|c)?(?:j|t)s([)'"`]*)?$/, `$1${options.specifier}$2`)
      }
    })

    if (code && !error) {
      source = code
    }
  }

  if (opts.out) {
    await writeFile(resolve(opts.out), source)
  }

  return source
}

export { transform }
