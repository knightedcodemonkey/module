exports.foo = 'outer'

function run() {
  const innerExports = { foo: 'inner' }
  return innerExports.foo
}

module.exports = { foo: exports.foo, run }
