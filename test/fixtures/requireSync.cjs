function loadSync() {
  const mod = require('./values.cjs')
  return { foo: mod.foo, commonjs: mod.commonjs }
}

module.exports = { loadSync }
