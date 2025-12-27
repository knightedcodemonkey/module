import { extname } from 'node:path'
import type { Specifier } from '@knighted/specifier'

// Determine language from filename extension for specifier rewrite.
type UpdateSrcLang = Parameters<Specifier['updateSrc']>[1]
const getLangFromExt = (filename: string): UpdateSrcLang => {
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
