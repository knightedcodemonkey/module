const filename = __filename
const dirname = __dirname
const resolved = require.resolve('./values.cjs')

module.exports = { filename, dirname, resolved }
