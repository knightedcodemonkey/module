exports

const filename = exports
const other = exports.other ?? {}
const a = [exports, 'foo']
const string = new String(exports + 'foo')
const thing = { exports: 'foo' }

thing.exports = 'boo'

if (exports === process.argv[1]) {
  thing.exports = filename
  other.thing.exports = 'test'
}

exports + 'foo'

class Foo {
  exports = 'foo'

  constructor() {
    this.exports = 'foo'
  }

  get exports() {}
}
new Foo().exports

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
exports.obj = string
exports.foo = {}
exports.foo.exports = {}
exports.foo.exports.bar = 'baz'
