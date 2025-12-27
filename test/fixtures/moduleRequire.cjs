const mod = module.require('./values.cjs')
module.exports = { foo: mod.foo, commonjs: mod.commonjs }
