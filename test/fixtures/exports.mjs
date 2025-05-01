let __exports = {}
__exports

const filename = __exports
const other = __exports.other ?? {}
const a = [__exports, 'foo']
const obj = new String(__exports + 'foo')
const thing = {}

thing.__exports = 'boo'

if (__exports === process.argv[1]) {
  thing.__exports = filename
  other.thing.__exports = 'test'
}

__exports + 'foo'

function bar(exports) {
  const fn = exports

  return fn
}
const foo = exports => {
  const fn = exports
  const other = module.exports.other
  return `${exports}${fn}${other}`
}
;(arg => {
  return arg
})(__exports)
const baz = function exports(arg, ...rest) {
  return rest
}

foo(__exports)
foo(`${__exports}foo`)
bar.call(this, __exports)
baz.apply(null, [__exports, a])

__exports = 'foo'
__exports = { foo: 'bar', bar: exports }
__exports.foo = {}
__exports.foo.__exports = {}
__exports.foo.__exports.bar = 'baz'
