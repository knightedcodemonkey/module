import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'

import { parse } from './parse.js'
import { format } from './format.js'
import type { ModuleOptions } from './types.js'

/**
 * Defaults to only transforming ES module globals to CommonJS.
 */
const defaultOptions = {
  type: 'commonjs',
  out: undefined,
  modules: false,
  specifiers: undefined,
} satisfies ModuleOptions

const transform = async (filename: string, options: ModuleOptions = defaultOptions) => {
  const opts = { ...defaultOptions, ...options }
  const file = resolve(filename)
  const code = (await readFile(file)).toString()
  const ast = parse(code)

  // TODO: Support `out` option.
  return format(code, ast, opts).toString()
}

export { transform }
