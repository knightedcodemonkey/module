import.meta.resolve
const path = import.meta.resolve('./values.cjs')

const filename = import.meta.resolve
const a = [import.meta.resolve, 'foo']

if (import.meta.resolve('./values.cjs') === process.argv[1]) {
  thing.import.meta.resolve = filename
  other.thing.import.meta.resolve = 'test'
}

import.meta.resolve + 'foo'

const baz = function importMetaResolve(arg, ...rest) {
  return rest
}
function bar() {
  const fn = import.meta.resolve

  return fn
}
const foo = () => {
  const fn = import.meta.resolve
  return `${import.meta.resolve}${fn}`
}
;(arg => {
  return arg
})(import.meta.resolve)

foo(import.meta.resolve)
bar.call(this, import.meta.resolve)
baz.apply(null, [import.meta.resolve, a])

import.meta.resolve = () => {
  return import.meta.resolve
}
import.meta.resolve = 'file:///some/path/to/file.js'
