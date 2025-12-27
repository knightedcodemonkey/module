import { add, inc } from './lib.mjs'

const boot = await Promise.resolve(2)

export const ready = boot
export const run = async () => {
  const next = inc()
  return { sum: add(boot, 0), after: next, main: import.meta.main ?? false }
}

if (import.meta.main) {
  run().then(res => console.log(JSON.stringify(res)))
}
