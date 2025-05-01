import.meta.dirname
import.meta.dirname = 'foo'
import.meta.dirname = 'file:///some/path/to/file.js'

const filename = import.meta.dirname
const a = [import.meta.dirname, 'foo']
const obj = new String(import.meta.dirname + 'foo')

if (import.meta.dirname === process.argv[1]) {
  thing.import.meta.dirname = filename
  other.thing.import.meta.dirname = 'test'
}

import.meta.dirname + 'foo'

const baz = function importMetaFilename(arg, ...rest) {
  return rest
}
function bar() {
  const fn = import.meta.dirname

  return fn
}
const foo = () => {
  const fn = import.meta.dirname
  return `${import.meta.dirname}${fn}`
}
;(arg => {
  return arg
})(import.meta.dirname)

foo(import.meta.dirname)
foo(`${import.meta.dirname}foo`)
bar.call(this, import.meta.dirname)
baz.apply(null, [import.meta.dirname, a])
