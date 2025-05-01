__dirname

const dirname = __dirname
const a = [__dirname, 'foo']
const obj = new String(__dirname + 'foo')

if (__dirname === process.argv[1]) {
  thing.__dirname = dirname
  other.thing.__dirname = 'test'
}

__dirname + 'foo'

function bar(__dirname) {
  const fn = __dirname

  return fn
}
const foo = __dirname => {
  const fn = __dirname
  return `${__dirname}${fn}`
}
;(arg => {
  return arg
})(__dirname)
const baz = function __dirname(arg, ...rest) {
  return rest
}

foo(__dirname)
foo(`${__dirname}foo`)
bar.call(this, __dirname)
baz.apply(null, [__dirname, a])

__dirname = 'foo'
__dirname = { foo: 'bar', bar: __dirname }
