import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'

import { parse } from './parse.js'
import { format } from './format.js'
import type { ModuleOptions } from './types.js'

const defaultOptions = {
  type: 'commonjs',
  out: undefined,
  moduleLoading: false,
  specifiers: undefined,
} satisfies ModuleOptions

/**
 * Transforms a file from one Node.js module system to another based on options.
 * Module globals, for example import.meta, __dirname, __filename, etc. are always transformed.
 * However, the CommonJS `module` object is not transformed, for instance `module.path`, `module.children`, etc.,
 * with the exception of `module.exports` which is converted when `loading` is set to `true`.
 */
const transform = async (filename: string, options: ModuleOptions = defaultOptions) => {
  const opts = { ...defaultOptions, ...options }
  const file = resolve(filename)
  const code = (await readFile(file)).toString()
  const ast = parse(code)

  return format(code, ast, opts).toString()
}

export { transform }
