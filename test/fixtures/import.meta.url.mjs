import.meta.url
import.meta.url = 'foo'
import.meta.url = 'file:///some/path/to/file.js'

const filename = import.meta.url
const a = [import.meta.url, 'foo']
const obj = new String(import.meta.url + 'foo')

if (import.meta.url === process.argv[1]) {
  thing.import.meta.url = filename
  other.thing.import.meta.url = 'test'
}

import.meta.url + 'foo'

const baz = function importMetaUrl(arg, ...rest) {
  return rest
}
function bar() {
  const fn = import.meta.url

  return fn
}
const foo = () => {
  const fn = import.meta.url
  return `${import.meta.url}${fn}`
}
;(arg => {
  return arg
})(import.meta.url)

foo(import.meta.url)
foo(`${import.meta.url}foo`)
bar.call(this, import.meta.url)
baz.apply(null, [import.meta.url, a])
