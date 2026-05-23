// Complex ESM fixture combining common patterns
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { dirname, filename } from './meta.mjs'
import * as helpers from './values.mjs'
export * from './reexport.mjs'

export const base = 'esm'
export const extra = 'kept'

// live binding through direct named export
export let counter = 0
export function bump() {
  counter += 1
  return counter
}

const resolvedValue =
  typeof import.meta.resolve === 'function'
    ? import.meta.resolve('./values.mjs')
    : new URL('./values.mjs', import.meta.url).href

export const resolved = resolvedValue
export const url = import.meta.url
export { dirname, filename }

export async function load(name) {
  const mod = await import(pathToFileURL(join(dirname, name)).href)
  return mod.default ?? mod
}

export const aliasTarget = helpers
export const aliased = 'ok'

const key = 'weird-key'
export const computedKey = key
export const computedValue = 'strange'

export const file = readFileSync(join(dirname, 'values.mjs'))
  .toString()
  .includes('module')
