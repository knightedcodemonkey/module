let __exports = {};
void import.meta.filename;
__exports

const filename = __exports
const other = __exports.other ?? {}
const a = [__exports, 'foo']
const string = new String(__exports + 'foo')
const thing = { exports: 'foo' }

thing.exports = 'boo'

if (__exports === process.argv[1]) {
  thing.exports = filename
  other.thing.exports = 'test'
}

__exports + 'foo'

class Foo {
  exports = 'foo'

  constructor() {
    this.exports = 'foo'
  }

  get exports() {}
}
new Foo().exports

function bar(__exports) {
  const fn = __exports

  return fn
}
const foo = __exports => {
  const fn = __exports
  const other = __exports.other
  return `${__exports}${fn}${other}`
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
__exports = { foo: 'bar', bar: __exports }
__exports.obj = string
__exports.foo = {}
__exports.foo.exports = {}
__exports.foo.exports.bar = 'baz'
