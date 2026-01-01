import { builtinModules } from 'node:module'

const builtinSpecifiers = new Set<string>(
  builtinModules
    .map(mod => (mod.startsWith('node:') ? mod.slice(5) : mod))
    .flatMap(mod => {
      const parts = mod.split('/')
      const base = parts[0]
      return parts.length > 1 ? [mod, base] : [mod]
    }),
)

export { builtinSpecifiers }
