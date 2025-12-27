const mod = require('./values.cjs')
const { foo, commonjs: renamed } = require('./values.cjs')
require('./noop.cjs')

module.exports = {
  foo: mod.foo,
  renamed,
  cjs: mod.cjs,
}
