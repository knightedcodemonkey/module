// Complex CJS fixture combining common patterns
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const url = require('node:url')

const dynamic = require('./values.cjs')

// module.exports and exports used together
module.exports.base = 'cjs'
exports.extra = 'kept'

// live binding style mutation
exports.counter = 0
exports.bump = () => {
  exports.counter += 1
  return exports.counter
}

// require.resolve usage
exports.resolved = require.resolve('./values.cjs')

// import.meta analogues via url/path
exports.url = url.pathToFileURL(__filename).href
exports.dirname = __dirname
exports.filename = __filename

// dynamic-ish require wrapped in a function
exports.load = name => require(join(__dirname, name))

// re-export style through aliasing
const alias = exports
alias.aliased = 'ok'

// computed key
const key = 'weird-key'
exports[key] = 'strange'

// ensure file read works
exports.file = readFileSync(join(__dirname, 'values.cjs')).toString().includes('commonjs')
exports.dynamic = dynamic
