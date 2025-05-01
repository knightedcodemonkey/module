__filename

const filename = __filename
const a = [__filename, 'foo']
const obj = new String(__filename + 'foo')

if (__filename === process.argv[1]) {
  thing.__filename = filename
  other.thing.__filename = 'test'
}

__filename + 'foo'

function bar(__filename) {
  const fn = __filename

  return fn
}
const foo = __filename => {
  const fn = __filename
  return `${__filename}${fn}`
}
;(arg => {
  return arg
})(__filename)
const baz = function __filename(arg, ...rest) {
  return rest
}

foo(__filename)
foo(`${__filename}foo`)
bar.call(this, __filename)
baz.apply(null, [__filename, a])

__filename = 'foo'
__filename = { foo: 'bar', bar: __filename }
