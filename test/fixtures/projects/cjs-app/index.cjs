const { basename, bump, value } = require('./lib.cjs')
const { join } = require('node:path')

const here = __dirname

module.exports.main = () => ({
  name: basename(__filename),
  bumped: bump(2),
  value,
  path: join(here, 'lib.cjs'),
})

if (require.main === module) {
  console.log(JSON.stringify(module.exports.main()))
}
