const [first] = require('./arrayValue.cjs')
const path = './arrayValue.cjs'
require(path)

// keep a runtime observable side effect
globalThis.__requireArrayFirst = first
