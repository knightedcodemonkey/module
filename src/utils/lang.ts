import { extname } from 'node:path'
import type { Specifier } from '@knighted/specifier'

// Determine language from filename extension for specifier rewrite.
type UpdateSrcLang = Parameters<Specifier['updateSrc']>[1]
const getLangFromExt = (filename: string): UpdateSrcLang => {
  const ext = extname(filename)

  if (ext.endsWith('.js')) {
    return 'js'
  }

  if (ext.endsWith('.ts')) {
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
