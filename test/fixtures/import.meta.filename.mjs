import.meta.filename
import.meta.filename = 'foo'
import.meta.filename = 'file:///some/path/to/file.js'

const filename = import.meta.filename
const a = [import.meta.filename, 'foo']
const obj = new String(import.meta.filename + 'foo')

if (import.meta.filename === process.argv[1]) {
  thing.import.meta.filename = filename
  other.thing.import.meta.filename = 'test'
}

import.meta.filename + 'foo'

const baz = function importMetaFilename(arg, ...rest) {
  return rest
}
function bar() {
  const fn = import.meta.filename

  return fn
}
const foo = () => {
  const fn = import.meta.filename
  return `${import.meta.filename}${fn}`
}
;(arg => {
  return arg
})(import.meta.filename)

foo(import.meta.filename)
foo(`${import.meta.filename}foo`)
bar.call(this, import.meta.filename)
baz.apply(null, [import.meta.filename, a])
