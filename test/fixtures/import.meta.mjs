import.meta

const filename = import.meta
const a = [import.meta, 'foo']

if (import.meta === process.argv[1]) {
  thing.import.meta = filename
  thing.import.meta.url = filename
  other.thing.import.meta = 'test'
}

const baz = function importMetaUrl(arg, ...rest) {
  return rest
}
function bar() {
  const fn = import.meta

  return fn
}
const foo = () => {
  const fn = import.meta

  return fn
}
;(arg => {
  return arg
})(import.meta)

foo(import.meta)
bar.call(this, import.meta)
baz.apply(null, [import.meta, a])
