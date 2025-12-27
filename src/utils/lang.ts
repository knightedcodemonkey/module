import { extname } from 'node:path'
import type { ParserOptions } from 'oxc-parser'

// Determine language from filename extension for specifier rewrite.
const getLangFromExt = (filename: string): ParserOptions['lang'] | undefined => {
  const ext = extname(filename).toLowerCase()

  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    return 'js'
  }

  if (ext === '.ts' || ext === '.mts' || ext === '.cts') {
    return 'ts'
  }

  if (ext === '.tsx') {
    return 'tsx'
  }

  if (ext === '.jsx') {
    return 'jsx'
  }
}

export { getLangFromExt }
