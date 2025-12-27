let fooVal
let commonjsVal

if (Date.now() > 0) {
  const mod = require('./values.cjs')
  fooVal = mod.foo
  commonjsVal = mod.commonjs
}

module.exports = { foo: fooVal, commonjs: commonjsVal }
