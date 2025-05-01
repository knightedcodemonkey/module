exports

const filename = exports
const other = exports.other ?? {}
const a = [exports, 'foo']
const obj = new String(exports + 'foo')
const thing = {}

thing.exports = 'boo'

if (exports === process.argv[1]) {
  thing.exports = filename
  other.thing.exports = 'test'
}

exports + 'foo'

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
})(exports)
const baz = function exports(arg, ...rest) {
  return rest
}

foo(exports)
foo(`${exports}foo`)
bar.call(this, exports)
baz.apply(null, [exports, a])

exports = 'foo'
exports = { foo: 'bar', bar: exports }
exports.obj = obj
exports.foo = {}
exports.foo.exports = {}
exports.foo.exports.bar = 'baz'
