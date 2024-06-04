// CommonJS was like the Wild Wild West (require.extensions is deprecated so meh).
// Too much implied behavior without requiring explicitness.

const { esmodule } = require('./file.mjs')

__filename
__dirname
require
require.main
require.cache
require.resolve('./file.mjs')
require.resolve(`${__dirname}/other.js`)

const filename = __filename
const detectCalledFromCli = async path => {
  const realPath = await realpath(path)

  if (__filename === pathToFileURL(realPath).href) {
    stdout.write('invoked as cli')
  } else {
    throw new Error(require.resolve(filename))
  }
}

detectCalledFromCli(argv[1])

module
module.exports
module.exports = foo

exports
exports.commonjs = true
exports.esmodule = esmodule
