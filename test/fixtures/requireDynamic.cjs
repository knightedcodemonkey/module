const { join } = require('node:path')
const target = './values.cjs'
const mod = require(target)

module.exports = {
  foo: mod.foo,
  commonjs: mod.commonjs,
  resolved: join('fixtures', 'values'),
}
