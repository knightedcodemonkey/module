const path = require('node:path')

module.exports = {
  here: __dirname,
  file: __filename,
  resolved: path.resolve(__dirname, 'globalsOnly.cjs'),
}
